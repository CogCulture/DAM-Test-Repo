import assert from "node:assert/strict";
import test from "node:test";

import { mergeGDriveListing } from "../shared/utils/gdrive-listing.ts";

const driveFile = {
  id: "drive-1",
  name: "uploaded.pdf",
  type: "pdf",
  storageProvider: "gdrive",
};

const driveMirror = {
  id: "drive-1",
  name: "uploaded.pdf",
  type: "pdf",
  storageProvider: "local",
  assetMetadata: {
    source: "google-drive",
    googleDriveFileId: "drive-1",
    storageProvider: "gdrive",
  },
};

const localFile = {
  id: "local-1",
  name: "local.pdf",
  type: "pdf",
  storageProvider: "local",
  assetMetadata: { source: "local" },
};

test("keeps uploaded Drive mirrors visible while the Drive listing is unavailable", () => {
  assert.deepEqual(
    mergeGDriveListing({
      driveFiles: [],
      localFiles: [localFile, driveMirror],
      driveAvailable: false,
    }),
    [localFile, driveMirror],
  );
});

test("deduplicates an available Drive file against its local mirror", () => {
  assert.deepEqual(
    mergeGDriveListing({
      driveFiles: [driveFile],
      localFiles: [localFile, driveMirror],
      driveAvailable: true,
    }),
    [
      localFile,
      {
        ...driveFile,
        assetMetadata: driveMirror.assetMetadata,
      },
    ],
  );
});

test("hides a legacy parsed-file mirror when the real Drive artifact is available", () => {
  const parsedDriveFile = {
    id: "drive-parsed-1",
    name: "quarterly-report_anthropic_parsed.md",
    type: "document",
    storageProvider: "gdrive",
  };
  const legacyMirror = {
    id: "random-local-id",
    name: parsedDriveFile.name,
    path: `gdrive/parent-folder/${parsedDriveFile.name}`,
    type: "document",
    storageProvider: "local",
    assetMetadata: null,
  };

  assert.deepEqual(
    mergeGDriveListing({
      driveFiles: [parsedDriveFile],
      localFiles: [legacyMirror],
      driveAvailable: true,
    }),
    [
      {
        ...parsedDriveFile,
        assetMetadata: {
          source: "google-drive",
          googleDriveFileId: parsedDriveFile.id,
          storageProvider: "gdrive",
        },
      },
    ],
  );
});
