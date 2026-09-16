import { spawn } from "node:child_process";
import { join } from "node:path";
import { requireFilePermission } from "~~/server/utils/permission";
import { searchFiles } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import { files } from "~~/server/database/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { isRagArtifactName } from "~~/shared/utils/rag-artifact";

async function generateSummary(query: string, filename: string, chunks: string[]): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return chunks[0] || ""; // Still keep a safe guard

  const prompt = `You are a helpful assistant. The user searched for: "${query}".
Based on the following excerpts from the file "${filename}", provide a direct, concise answer or summary (2-3 sentences max) answering their query. 
If the excerpts do not contain the answer, say "The matched sections of this file do not directly answer the query."

Excerpts:
${chunks.join("\n\n---\n\n")}`;

  try {
    const res = await $fetch<any>("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        messages: [{ role: "user", content: prompt }],
      },
    });
    return res?.content?.[0]?.text || chunks[0];
  } catch (err) {
    console.error("Anthropic summary failed:", err);
    return chunks[0] || "";
  }
}

function formatSnippet(text: string, maxLength = 250): string {
  if (!text) return "";
  const cleanText = text.replace(/[\n\r]+/g, " ").trim();
  if (cleanText.length <= maxLength) return cleanText;
  
  // Try to truncate at a word boundary
  const truncated = cleanText.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  
  if (lastSpace > maxLength * 0.8) { // If there's a space in the last 20% of the string
    return truncated.substring(0, lastSpace) + "...";
  }
  return truncated + "...";
}

const PYTHON_CMD = process.env.PYTHON_CMD || (process.platform === "win32" ? "python" : "python3");
const PARSERS_DIR = join(process.cwd(), "server", "utils", "rag_parsers");
const PINECONE_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_HOST = process.env.PINECONE_INDEX_HOST;

interface SearchResult {
  id: string;
  name: string;
  path: string;
  type: string;
  contentType: string;
  bucketName: string;
  preview?: string;
  deletedAt?: string;
  size?: number;
  createdAt?: string;
  score?: number;
  snippet?: string;
  source: "keyword" | "semantic";
}

/** Spawn embed_query.py and return the 768-dim embedding */
function embedQuery(query: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const script = join(PARSERS_DIR, "embed_query.py");
    const child = spawn(PYTHON_CMD, [script, query], { cwd: PARSERS_DIR });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => {
      try {
        const parsed = JSON.parse(out.trim());
        if (Array.isArray(parsed)) {
          resolve(parsed);
        } else {
          reject(new Error(parsed.error || "embed_query returned non-array"));
        }
      } catch {
        reject(new Error(`embed_query parse error: ${err}`));
      }
    });
    child.on("error", reject);
  });
}

/** Query Pinecone dam-test index in the given namespace */
async function queryPinecone(
  embedding: number[],
  namespace: string,
  topK = 10,
  filter?: Record<string, any>
): Promise<{ id: string; score: number; metadata: Record<string, any> }[]> {
  if (!PINECONE_KEY || !PINECONE_INDEX_HOST) return [];

  const host = PINECONE_INDEX_HOST.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const res = await $fetch<any>(
    `https://${host}/query`,
    {
      method: "POST",
      headers: {
        "Api-Key": PINECONE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(namespace ? { namespace } : {}), // omit to query all namespaces
        vector: embedding,
        topK,
        includeMetadata: true,
        ...(filter && Object.keys(filter).length > 0 ? { filter } : {}),
      }),
    }
  );
  return res?.matches || [];
}

