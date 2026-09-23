import { retryDeadLetterJob } from "~~/server/utils/ingestionQueue";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ fileId?: string }>(event);
  const fileId = String(body?.fileId || "").trim();

  if (!fileId) {
    throw createError({ status: 400, message: "fileId is required to retry DLQ job." });
  }

  const retried = await retryDeadLetterJob(fileId);
  if (!retried) {
    throw createError({ status: 404, message: `Job for file ${fileId} not found in Dead Letter Queue.` });
  }

  return {
    success: true,
    message: `Re-enqueued job for file ${fileId} from Dead Letter Queue.`,
  };
});
