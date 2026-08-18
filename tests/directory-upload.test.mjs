import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseDirectory,
  chooseUploadSource,
  readDirectoryHandle,
} from "../shared/utils/directory-upload.ts";

const fileHandle = (name) => ({
  kind: "file",
  name,
  async getFile() {
    return { name };
  },
});

const directoryHandle = (name, children = []) => ({
  kind: "directory",
  name,
  async *values() {
    yield* children;
  },
});

test("directory selection preserves nested files and empty directories", async () => {
  const root = directoryHandle("Campaign", [
    fileHandle("Brief.docx"),
    directoryHandle("Assets", [
      fileHandle("Hero.png"),
      directoryHandle("Empty", []),
    ]),
  ]);

  const selection = await readDirectoryHandle(root);

  assert.deepEqual(selection.directories, [
    "Campaign",
    "Campaign/Assets",
    "Campaign/Assets/Empty",
  ]);
  assert.deepEqual(selection.files.map((file) => file.customPath), [
    "Campaign/Brief.docx",
    "Campaign/Assets/Hero.png",
  ]);
});

test("canceling the directory picker returns no selection", async () => {
  const pickerWindow = {
    async showDirectoryPicker() {
      throw new DOMException("The user aborted a request", "AbortError");
    },
  };

  assert.equal(await chooseDirectory(pickerWindow), null);
});

test("non-cancellation picker errors remain visible", async () => {
  const pickerWindow = {
    async showDirectoryPicker() {
      throw new Error("Permission service unavailable");
    },
  };

  await assert.rejects(
    () => chooseDirectory(pickerWindow),
    /Permission service unavailable/u,
  );
});

test("folder mode imports the selected directory tree without opening the file input", async () => {
  let fallbackOpened = false;
  const selection = await chooseUploadSource({
    mode: "folder",
    pickerWindow: {
      async showDirectoryPicker() {
        return directoryHandle("Campaign", [
          fileHandle("Brief.docx"),
          directoryHandle("Assets", [fileHandle("Hero.png")]),
        ]);
      },
    },
    openFallback: () => {
      fallbackOpened = true;
    },
  });

  assert.equal(fallbackOpened, false);
  assert.deepEqual(selection?.directories, ["Campaign", "Campaign/Assets"]);
  assert.deepEqual(selection?.files.map((file) => file.customPath), [
    "Campaign/Brief.docx",
    "Campaign/Assets/Hero.png",
  ]);
});

test("file mode and unsupported browsers use the input fallback", async () => {
  const openedModes = [];
  const pickerWindow = {
    async showDirectoryPicker() {
      throw new Error("Directory picker must not run in file mode");
    },
  };

  assert.equal(await chooseUploadSource({
    mode: "files",
    pickerWindow,
    openFallback: () => openedModes.push("files"),
  }), null);
  assert.equal(await chooseUploadSource({
    mode: "folder",
    pickerWindow: {},
    openFallback: () => openedModes.push("folder"),
  }), null);
  assert.deepEqual(openedModes, ["files", "folder"]);
});
