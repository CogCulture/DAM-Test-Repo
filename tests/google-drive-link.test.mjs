import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGoogleDrivePublicUrl,
  parseGoogleDriveFileLink,
} from "../shared/utils/google-drive-link.ts";

test("parses a public Google Drive file link", () => {
  assert.deepEqual(
    parseGoogleDriveFileLink("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing"),
    { id: "1AbCdEfGhIjKlMnOp", kind: "file" },
  );
});

test("parses Google Docs links as exportable files", () => {
  assert.deepEqual(
    parseGoogleDriveFileLink("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit"),
    { id: "1AbCdEfGhIjKlMnOp", kind: "document" },
  );
});

test("rejects Google Drive folders because DAM link import accepts files only", () => {
  assert.throws(
    () => parseGoogleDriveFileLink("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp"),
    /file link/i,
  );
});

test("rejects lookalike non-Google hosts", () => {
  assert.throws(
    () => parseGoogleDriveFileLink("https://drive.google.com.example.com/file/d/1AbCdEfGhIjKlMnOp/view"),
    /Google Drive/i,
  );
});

test("builds the correct public export URL for a Google document", () => {
  assert.equal(
    buildGoogleDrivePublicUrl({ id: "1AbCdEfGhIjKlMnOp", kind: "document" }),
    "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/export?format=docx",
  );
});

