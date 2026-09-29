import tls from "node:tls";
import net from "node:net";
import nodemailer from "nodemailer";
import { logPipelineEvent } from "./auditLogger";

export interface ShareInvitationOptions {
  sender: {
    id: string;
    name?: string;
    email: string;
    organizationId?: string;
    departmentId?: string;
  };
  files: Array<{
    id: string;
    name: string;
    type?: string;
    contentType?: string;
    size?: number;
  }>;
  recipients: Array<{
    email: string;
    role?: string;
  }>;
  req?: any;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from?: string;
}

/**
 * Creates or gets a Nodemailer transporter configured for Google Workspace or custom SMTP.
 */
export function getMailTransporter(config: SmtpConfig) {
  const cleanPass = config.pass ? config.pass.replace(/\s+/g, "").trim() : "";
  const isGmail =
    config.host === "smtp.gmail.com" ||
    config.host.toLowerCase().includes("gmail") ||
    (config.user && config.user.endsWith("@gmail.com"));

  if (isGmail) {
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: config.user,
        pass: cleanPass,
      },
    });
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? config.port === 465,
    auth:
      config.user && cleanPass
        ? {
            user: config.user,
            pass: cleanPass,
          }
        : undefined,
    tls: {
      rejectUnauthorized: false,
    },
  });
}

/**
 * Low-level SMTP client using Node's standard net/tls modules for zero-dependency email dispatch.
 */
export async function sendRawSmtpEmail(
  config: SmtpConfig,
  mailOptions: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }
): Promise<boolean> {
  return new Promise((resolve) => {
    const isTls = config.secure ?? (config.port === 465);
    const host = config.host;
    const port = config.port;

    let socket: net.Socket;
    let resolved = false;

    const finish = (success: boolean) => {
      if (!resolved) {
        resolved = true;
        resolve(success);
      }
    };

    const onConnect = () => {
      let step = 0;
      let buffer = "";

      const sendCmd = (cmd: string) => {
        if (!socket.destroyed) {
          socket.write(cmd + "\r\n");
        }
      };

      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\r\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line) continue;
          const code = parseInt(line.substring(0, 3), 10);

          if (step === 0 && code === 220) {
            step = 1;
            sendCmd(`EHLO ${host}`);
          } else if (step === 1 && code === 250) {
            if (config.user && config.pass) {
              step = 2;
              sendCmd("AUTH LOGIN");
            } else {
              step = 4;
              sendCmd(`MAIL FROM:<${mailOptions.from}>`);
            }
          } else if (step === 2 && code === 334) {
            step = 3;
            sendCmd(Buffer.from(config.user || "").toString("base64"));
          } else if (step === 3 && code === 334) {
            step = 4;
            sendCmd(Buffer.from(config.pass || "").toString("base64"));
          } else if (step === 4 && (code === 235 || code === 250)) {
            step = 5;
            sendCmd(`RCPT TO:<${mailOptions.to}>`);
          } else if (step === 5 && code === 250) {
            step = 6;
            sendCmd("DATA");
          } else if (step === 6 && code === 354) {
            step = 7;
            const boundary = `----=_Part_DAM_${Date.now()}`;
            const mime = [
              `From: ${mailOptions.from}`,
              mailOptions.replyTo ? `Reply-To: ${mailOptions.replyTo}` : null,
              `To: ${mailOptions.to}`,
              `Subject: ${mailOptions.subject}`,
              `MIME-Version: 1.0`,
              `Content-Type: multipart/alternative; boundary="${boundary}"`,
              ``,
              `--${boundary}`,
              `Content-Type: text/plain; charset=UTF-8`,
              `Content-Transfer-Encoding: 7bit`,
              ``,
              mailOptions.text,
              ``,
              `--${boundary}`,
              `Content-Type: text/html; charset=UTF-8`,
              `Content-Transfer-Encoding: 7bit`,
              ``,
              mailOptions.html || mailOptions.text,
              ``,
              `--${boundary}--`,
              `.`
            ].filter(Boolean).join("\r\n");
            sendCmd(mime);
          } else if (step === 7 && code === 250) {
            step = 8;
            sendCmd("QUIT");
            finish(true);
            try { socket.end(); } catch {}
          }
        }
      });
    };

    try {
      if (isTls) {
        socket = tls.connect(port, host, { rejectUnauthorized: false }, onConnect);
      } else {
        socket = net.connect(port, host, onConnect);
      }

      socket.on("error", (err) => {
        console.warn(`[SMTP Mailer Notice] ${err.message}`);
        finish(false);
      });

      socket.setTimeout(6000, () => {
        try { socket.destroy(); } catch {}
        finish(false);
      });
    } catch (e: any) {
      console.warn(`[SMTP Dispatch Notice] ${e.message}`);
      finish(false);
    }
  });
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return "Unknown size";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Utility to send email notifications over SMTP when DAM resources are shared with team members.
 */
