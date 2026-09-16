import { processIngestionJob, IngestionJobPayload } from "~~/server/utils/ingestionQueue";

/**
 * Internal Queue Consumer HTTP endpoint for queue triggers and automated testing.
 * Accepts job payload or array of job payloads, processes them using processIngestionJob,
 * and returns execution results.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<IngestionJobPayload | IngestionJobPayload[]>(event);
  const jobs = Array.isArray(body) ? body : [body];

  const results = [];
  for (const job of jobs) {
    try {
      const result = await processIngestionJob(job);
      results.push(result);
    } catch (error: any) {
      results.push({
        success: false,
        fileId: job?.fileId || "unknown",
        status: "failed",
        error: error?.message || String(error),
      });
    }
  }

  return {
    processed: results.length,
    results,
  };
});
