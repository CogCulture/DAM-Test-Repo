import { useDrizzle } from "~~/server/utils/drizzle";
import { users, organizations, buckets } from "~~/server/database/schema";
import { eq } from "drizzle-orm";
import { ulid } from "ulidx";

export default defineEventHandler(async (event) => {
  const db = useDrizzle();
  const now = new Date();

  // Find or create default local org
  let org = (await db.select().from(organizations).limit(1))[0];
  if (!org) {
    const orgId = ulid();
    await db.insert(organizations).values({
      id: orgId,
      name: "Default Local Org",
      status: "active",
      orgType: "s3",
      setupComplete: true,
      createdAt: now,
      updatedAt: now,
    });
    org = (await db.select().from(organizations).where(eq(organizations.id, orgId)))[0];
  }

  // Find or create default local bucket
  let bucket = (await db.select().from(buckets).where(eq(buckets.name, "org")).limit(1))[0];
  if (!bucket) {
    await db.insert(buckets).values({
      id: ulid(),
      name: "org",
      organizationId: org.id,
      userId: "dev-admin-id",
      createdAt: now,
      updatedAt: now,
    });
  }

  // Find or create default dev admin user
  let user = (await db.select().from(users).where(eq(users.email, "admin@company.com")).limit(1))[0];
  if (!user) {
    const userId = "dev-admin-id";
    await db.insert(users).values({
      id: userId,
      email: "admin@company.com",
      name: "Dev Admin",
      role: "admin",
      organizationId: org.id,
      approvalStatus: "active",
      createdAt: now,
    });
    user = (await db.select().from(users).where(eq(users.id, userId)))[0];
  } else if (!user.organizationId || user.approvalStatus !== "active") {
    await db
      .update(users)
      .set({
        organizationId: org.id,
        approvalStatus: "active",
        role: "admin",
      })
      .where(eq(users.id, user.id));
    user = (await db.select().from(users).where(eq(users.id, user.id)))[0];
  }

  // Set user session
  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      approvalStatus: "active",
      avatar: user.avatar,
    },
  });

  return { success: true, redirect: "/org" };
});
