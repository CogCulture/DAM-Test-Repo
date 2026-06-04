import { useDrizzle } from "~~/server/utils/drizzle";
import { organizations } from "~~/server/database/schema";

export default defineEventHandler(async (event) => {
  // Return all organizations
  const list = await useDrizzle()
    .select()
    .from(organizations);
  return list;
});