export async function sendShareInvitationEmails(options: ShareInvitationOptions) {
  const { sender, files, recipients } = options;
  if (!recipients || !recipients.length || !files || !files.length) {
    return { sent: 0 };
  }

  const senderName = sender.name || sender.email;
  const fileNames = files.map((f) => f.name).join(", ");
  const fileCount = files.length;
  const itemLabel = fileCount === 1 ? `"${files[0].name}"` : `${fileCount} assets (${fileNames})`;

  const appBaseUrl = process.env.APP_BASE_URL
    || (options.req ? `${options.req.headers["x-forwarded-proto"] || "http"}://${options.req.headers.host}` : "http://localhost:3000");

  const smtpConfig: SmtpConfig = {
    host: process.env.SMTP_HOST || "mail.cogculture.agency",
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    secure: process.env.SMTP_SECURE !== "false",
    user: process.env.SMTP_USER || process.env.SMTP_EMAIL || "notifications@cogculture.agency",
    pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "",
    from: process.env.SMTP_FROM || `DAM Resource Share <notifications@cogculture.agency>`,
  };

  const results = [];

  for (const recipient of recipients) {
    const recipientEmail = recipient.email.trim().toLowerCase();
    const isCogCultureAgency = recipientEmail.includes("cogculture.agency");
    const accessRole = recipient.role || "viewer";
    const accessUrl = `${appBaseUrl}/org/shared`;

    const emailSubject = `[DAM Resource Share] ${senderName} shared ${fileCount === 1 ? files[0].name : `${fileCount} resources`} with you`;
    
    // Build detailed file information breakdown
    const fileListDetailsText = files
      .map((f, idx) => `${idx + 1}. ${f.name} (${formatFileSize(f.size)}${f.contentType ? ` - ${f.contentType}` : ""})`)
      .join("\n");

    const fileListDetailsHtml = files
      .map(
        (f) => `
        <li style="margin-bottom: 8px; color: #e2e8f0; font-size: 14px;">
          <strong style="color: #818cf8;">${f.name}</strong> 
          <span style="color: #94a3b8; font-size: 12px;">(${formatFileSize(f.size)}${f.contentType ? ` &bull; ${f.contentType}` : ""})</span>
        </li>`
      )
      .join("");

    const emailTextBody = `Hello,

${senderName} (${sender.email}) has shared DAM resource(s) with you (${recipientEmail}):

Access Granted: ${accessRole.toUpperCase()}

Shared Resource Details:
${fileListDetailsText}

Access Shared Resource(s):
${accessUrl}

Best regards,
CogCulture Agency DAM Workspace`;

    const emailHtmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; background-color: #0f172a; color: #f8fafc; border-radius: 16px; border: 1px solid #1e293b;">
        <div style="margin-bottom: 20px; text-align: center;">
          <h2 style="color: #6366f1; margin: 0 0 6px 0; font-size: 22px;">CogCulture Agency DAM</h2>
          <p style="color: #94a3b8; font-size: 13px; margin: 0;">Resource Sharing Notification</p>
        </div>
        <div style="background-color: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 24px; border: 1px solid #334155;">
          <p style="margin: 0 0 14px 0; font-size: 15px; line-height: 1.5;">
            <strong style="color: #f1f5f9;">${senderName}</strong> (<span style="color: #cbd5e1;">${sender.email}</span>) shared ${fileCount === 1 ? 'a resource' : `${fileCount} resources`} with you:
          </p>
          <ul style="margin: 0 0 16px 0; padding-left: 20px; background-color: #0f172a; padding: 14px 20px; border-radius: 8px; border-left: 4px solid #6366f1; list-style-type: square;">
            ${fileListDetailsHtml}
          </ul>
          <p style="margin: 10px 0 0 0; font-size: 13px; color: #94a3b8;">
            Access Role: <span style="color: #34d399; font-weight: 700; text-transform: uppercase;">${accessRole}</span>
          </p>
        </div>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${accessUrl}" style="display: inline-block; background-color: #6366f1; color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 10px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
            Access Shared Resource(s)
          </a>
        </div>
        <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;" />
        <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">
          Direct Link: <a href="${accessUrl}" style="color: #818cf8; word-break: break-all;">${accessUrl}</a>
        </p>
      </div>
    `;

    console.log(`[Share Mailer] Preparing SMTP dispatch for recipient: ${recipientEmail} from ${sender.email}`);

    let sentViaSmtp = false;
    const fromAddress = process.env.SMTP_FROM || `"${senderName} via DAM" <${smtpConfig.user}>`;
    const replyToAddress = `"${senderName}" <${sender.email}>`;

    try {
      if (smtpConfig.user && smtpConfig.pass) {
        const transporter = getMailTransporter(smtpConfig);
        await transporter.sendMail({
          from: fromAddress,
          replyTo: replyToAddress,
          to: recipientEmail,
          subject: emailSubject,
          text: emailTextBody,
          html: emailHtmlBody,
        });
        sentViaSmtp = true;
        console.log(`[Share Mailer] Sent resource sharing email to ${recipientEmail} via Nodemailer.`);
      } else {
        sentViaSmtp = await sendRawSmtpEmail(smtpConfig, {
          from: fromAddress,
          replyTo: replyToAddress,
          to: recipientEmail,
          subject: emailSubject,
          text: emailTextBody,
          html: emailHtmlBody,
        });
      }
    } catch (err: any) {
      console.warn(`[Share Mailer Error] Nodemailer failed: ${err.message}. Trying raw SMTP fallback...`);
      try {
        sentViaSmtp = await sendRawSmtpEmail(smtpConfig, {
          from: fromAddress,
          replyTo: replyToAddress,
          to: recipientEmail,
          subject: emailSubject,
          text: emailTextBody,
          html: emailHtmlBody,
        });
      } catch (e: any) {
        console.warn(`[Share Mailer Raw Fallback Error] ${e.message}`);
      }
    }

    // Log pipeline audit event
    if (sender.organizationId) {
      await logPipelineEvent({
        organizationId: sender.organizationId,
        departmentId: sender.departmentId || null,
        fileId: files[0].id,
        eventType: "resource_shared",
        stage: "stage_0",
        status: "info",
        details: {
          recipientEmail,
          isCogCultureAgency,
          senderEmail: sender.email,
          fileCount,
          fileNames,
          accessRole,
          sentViaSmtp,
        },
      }).catch(() => undefined);
    }

    results.push({ email: recipientEmail, sent: true, sentViaSmtp });
  }

  return { sent: results.length, results };
}

export interface OrgInviteEmailOptions {
  sender: { name?: string; email: string };
  organizationName: string;
  recipientEmail: string;
  inviteUrl: string;
}

export async function sendOrgInviteEmail(options: OrgInviteEmailOptions): Promise<boolean> {
  const { sender, organizationName, recipientEmail, inviteUrl } = options;
  const senderName = sender.name || sender.email.split("@")[0];

  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const smtpSecure = process.env.SMTP_SECURE !== "false";
  const smtpUser = (process.env.SMTP_USER || process.env.SMTP_EMAIL || "").trim();
  const smtpPass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "").replace(/\s+/g, "").trim();

  if (!smtpUser || !smtpPass) {
    console.warn(`[Org Invite Mailer] SMTP credentials not configured (SMTP_USER/SMTP_PASS in .env).`);
    return false;
  }

  const smtpConfig: SmtpConfig = {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    user: smtpUser,
    pass: smtpPass,
  };

  // Use onboarded user's identity dynamically
  const fromAddress = process.env.SMTP_FROM || `"${senderName} via ${organizationName}" <${smtpUser}>`;
  const replyToAddress = `"${senderName}" <${sender.email}>`;

  const emailSubject = `${senderName} invited you to join ${organizationName} on DAM Portal`;
  const emailTextBody = `Hello,

${senderName} (${sender.email}) has invited you to join ${organizationName} on DAM Portal.

Click the link below to accept the invitation and access the organization workspace:
${inviteUrl}

Invited by: ${senderName} (${sender.email})
If you did not expect this invitation, you can ignore this email.`;

  const emailHtmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #09090b; color: #f4f4f5; border-radius: 16px; border: 1px solid #27272a;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; padding: 12px 20px; border-radius: 12px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3);">
          <span style="font-size: 22px; font-weight: 800; color: #818cf8; letter-spacing: 0.05em;">DAM PORTAL</span>
        </div>
      </div>
      <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; text-align: center; color: #ffffff;">
        You're invited to join <span style="color: #818cf8;">${organizationName}</span>
      </h2>
      <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; text-align: center; margin-bottom: 24px;">
        <strong style="color: #f4f4f5;">${senderName}</strong> (<span style="color: #cbd5e1;">${sender.email}</span>) has invited you to collaborate and access assets in <strong>${organizationName}</strong>.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${inviteUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6366f1, #4f46e5); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; border-radius: 12px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
          Accept Invitation &amp; Join
        </a>
      </div>
      <p style="font-size: 12px; color: #71717a; text-align: center; margin-top: 32px; border-top: 1px solid #27272a; padding-top: 16px;">
        Or copy and paste this link into your browser:<br>
        <a href="${inviteUrl}" style="color: #818cf8; word-break: break-all;">${inviteUrl}</a>
      </p>
    </div>
  `;

  console.log(`[Org Invite Mailer] Dispatching invite email for ${recipientEmail} from ${sender.email} (${senderName}) to join ${organizationName}`);

  try {
    const transporter = getMailTransporter(smtpConfig);
    const info = await transporter.sendMail({
      from: fromAddress,
      replyTo: replyToAddress,
      to: recipientEmail,
      subject: emailSubject,
      text: emailTextBody,
      html: emailHtmlBody,
    });
    console.log(`[Org Invite Mailer] Email sent successfully to ${recipientEmail}:`, info.messageId);
    return true;
  } catch (err: any) {
    console.warn(`[Org Invite Mailer Error] Nodemailer failed: ${err.message}. Trying raw SMTP fallback...`);
    try {
      const rawSent = await sendRawSmtpEmail(smtpConfig, {
        from: fromAddress,
        replyTo: replyToAddress,
        to: recipientEmail,
        subject: emailSubject,
        text: emailTextBody,
        html: emailHtmlBody,
      });
      return rawSent;
    } catch (e: any) {
      console.warn(`[Org Invite Mailer Raw Fallback Error] ${e.message}`);
      return false;
    }
  }
}
