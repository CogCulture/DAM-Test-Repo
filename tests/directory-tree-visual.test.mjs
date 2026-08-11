import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/components/App/DirectoryNode.vue", import.meta.url), "utf8");

test("nested directory rows use a clearly visible twenty-pixel hierarchy step", () => {
  assert.match(source, /\(level \* 20\) \+ 6/);
  assert.match(source, /\(\(level \+ 1\) \* 20\) \+ 34/g);
});

test("expanded folders group their descendants with a branch guide", () => {
  assert.match(source, /class="directory-branch relative ml-3 border-l border-\[var\(--dam-line\)\]/);
  assert.match(source, /bg-\[color-mix\(in_srgb,var\(--dam-panel-raised\)_35%,transparent\)\]/);
});
