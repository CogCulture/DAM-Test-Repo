import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the nomenclature page imports its custom composables for production bundles", async () => {
  const source = await readFile(new URL("../app/pages/admin/nomenclature.vue", import.meta.url), "utf8");

  assert.match(source, /import\s+\{\s*useRole\s*\}\s+from\s+["']~\/composables\/useRole["']/u);
  assert.match(source, /import\s+\{\s*useToast\s*\}\s+from\s+["']~\/composables\/useToast["']/u);
});
