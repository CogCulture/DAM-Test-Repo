import { createTaxonomy } from "~~/server/utils/db";
import { requireMinRole } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  // Only dept_head or admin can create taxonomy fields
  const user = await requireMinRole(event, "dept_head");
  const orgId = (user as any).organizationId || "org_default";

  const body = await readBody<{
    name: string;
    key: string;
    type: "text" | "select" | "multiselect";
    options?: string[];
    isRequired?: boolean;
    departmentId?: string;
  }>(event);

  if (!body.name || !body.key || !body.type) {
    throw createError({ status: 400, message: "name, key, and type are required." });
  }

  // Sanitize key: lowercase, no spaces
  const key = body.key.trim().toLowerCase().replace(/\s+/g, "_");

  // Admins can scope to a specific dept; dept_heads default to their own dept
  const role = (user as any).role;
  const departmentId =
    role === "admin"
      ? body.departmentId ?? null
      : (user as any).departmentId ?? null;

  try {
    const taxonomy = await createTaxonomy({
      organizationId: orgId,
      departmentId: departmentId ?? undefined,
      name: body.name.trim(),
      key,
      type: body.type,
      options: body.options,
      isRequired: body.isRequired ?? false,
    });
    return taxonomy;
  } catch (e: any) {
    // Unique constraint violation on (org, key)
    if (e?.message?.includes("UNIQUE")) {
      throw createError({ status: 409, message: `A taxonomy with key "${key}" already exists in your organization.` });
    }
    throw e;
  }
});