export default defineEventHandler(async (event) => {
  const user = await requireFilePermission(event, "canView");
  const { q, bucket } = getQuery(event) as { q: string; bucket: string };

  if (!q || q.trim().length < 2) {
    return [];
  }

  const orgId = (user as any).organizationId || "org_default";
  const deptId = (user as any).departmentId || null;
  const userRole = (user as any).role || "user";
  const bucketName = bucket || "local";

  // Build department permission filter for Pinecone (Admins & Superadmins see all org vectors)
  const pineconeFilter: Record<string, any> = {};
  if (deptId && userRole !== "admin" && userRole !== "superadmin") {
    pineconeFilter.department_id = { "$eq": deptId };
  }

  // 1. Keyword DB search: run both full-query AND individual meaningful word searches
  const stopWords = new Set(["a","an","the","is","are","was","were","what","which","who","how","when","where","why","my","your","his","her","our","their","this","that","these","those","in","on","at","to","for","of","and","or","but"]);
  const queryWords = q.trim().toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

  const [allDbResults, embedding] = await Promise.all([
    Promise.all(
      // Search for each meaningful word individually — union results
      [q, ...queryWords].map(term => searchFiles(bucketName, term).catch(() => [] as any[]))
    ),
    embedQuery(q).catch(() => null),
  ]);

  // Deduplicate DB results by id
  const seenDbIds = new Set<string>();
  const dbResults: any[] = [];
  for (const batch of allDbResults) {
    for (const f of batch) {
      if (!seenDbIds.has(f.id)) { seenDbIds.add(f.id); dbResults.push(f); }
    }
  }

  // 2. Fetch full file details for DB results (we need preview, bucketName, etc.)
  const dbFileIds = (dbResults || []).map((f: any) => f.id);
  let dbFilesDetailed: any[] = [];
  if (dbFileIds.length > 0) {
    dbFilesDetailed = await useDrizzle()
      .select({
        id: files.id,
        name: files.name,
        path: files.path,
        type: files.type,
        contentType: files.contentType,
        bucketName: files.bucketName,
        preview: files.preview,
        deletedAt: files.deletedAt,
        size: files.size,
        createdAt: files.createdAt,
      })
      .from(files)
      .where(and(
        inArray(files.id, dbFileIds),
        eq(files.organizationId, orgId),
        isNull(files.deletedAt),
      ));
  }

  const results: SearchResult[] = dbFilesDetailed
    // Parsed Markdown is an implementation artifact. Its source document is
    // returned by semantic search under the user's original filename.
    .filter((f) => !isRagArtifactName(f.name))
    .map((f) => ({
    id: f.id,
    name: f.name,
    path: f.path,
    type: f.type,
    contentType: f.contentType,
    bucketName: f.bucketName,
    preview: f.preview ?? undefined,
    deletedAt: f.deletedAt?.toISOString?.() ?? undefined,
    size: f.size ?? undefined,
    createdAt: f.createdAt?.toISOString?.() ?? undefined,
    source: "keyword" as const,
    }));

  // 3. Semantic search via Pinecone with department permission filtering (if embedding succeeded)
  if (embedding) {
    try {
      const matches = await queryPinecone(embedding, orgId, 10, pineconeFilter);

      // Get file IDs from Pinecone metadata — format is `{file_id}_chunk-{n}`
      const semanticFileIds = [
        ...new Set(
          matches
            .map((m) => {
              // Extract the base file ID (before _chunk-)
              const chunkSuffix = m.id.lastIndexOf("_chunk-");
              return chunkSuffix >= 0 ? m.id.substring(0, chunkSuffix) : null;
            })
            .filter(Boolean) as string[]
        ),
      ];

      if (semanticFileIds.length > 0) {
        const semanticFiles = await useDrizzle()
          .select({
            id: files.id,
            name: files.name,
            path: files.path,
            type: files.type,
            contentType: files.contentType,
            bucketName: files.bucketName,
            preview: files.preview,
            deletedAt: files.deletedAt,
            size: files.size,
            createdAt: files.createdAt,
          })
          .from(files)
          .where(and(
            inArray(files.id, semanticFileIds),
            eq(files.organizationId, orgId),
            isNull(files.deletedAt),
          ));

        const semanticFilesMap = new Map(semanticFiles.map((f) => [f.id, f]));

        const generatedResults = await Promise.all(
          semanticFileIds.map(async (sfId) => {
            const sf = semanticFilesMap.get(sfId);
            if (!sf) return null;

            const fileMatches = matches.filter((m) => m.id.startsWith(sfId + "_chunk-"));
            if (fileMatches.length === 0) return null;
            
            const bestMatch = fileMatches[0];
            const fileChunks = fileMatches.map((m) => m.metadata?.text as string).filter(Boolean);
            const filename = sf.name;
            
            // Generate summary concurrently
            const summary = await generateSummary(q, filename, fileChunks);
            
            const semanticResult: SearchResult = {
              id: sf.id,
              name: sf.name,
              path: sf.path,
              type: sf.type,
              contentType: sf.contentType,
              bucketName: sf.bucketName,
              preview: sf.preview ?? undefined,
              deletedAt: sf.deletedAt?.toISOString?.() ?? undefined,
              size: sf.size ?? undefined,
              createdAt: sf.createdAt?.toISOString?.() ?? undefined,
              score: bestMatch.score,
              snippet: summary,
              source: "semantic" as const,
            };
            return semanticResult;
          })
        );

        for (const sr of generatedResults) {
          if (!sr) continue;
          const existingIdx = results.findIndex((r) => r.id === sr.id);
          if (existingIdx >= 0) {
            results[existingIdx] = sr;
          } else {
            results.push(sr);
          }
        }
      }
    } catch (pineconeErr) {
      // Pinecone failure is non-fatal — keyword results still returned
      console.warn("Pinecone search failed:", pineconeErr);
    }
  }

  // Sort: semantic results first (by score desc), then keyword
  results.sort((a, b) => {
    if (a.source === "semantic" && b.source !== "semantic") return -1;
    if (b.source === "semantic" && a.source !== "semantic") return 1;
    if (a.score !== undefined && b.score !== undefined) return b.score - a.score;
    return 0;
  });

  return results.slice(0, 20);
});
