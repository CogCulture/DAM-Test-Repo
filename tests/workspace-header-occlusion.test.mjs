import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the fixed workspace header fully occludes content scrolling underneath it", async () => {
  const source = await readFile(
    new URL("../app/components/App/Header.vue", import.meta.url),
    "utf8",
  );

  const headerClass = source.match(/<header class="([^"]*dam-workspace-header[^"]*)"/)?.[1] || "";
  assert.match(headerClass, /dark:bg-\[var\(--dam-panel-solid\)\]/u);
  assert.doesNotMatch(headerClass, /dark:bg-\[var\(--dam-panel\)\]/u);
});
