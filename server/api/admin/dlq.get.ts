import { getDeadLetterJobs } from "~~/server/utils/ingestionQueue";

export default defineEventHandler(async (event) => {
  // Return current in-memory Dead Letter Queue records
  const dlqJobs = getDeadLetterJobs();
  return {
    success: true,
    count: dlqJobs.length,
    jobs: dlqJobs,
  };
});
