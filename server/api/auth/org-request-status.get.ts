import { getVerifiedUser } from "~~/server/utils/permission";
import { useDrizzle } from "~~/server/utils/drizzle";
import { organizationRequests } from "~~/server/database/schema";
import { eq } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const user = await getVerifiedUser(event);

  const db = useDrizzle();
  const [request] = await db
    .select()
    .from(organizationRequests)
    .where(eq(organizationRequests.userId, user.id))
    .limit(1);

  return {
    hasRequest: !!request,
    status: request?.status ?? null,
    orgName: request?.orgName ?? null,
    orgType: request?.orgType ?? null,
    reviewNote: request?.reviewNote ?? null,
    createdAt: request?.createdAt ?? null,
  };
});
