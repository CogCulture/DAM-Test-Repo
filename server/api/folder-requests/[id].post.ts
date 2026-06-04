import {
  getFolderRequestById,
  updateFolderRequestStatus,
  ensurePath,
} from "~~/server/utils/db";
import { requireDeptHead } from "~~/server/utils/permission";

export default defineEventHandler(async (event) => {
  const user = await requireDeptHead(event);
  const { id } = getRouterParams(event);
  const { action, reviewNote } = await readBody<{
    action: "approve" | "reject";
    reviewNote?: string;
  }>(event);

  if (!["approve", "reject"].includes(action)) {
    throw createError({ status: 400, message: "Invalid action." });
  }

  const request = await getFolderRequestById(id);
  if (!request) {
    throw createError({ status: 404, message: "Folder request not found." });
  }
  if (request.status !== "pending") {
    throw createError({ status: 400, message: "Request already reviewed." });
  }

  // @ts-ignore
  const actorRole = user.role as string;
  if (actorRole !== "dept_head") {
    throw createError({ status: 403, message: "Only Department Heads can review folder requests." });
  }
  if (request.departmentId !== user.departmentId) {
    throw createError({ status: 403, message: "Cannot review requests outside your department." });
  }

  // @ts-ignore
  await updateFolderRequestStatus(id, action === "approve" ? "approved" : "rejected", user.id, reviewNote);

  // If approved, actually create the folder in the shared bucket
  if (action === "approve") {
    let parentPathPart = request.parentId;
    if (parentPathPart.startsWith("dept_")) {
      parentPathPart = parentPathPart.substring(5);
    }
    const folderPath = request.parentId === "root"
      ? `${request.bucketName}/${request.folderName}`
      : `${request.bucketName}/${parentPathPart}/${request.folderName}`;

    await ensurePath(request.bucketName, folderPath, request.requestedBy, false);
  }

  return { success: true, action };
});
