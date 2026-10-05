export interface DocumentProcessingResult {
  metadata: Record<string, any>;
  extractedText?: string;
  outputPath?: string;
  usedOcrFallback?: boolean;
}

/**
 * Standard Stage 2 Document Ingestion Processor.
 * Extracts lightweight document metadata on upload.
 * Deep RAG parsing, chunking, and Pinecone vector DB upserting is deferred until
 * the user explicitly clicks "Move to RAG".
 */
export async function processDocumentFile(
  filePath: string,
  fileId: string,
  fileName: string,
  ext: string,
  orgId: string,
  userId: string,
  departmentId: string = "global"
): Promise<DocumentProcessingResult> {
  console.log(`[documentProcessor] Ingesting document metadata for ${fileName} (${ext}). Vector indexing deferred until manual 'Move to RAG'.`);

  return {
    metadata: {
      documentProcessedAt: new Date().toISOString(),
      format: ext.replace(/^\./, "").toUpperCase(),
      ragStatus: "unindexed",
      ragIndexed: false,
    },
  };
}
