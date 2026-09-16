import { getDeadLetterJobs, retryDeadLetterJob } from "~~/server/utils/ingestionQueue";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const action = (query.action as string) || "list";
  const fileId = query.fileId as string;

  if (action === "retry") {
    if (!fileId) {
      throw createError({
        statusCode: 400,
        statusMessage: "Missing fileId for retry action.",
      });
    }

    const retried = await retryDeadLetterJob(fileId);
    if (!retried) {
      throw createError({
        statusCode: 404,
        statusMessage: `Job for fileId ${fileId} not found in Dead Letter Queue.`,
      });
    }

    return {
      success: true,
      fileId,
      message: `Job ${fileId} successfully removed from DLQ and re-enqueued for ingestion.`,
    };
  }

  // Default: list all dead-letter jobs
  const jobs = getDeadLetterJobs();
  return {
    success: true,
    count: jobs.length,
    jobs,
  };
});
