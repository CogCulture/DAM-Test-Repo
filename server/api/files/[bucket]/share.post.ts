import { shareFiles } from "~~/server/utils/db";
import { requireFileDepartmentAccess, verifyBucket } from "~~/server/utils/permission";
import { sendShareInvitationEmails } from "~~/server/utils/mailer";
import { useDrizzle } from "~~/server/utils/drizzle";
import { files as filesTable } from "~~/server/database/schema";
import { inArray } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const { bucket, user } = await verifyBucket(event, "canShare");
  const { files, members } = await readBody(event);
  if (!Array.isArray(files) || !files.length) {
    throw createError({ status: 400, message: "Invalid file selection." });
  }
  if (!Array.isArray(members) || !members.length) {
    throw createError({ status: 400, message: "No email recipients provided to share with." });
  }
  for (const file of files) await requireFileDepartmentAccess(user, file?.id);

  const response = await shareFiles(bucket.name, files, members, user);

  // Fetch complete metadata for files to enrich the email body
  const fileIds = files.map((f: any) => f?.id).filter(Boolean);
  let enrichedFiles = files;
  if (fileIds.length > 0) {
    try {
      const dbFiles = await useDrizzle()
        .select({
          id: filesTable.id,
          name: filesTable.name,
          type: filesTable.type,
          contentType: filesTable.contentType,
          size: filesTable.size,
        })
        .from(filesTable)
        .where(inArray(filesTable.id, fileIds));

      if (dbFiles.length > 0) {
        enrichedFiles = dbFiles as any;
      }
    } catch {
      // Fallback to original files array if DB query fails
    }
  }

  // Trigger share invitation emails to recipients (with SMTP dispatch for cogculture.agency)
  await sendShareInvitationEmails({
    sender: user as any,
    files: enrichedFiles,
    recipients: members,
    req: event.node.req,
  });

  return {
    status: "success",
    message: `Successfully shared ${files.length} resource(s) with ${members.length} team member(s). Invitation emails sent.`,
  };
});
