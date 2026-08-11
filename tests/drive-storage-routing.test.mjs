import assert from "node:assert/strict";
import test from "node:test";

test("Drive organizations always upload into the connected Google Drive", async () => {
  const { resolveUploadStorageTarget } = await import("../shared/utils/drive-storage.ts");

  assert.equal(resolveUploadStorageTarget({ orgType: "gdrive" }), "gdrive");
  assert.equal(resolveUploadStorageTarget({ orgType: "s3" }), "local");
});

test("an organization id in the DAM route resolves to the connected Drive root", async () => {
  const { resolveDriveRouteFolderId } = await import("../shared/utils/drive-storage.ts");

  assert.equal(resolveDriveRouteFolderId({
    idParam: ["org_123"],
    organizationId: "org_123",
  }), "root");
  assert.equal(resolveDriveRouteFolderId({
    idParam: ["drive-folder-id"],
    organizationId: "org_123",
  }), "drive-folder-id");
  assert.equal(resolveDriveRouteFolderId({
    idParam: undefined,
    organizationId: "org_123",
  }), "root");
});

test("Drive organizations cannot bypass Drive through the local upload API", async () => {
  const { isUploadRouteAllowed } = await import("../shared/utils/drive-storage.ts");

  assert.equal(isUploadRouteAllowed({ orgType: "gdrive", requestedTarget: "local" }), false);
  assert.equal(isUploadRouteAllowed({ orgType: "gdrive", requestedTarget: "gdrive" }), true);
  assert.equal(isUploadRouteAllowed({ orgType: "s3", requestedTarget: "local" }), true);
});
