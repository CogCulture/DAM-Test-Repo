export type GDriveListEntry = {
  id: string;
  assetMetadata?: Record<string, any> | null;
  [key: string]: any;
};

export const mergeGDriveListing = (input: {
  driveFiles: GDriveListEntry[];
  localFiles: GDriveListEntry[];
  driveAvailable: boolean;
}): GDriveListEntry[] => {
  if (!input.driveAvailable) return [...input.localFiles];

  const isDriveMirror = (file: GDriveListEntry) =>
    file.assetMetadata?.source === "google-drive"
    || (typeof file.path === "string" && file.path.startsWith("gdrive/"));
  const mirrorFiles = input.localFiles.filter(isDriveMirror);
  const driveMirrors = new Map(
    mirrorFiles.map((file) => [file.assetMetadata?.googleDriveFileId || file.id, file]),
  );
  const legacyMirrorsByName = new Map(
    mirrorFiles
      .filter((file) => !file.assetMetadata?.googleDriveFileId)
      .map((file) => [file.name, file]),
  );
  const physicalLocalFiles = input.localFiles.filter(
    (file) => !isDriveMirror(file),
  );
  const matchedMirrorIds = new Set<string>();
  const enrichedDriveFiles = input.driveFiles.map((file) => {
    const mirror = driveMirrors.get(file.id) || legacyMirrorsByName.get(file.name);
    if (mirror) matchedMirrorIds.add(mirror.id);
    return {
      ...file,
      ...(mirror?.isFavorite !== undefined ? { isFavorite: mirror.isFavorite } : {}),
      assetMetadata: mirror?.assetMetadata || file.assetMetadata || {
        source: "google-drive",
        googleDriveFileId: file.id,
        storageProvider: "gdrive",
      },
    };
  });
  // Proper Drive mirrors can remain as an offline fallback. Legacy RAG mirrors
  // used random local IDs, so showing an unmatched one creates a ghost file.
  const pendingMirrors = mirrorFiles.filter((file) =>
    Boolean(file.assetMetadata?.googleDriveFileId) && !matchedMirrorIds.has(file.id),
  );
  return [...physicalLocalFiles, ...enrichedDriveFiles, ...pendingMirrors];
};
