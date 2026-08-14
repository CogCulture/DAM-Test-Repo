export type FileCollisionInput = {
  requestedName: string;
  existingNames: string[];
};

export type FileCollisionResolution = {
  finalName: string;
  renamed: boolean;
};

const splitFileName = (name: string) => {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0) return { stem: name, extension: "" };
  return { stem: name.slice(0, lastDot), extension: name.slice(lastDot) };
};

export const stripCollisionSuffix = (filename: string): string => {
  const { stem, extension } = splitFileName(filename);
  return `${stem.replace(/\s+\(\d+\)$/u, "")}${extension}`;
};

const getNextNumberedName = (requestedName: string, existingNames: string[]): string => {
  const occupied = new Set(existingNames.map((name) => name.toLocaleLowerCase()));
  const baseName = stripCollisionSuffix(requestedName);
  const { stem, extension } = splitFileName(baseName);
  let copyNumber = 1;
  let candidate = `${stem} (${copyNumber})${extension}`;

  while (occupied.has(candidate.toLocaleLowerCase())) {
    copyNumber += 1;
    candidate = `${stem} (${copyNumber})${extension}`;
  }

  return candidate;
};

export const resolveFileCollision = ({
  requestedName,
  existingNames,
}: FileCollisionInput): FileCollisionResolution => {
  const occupied = new Set(existingNames.map((name) => name.toLocaleLowerCase()));
  if (!occupied.has(requestedName.toLocaleLowerCase())) {
    return { finalName: requestedName, renamed: false };
  }

  return { finalName: getNextNumberedName(requestedName, existingNames), renamed: true };
};

export type ExistingContentMatch = {
  id: string;
  name: string;
  storagePath: string;
};

export type FileUploadPlan = FileCollisionResolution & (
  | { duplicate: false }
  | {
      duplicate: true;
      duplicateOfId: string;
      duplicateOfName: string;
      reuseStoragePath: string;
    }
);

export const planFileUpload = ({
  requestedName,
  existingNames,
  contentMatch,
}: FileCollisionInput & { contentMatch?: ExistingContentMatch | null }): FileUploadPlan => {
  if (!contentMatch) {
    const collision = resolveFileCollision({ requestedName, existingNames });
    return { ...collision, duplicate: false };
  }

  const canonicalNames = [...existingNames, contentMatch.name];
  const finalName = getNextNumberedName(contentMatch.name, canonicalNames);

  return {
    finalName,
    renamed: finalName !== requestedName,
    duplicate: true,
    duplicateOfId: contentMatch.id,
    duplicateOfName: contentMatch.name,
    reuseStoragePath: contentMatch.storagePath,
  };
};