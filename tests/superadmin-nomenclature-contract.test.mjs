import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../app/pages/superadmin/organizations/[orgId].vue", import.meta.url),
  "utf8",
);
const editor = await readFile(
  new URL("../app/components/NomenclatureEditor.vue", import.meta.url),
  "utf8",
);
const getRoute = await readFile(
  new URL("../server/api/superadmin/organizations/[orgId]/nomenclature/[dept].get.ts", import.meta.url),
  "utf8",
);
const putRoute = await readFile(
  new URL("../server/api/superadmin/organizations/[orgId]/nomenclature/[dept].put.ts", import.meta.url),
  "utf8",
);

test("the superadmin organization portal exposes department nomenclature controls", () => {
  assert.match(page, /NomenclatureEditor/u);
  assert.match(page, /selectedNomenclatureDepartment/u);
  assert.match(editor, /enforceNomenclature/u);
});

test("superadmin nomenclature APIs are organization and department scoped", () => {
  for (const source of [getRoute, putRoute]) {
    assert.match(source, /requireSuperAdmin/u);
    assert.match(source, /organizationId/u);
    assert.match(source, /departmentId/u);
    assert.match(source, /Organization department not found/u);
  }
  assert.match(putRoute, /normalizeNomenclatureSegments/u);
  assert.match(putRoute, /normalizeAllowedExtensions/u);
  assert.match(putRoute, /upsertGDriveRules/u);
});
