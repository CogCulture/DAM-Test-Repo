import { getFiles } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
  // Simulate user and event context
  const mockEvent = {
    ...event,
    context: {
      ...event.context,
      params: {
        bucket: "org",
        id: "01KTTJ3VAV3G1ZHBRVZVB563FW"
      }
    }
  };
  
  // Override getQuery for this mock event by mocking h3's internal URL
  const mockEventWithQuery = Object.create(mockEvent);
  mockEventWithQuery.node = {
    req: {
      url: "/api/test-get-files?page=1&sortBy=name&order=asc"
    }
  };
  
  // Use known organization and user
  const userId = "ec7b7c7d-db85-4f40-87e9-2dbed6f2dd46"; 
  
  try {
    const files = await getFiles(mockEventWithQuery, userId);
    return { success: true, count: files.data.length, data: files.data };
  } catch (err) {
    return { success: false, error: err.message, stack: err.stack };
  }
});
