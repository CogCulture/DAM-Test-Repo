import { randomUUID } from "crypto";
import { ulid } from "ulidx";
import { eq } from "drizzle-orm";
import { getApprovedUser } from "~~/server/utils/permission";
import { useDrizzle } from "~~/server/utils/drizzle";
import { organizations, orgDepartments, deptInvites } from "~~/server/database/schema";
import { sendOrgInviteEmail } from "~~/server/utils/mailer";
import { getOrgDepartments } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
  const user = await getApprovedUser(event);

  const body = await readBody<{ email?: string; departmentId?: string }>(event);
  if (!body || !body.email || typeof body.email !== "string" || !body.email.trim()) {
    throw createError({ status: 400, message: "Valid email address is required." });
  }

  const email = body.email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw createError({ status: 400, message: "A valid email address (e.g. colleague@company.com) is required." });
  }

  const db = useDrizzle();
  const orgId = (user as any).organizationId || "org_default";

  // Fetch Organization Name
  let orgName = "Organization";
  if (orgId) {
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (org?.name) orgName = org.name;
  }

  // Determine Target Department
  let targetDeptId = body.departmentId || (user as any).departmentId;
  if (!targetDeptId) {
    const depts = await getOrgDepartments(orgId);
    targetDeptId = depts?.[0]?.id || "global";
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const inviteId = ulid();

  await db.insert(deptInvites).values({
    id: inviteId,
    organizationId: orgId,
    departmentId: targetDeptId,
    email,
    token,
    status: "pending",
    expiresAt,
    createdAt: new Date(),
  });

  // Resolve invite URL host
  const requestHost = getRequestHeader(event, "x-forwarded-host") || getRequestHeader(event, "host") || "localhost:3000";
  const protocol = getRequestHeader(event, "x-forwarded-proto") || (requestHost.includes("localhost") || requestHost.includes("127.0.0.1") ? "http" : "https");
  const host = process.env.NUXT_PUBLIC_SITE_URL || `${protocol}://${requestHost}`;
  const inviteUrl = `${host}/auth/invite?token=${token}`;

  // Dispatch SMTP Email
  const sentViaSmtp = await sendOrgInviteEmail({
    sender: { name: user.name, email: user.email },
    organizationName: orgName,
    recipientEmail: email,
    inviteUrl,
  });

  return {
    success: true,
    email,
    inviteUrl,
    sentViaSmtp,
    message: sentViaSmtp
      ? `Invitation email successfully sent to ${email} via SMTP!`
      : `Invitation created! Share link: ${inviteUrl}`,
  };
});
