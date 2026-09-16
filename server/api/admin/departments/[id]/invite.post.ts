import { eq, and } from "drizzle-orm";
import { organizations, orgDepartments, deptInvites } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { ulid } from "ulidx";
import { randomUUID } from "crypto";
import { getApprovedUser } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await getApprovedUser(event);
  
  if (user.role !== "admin") {
    throw createError({ status: 403, message: "Forbidden: Admins only." });
  }


  const deptId = getRouterParam(event, "id");
  if (!deptId) {
    throw createError({ status: 400, message: "Department ID is required." });
  }

  const body = await readBody(event);
  if (!body || !body.email || typeof body.email !== "string" || !body.email.trim()) {
    throw createError({ status: 400, message: "Valid email is required." });
  }

  const db = useDrizzle();

  // Validate department belongs to the admin's organization
  const [dept] = await db
    .select()
    .from(orgDepartments)
    .where(and(eq(orgDepartments.id, deptId), eq(orgDepartments.organizationId, user.organizationId)));

  if (!dept) {
    throw createError({ status: 404, message: "Department not found in your organization." });
  }

  const email = body.email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw createError({ status: 400, message: "A valid email address (e.g. manager@company.com) is required." });
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const inviteId = ulid();
  await db.insert(deptInvites).values({
    id: inviteId,
    organizationId: user.organizationId,
    departmentId: deptId,
    email,
    token,
    status: "pending",
    expiresAt,
    createdAt: new Date(),
  });

  // Dynamically resolve active request host and protocol
  const requestHost = getRequestHeader(event, "x-forwarded-host") || getRequestHeader(event, "host") || "localhost:3000";
  const protocol = getRequestHeader(event, "x-forwarded-proto") || (requestHost.includes("localhost") || requestHost.includes("127.0.0.1") ? "http" : "https");
  const host = process.env.NUXT_PUBLIC_SITE_URL || `${protocol}://${requestHost}`;
  const inviteUrl = `${host}/auth/invite?token=${token}`;

  return {
    success: true,
    inviteId,
    inviteUrl,
  };
});
