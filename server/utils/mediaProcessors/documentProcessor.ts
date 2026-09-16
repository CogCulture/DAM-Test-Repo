import { spawn } from "node:child_process";
import { join } from "node:path";
import { promises as fs } from "node:fs";

const RAGPUSH_DIR = join(process.cwd(), "server", "utils");
const PYTHON_CMD = process.env.PYTHON_CMD || (process.platform === "win32" ? "python" : "python3");

export interface DocumentProcessingResult {
  metadata: Record<string, any>;
  extractedText?: string;
  outputPath?: string;
  usedOcrFallback?: boolean;
}

/**
 * Wires document parsers (processor.py) with Anthropic OCR fallback for scanned/raster PDFs and images.
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
  const scriptPath = join(RAGPUSH_DIR, "rag_parsers", "run_pipeline.py");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const pineconeKey = process.env.PINECONE_API_KEY;

  if (!pineconeKey) {
    throw new Error("PINECONE_API_KEY is missing in environment.");
  }

  const args = [
    "-u",
    scriptPath,
    filePath,
    fileId,
    fileName,
    ext,
    "Unknown",
    orgId || "org_default",
    userId || "system",
    "user",
    departmentId || "global",
  ];

  return new Promise<DocumentProcessingResult>((resolve, reject) => {
    console.log(`[documentProcessor] Spawning document RAG pipeline for ${fileName}...`);

    const child = spawn(PYTHON_CMD, args, {
      cwd: RAGPUSH_DIR,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        RAG_USE_BATCH: process.env.RAG_USE_BATCH || "false",
        ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
        PINECONE_API_KEY: pineconeKey,
      },
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (data) => (stdoutData += data.toString()));
    child.stderr.on("data", (data) => (stderrData += data.toString()));

    child.on("error", (err) => reject(new Error(`Spawn error: ${err.message}`)));

    child.on("close", async (code) => {
      if (code !== 0) {
        const jsonError = [...`${stdoutData}\n${stderrData}`.matchAll(/\{"error"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\}/g)].at(-1)?.[1];
        const detail = jsonError ? JSON.parse(`"${jsonError}"`) : stderrData.trim().split("\n").at(-1) || `Exit code ${code}`;
        return reject(new Error(`Document processing failed: ${detail}`));
      }

      try {
        let outputPath = "";
        let cost = 0;
        try {
          const lines = stdoutData.trim().split("\n");
          const lastLine = lines[lines.length - 1];
          const jsonRes = JSON.parse(lastLine);
          if (jsonRes.cost) cost = jsonRes.cost;
          if (jsonRes.output_path) outputPath = jsonRes.output_path;
        } catch {
          const outMatch = stdoutData.match(/Output saved to '([^']+)'/);
          if (outMatch) outputPath = outMatch[1];
        }

        let extractedText = "";
        let usedOcrFallback = false;

        if (outputPath) {
          try {
            await fs.access(outputPath);
            extractedText = await fs.readFile(outputPath, "utf-8");

            // Check if document was scanned/raster and triggered OCR vision fallback
            if (extractedText.includes("Anthropic OCR") || extractedText.includes("Claude Vision")) {
              usedOcrFallback = true;
            }
          } catch {}
        }

        resolve({
          metadata: {
            documentProcessedAt: new Date().toISOString(),
            ragCost: cost,
            parsedMarkdownPath: outputPath || undefined,
            textCharacterCount: extractedText.length,
            usedOcrFallback,
          },
          extractedText,
          outputPath,
          usedOcrFallback,
        });
      } catch (err: any) {
        reject(new Error(`Post-processing document output failed: ${err.message}`));
      }
    });
  });
}
