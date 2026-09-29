import { useDrizzle } from "~~/server/utils/drizzle";
import { users } from "~~/server/database/schema";

export default defineEventHandler(async (event) => {
  const db = useDrizzle();
  const user = await db.select().from(users).limit(1).then((res) => res[0]);
  if (!user) {
    throw createError({ statusCode: 404, message: "No active user found in database." });
  }
  await setUserSession(event, { user });
  return sendRedirect(event, "/org");
});
