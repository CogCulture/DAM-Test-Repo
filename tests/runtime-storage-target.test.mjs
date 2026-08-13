import assert from "node:assert/strict";
import test from "node:test";

import * as driveStorage from "../shared/utils/drive-storage.ts";

test("GCP runtime routes generated artifacts to local persistent storage", () => {
  assert.equal(typeof driveStorage.resolveRuntimeStorageTarget, "function");
  assert.equal(driveStorage.resolveRuntimeStorageTarget({
    DATABASE_PATH: "/var/lib/dam/database.sqlite",
    LOCAL_DAM_STORAGE_DIR: "/var/lib/dam/files",
  }), "local");
});

test("Cloudflare runtime keeps generated artifacts on hub storage", () => {
  assert.equal(typeof driveStorage.resolveRuntimeStorageTarget, "function");
  assert.equal(driveStorage.resolveRuntimeStorageTarget({}), "hub");
});
