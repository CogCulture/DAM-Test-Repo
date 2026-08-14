export const RAG_ARTIFACT_SUFFIXES = [
  "_parsed.md",
  "_anthropic_parsed.md",
  "_fast_parsed.md",
] as const;

type RagSource = {
  id: string;
  md5?: string | null;
  name: string;
  path: string;
};

type RagArtifact = {
  id: string;
  name: string;
  path: string;
  storagePath?: string | null;
  createdAt?: Date | string | null;
  assetMetadata?: Record<string, any> | null;
};

const replaceExtension = (value: string, suffix: string) => /\.[^/.]+$/.test(value)
  ? value.replace(/\.[^/.]+$/, suffix)
  : `${value}${suffix}`;

export const getRagArtifactPaths = (sourcePath: string) =>
  RAG_ARTIFACT_SUFFIXES.map((suffix) => replaceExtension(sourcePath, suffix));

export const buildRagArtifactMetadata = (source: RagSource) => ({
  source: "rag",
  ragSourceFileId: source.id,
  ragSourceMd5: source.md5 || null,
  ragSourceName: source.name,
  ragSourcePath: source.path,
});

export const isRagArtifactName = (name: string) =>
  RAG_ARTIFACT_SUFFIXES.some((suffix) => name.toLowerCase().endsWith(suffix));

export const resolveRagArtifactState = (
  source: RagSource,
  candidates: RagArtifact[],
) => {
  const targetPaths = new Set(getRagArtifactPaths(source.path));
  const matches = candidates
    .filter((candidate) => {
      const metadata = candidate.assetMetadata || {};
      return metadata.ragSourceFileId === source.id || targetPaths.has(candidate.path);
    })
    .sort((a, b) => {
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aCreated - bCreated || a.id.localeCompare(b.id);
    });

  const canonical = matches[0] || null;
  const previousChecksum = canonical?.assetMetadata?.ragSourceMd5;

  return {
    canonical,
    duplicateIds: matches.slice(1).map((candidate) => candidate.id),
    // Legacy rows did not record a source checksum. They still represent the same
    // derived path, so reuse them once and backfill the source metadata.
    canReuseContent: Boolean(canonical)
      && (!previousChecksum || !source.md5 || previousChecksum === source.md5),
  };
};

export const getRagArtifactName = (sourceName: string, suffix: string) =>
  replaceExtension(sourceName, suffix);

export const getRagArtifactPath = (sourcePath: string, suffix: string) =>
  replaceExtension(sourcePath, suffix);
