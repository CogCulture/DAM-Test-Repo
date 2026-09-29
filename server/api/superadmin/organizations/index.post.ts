import { requireSuperAdmin } from "~~/server/utils/superadmin";
import { createOrganization, getUserByEmail } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import { organizations, users } from "~~/server/database/schema";
import { eq } from "drizzle-orm";
import { ulid } from "ulidx";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);

  const body = await readBody<{
    name: string;
    orgType?: "s3" | "gdrive";
    adminEmail?: string;
  }>(event);

  const { name, orgType = "s3", adminEmail } = body || {};

  if (!name || !name.trim()) {
    throw createError({
      status: 400,
      message: "Organization / Client name is required.",
    });
  }

  const trimmedName = name.trim();

  // Check if organization name already exists
  const [existingOrg] = await useDrizzle()
    .select()
    .from(organizations)
    .where(eq(organizations.name, trimmedName));

  if (existingOrg) {
    throw createError({
      status: 400,
      message: `An organization with the name "${trimmedName}" already exists.`,
    });
  }

  // Create the organization
  const orgId = await createOrganization(trimmedName, orgType);

  // If client admin email is provided, assign or create the user as admin of the new org
  if (adminEmail && adminEmail.trim()) {
    const email = adminEmail.trim().toLowerCase();
    const existingUser = await getUserByEmail(email);

    if (existingUser) {
      await useDrizzle()
        .update(users)
        .set({
          organizationId: orgId,
          role: "admin",
          approvalStatus: "active",
        })
        .where(eq(users.id, existingUser.id));
    } else {
      const userId = ulid();
      await useDrizzle().insert(users).values({
        id: userId,
        email,
        name: email.split("@")[0],
        role: "admin",
        organizationId: orgId,
        approvalStatus: "active",
        createdAt: new Date(),
      });
    }
  }

  return {
    success: true,
    organizationId: orgId,
    name: trimmedName,
    message: `Organization "${trimmedName}" onboarded successfully.`,
  };
});
