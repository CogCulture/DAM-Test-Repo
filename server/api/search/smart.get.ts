import { spawn } from "node:child_process";
import { join } from "node:path";
import { requireFilePermission } from "~~/server/utils/permission";
import { searchFiles } from "~~/server/utils/db";
import { useDrizzle } from "~~/server/utils/drizzle";
import { files, orgDepartments } from "~~/server/database/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { isRagArtifactName } from "~~/shared/utils/rag-artifact";

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

async function generateSummary(query: string, filename: string, chunks: string[]): Promise<string> {
  const fallback = formatSnippet(chunks[0] || "");
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return fallback;

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
    return res?.content?.[0]?.text || fallback;
  } catch (err) {
    return fallback;
  }
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
    const child = spawn(PYTHON_CMD, [script, query], {
      cwd: PARSERS_DIR,
      env: {
        ...process.env,
        PINECONE_API_KEY: PINECONE_KEY || process.env.PINECONE_API_KEY || "",
      },
    });
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

/** Query Pinecone index in the given namespace */
async function queryPinecone(
  embedding: number[],
  namespace: string,
  topK = 10,
  filter?: Record<string, any>
): Promise<{ id: string; score: number; metadata: Record<string, any> }[]> {
  const apiKey = process.env.PINECONE_API_KEY || PINECONE_KEY;
  const indexHost = process.env.PINECONE_INDEX_HOST || PINECONE_INDEX_HOST;
  if (!apiKey || !indexHost) return [];

  const host = indexHost.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const res = await $fetch<any>(
    `https://${host}/query`,
    {
      method: "POST",
      headers: {
        "Api-Key": apiKey,
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

  if (!q || !q.trim()) {
    return [];
  }

  const cleanQuery = q.trim();
  const orgId = (user as any).organizationId || "org_default";
  const deptId = (user as any).departmentId || null;
  const userId = (user as any).id;
  const userRole = (user as any).role || "user";
  const bucketName = bucket || "org";

  // Build department permission filter for Pinecone (Admins & Superadmins see all org vectors)
  const pineconeFilter: Record<string, any> = {};
  if (deptId && userRole !== "admin" && userRole !== "superadmin") {
    pineconeFilter.department_id = { "$eq": deptId };
  }

  // 1. Keyword DB search: search clean query and distinct query words
  const stopWords = new Set(["a","an","the","is","are","was","were","what","which","who","how","when","where","why","my","your","his","her","our","their","this","that","these","those","in","on","at","to","for","of","and","or","but"]);
  const rawWords = cleanQuery.toLowerCase().split(/\s+/).filter(w => w.length > 0 && !stopWords.has(w));

  const searchTermsSet = new Set<string>();
  searchTermsSet.add(cleanQuery.toLowerCase());
  for (const word of rawWords) {
    searchTermsSet.add(word);
    if (word.length >= 5) {
      searchTermsSet.add(word.substring(0, word.length - 1));
    }
  }

  const searchTerms = Array.from(searchTermsSet).filter(t => t.length >= 2);

  const [allDbResults, allDeptResults, embedding] = await Promise.all([
    Promise.all(
      // Search for each term individually — union results
      searchTerms.map(term => searchFiles(bucketName, term, orgId, userId, userRole).catch(() => [] as any[]))
    ),
    // Also search org_departments table by name for matching departments/clients
    useDrizzle()
      .select({
        id: orgDepartments.id,
        name: orgDepartments.name,
        folderId: orgDepartments.folderId,
      })
      .from(orgDepartments)
      .where(and(
        eq(orgDepartments.organizationId, orgId),
        sql`LOWER(${orgDepartments.name}) LIKE LOWER(${'%' + cleanQuery + '%'})`
      ))
      .catch(() => [] as any[]),
    cleanQuery.length >= 3
      ? embedQuery(cleanQuery).catch((err) => {
          console.error("[SmartSearch] embedQuery error:", err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  // Deduplicate DB results by id
  const seenDbIds = new Set<string>();
  const dbResults: any[] = [];
  for (const batch of allDbResults) {
    for (const f of batch) {
      if (!seenDbIds.has(f.id)) {
        seenDbIds.add(f.id);
        dbResults.push(f);
      }
    }
  }

  // Also check if any orgDepartments matched
  const deptFolderIdsToFetch: string[] = [];
  for (const dept of allDeptResults) {
    if (dept.folderId && !seenDbIds.has(dept.folderId)) {
      deptFolderIdsToFetch.push(dept.folderId);
    }
  }

  // Combine dbResults directly with strict relevance scoring
  const results: SearchResult[] = dbResults
    .filter((f) => !isRagArtifactName(f.name))
    .map((f) => {
      const lowerName = f.name.toLowerCase();
      const lowerQuery = cleanQuery.toLowerCase();
      const isExactMatch = lowerName === lowerQuery;
      const isPrefixMatch = lowerName.startsWith(lowerQuery);
      const isContainsMatch = lowerName.includes(lowerQuery);
      const isWordMatch = rawWords.some((w) => lowerName.includes(w));
      const isFolder = f.type === "folder" || f.contentType === "folder";

      let score = 0.6; // Default score for path-only matches
      if (isExactMatch) score = 1.0;
      else if (isPrefixMatch) score = 0.95;
      else if (isContainsMatch) score = 0.90;
      else if (isWordMatch) score = 0.85;

      return {
        id: f.id,
        name: f.name,
        path: f.path,
        type: f.type,
        contentType: isFolder ? "folder" : f.contentType,
        bucketName: f.bucketName || bucketName,
        preview: f.preview ?? undefined,
        deletedAt: f.deletedAt?.toISOString?.() ?? undefined,
        size: f.size ?? undefined,
        createdAt: f.createdAt?.toISOString?.() ?? undefined,
        score,
        source: "keyword" as const,
      };
    });

  // Include virtual department matching folders if not already in results
  for (const dept of allDeptResults) {
    const existingIdx = results.findIndex(r => r.id === dept.id || r.id === dept.folderId);
    if (existingIdx === -1) {
      results.push({
        id: dept.folderId || dept.id,
        name: dept.name,
        path: dept.name,
        type: "folder",
        contentType: "folder",
        bucketName: bucketName,
        score: dept.name.toLowerCase() === cleanQuery.toLowerCase() ? 1.0 : 0.95,
        source: "keyword" as const,
      });
    }
  }

  // 3. Semantic search via Pinecone with department permission filtering (if embedding succeeded)
  if (embedding) {
    try {
      const matches = await queryPinecone(embedding, orgId, 10, pineconeFilter);

      // Filter to relevant semantic matches using model-calibrated threshold
      // For llama-text-embed-v2 with cosine metric, scores range 0.18-0.48 for relevant passages (noise is <0.15)
      const minSimilarity = Number(process.env.PINECONE_SIMILARITY_THRESHOLD) || 0.16;
      const relevantMatches = matches.filter((m) => (m.score ?? 0) >= minSimilarity);

      // Get file IDs from Pinecone metadata — format is `{file_id}_chunk-{n}`
      const semanticFileIds = [
        ...new Set(
          relevantMatches
            .map((m) => {
              const chunkSuffix = m.id.lastIndexOf("_chunk-");
              return chunkSuffix >= 0 ? m.id.substring(0, chunkSuffix) : null;
            })
            .filter(Boolean) as string[]
        ),
      ];

      if (semanticFileIds.length > 0) {
        const matchedDbFiles = await useDrizzle()
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
            assetMetadata: files.assetMetadata,
          })
          .from(files)
          .where(and(
            inArray(files.id, semanticFileIds),
            eq(files.organizationId, orgId),
            isNull(files.deletedAt),
          ));

        // If any matched file is a RAG artifact (e.g. _parsed.md), also load its source parent file
        const parentFileIds = matchedDbFiles
          .map((f) => (f.assetMetadata as any)?.ragSourceFileId as string | undefined)
          .filter((id): id is string => Boolean(id));

        let parentDbFiles: typeof matchedDbFiles = [];
        if (parentFileIds.length > 0) {
          parentDbFiles = await useDrizzle()
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
              assetMetadata: files.assetMetadata,
            })
            .from(files)
            .where(and(
              inArray(files.id, parentFileIds),
              eq(files.organizationId, orgId),
              isNull(files.deletedAt),
            ));
        }

        const filesMap = new Map([
          ...matchedDbFiles.map((f) => [f.id, f] as const),
          ...parentDbFiles.map((f) => [f.id, f] as const),
        ]);

        const generatedResults = await Promise.all(
          semanticFileIds.map(async (sfId) => {
            const rawFile = filesMap.get(sfId);
            if (!rawFile) return null;

            // Resolve artifact back to user-facing original file (e.g. PDF/DOCX) if present
            const sourceId = (rawFile.assetMetadata as any)?.ragSourceFileId;
            const targetFile = (sourceId && filesMap.get(sourceId)) || rawFile;

            // Filter out artifacts if the source file is not found
            if (isRagArtifactName(targetFile.name) && !sourceId) {
              return null;
            }

            const fileMatches = relevantMatches.filter((m) => m.id.startsWith(sfId + "_chunk-"));
            if (fileMatches.length === 0) return null;
            
            const bestMatch = fileMatches[0];
            const fileChunks = fileMatches.map((m) => m.metadata?.text as string).filter(Boolean);
            const filename = targetFile.name;
            
            // Generate summary concurrently
            const summary = await generateSummary(cleanQuery, filename, fileChunks);
            
            // Normalize semantic score into ranking range [0.75 - 0.98]
            const rawScore = bestMatch.score ?? minSimilarity;
            const normalizedScore = Math.min(0.98, Math.max(0.75, 0.75 + ((rawScore - minSimilarity) / 0.20) * 0.23));

            const semanticResult: SearchResult = {
              id: targetFile.id,
              name: targetFile.name,
              path: targetFile.path,
              type: targetFile.type,
              contentType: targetFile.contentType,
              bucketName: targetFile.bucketName,
              preview: targetFile.preview ?? undefined,
              deletedAt: targetFile.deletedAt?.toISOString?.() ?? undefined,
              size: targetFile.size ?? undefined,
              createdAt: targetFile.createdAt?.toISOString?.() ?? undefined,
              score: normalizedScore,
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
            // Matched BOTH keyword and semantic!
            // Attach the AI snippet and mark as AI/semantic
            if (sr.snippet) {
              results[existingIdx].snippet = sr.snippet;
            }
            results[existingIdx].source = "semantic";
            results[existingIdx].score = Math.max(results[existingIdx].score ?? 0, 0.96);
          } else {
            results.push(sr);
          }
        }
      }
    } catch (pineconeErr) {
      console.warn("Pinecone search failed:", pineconeErr);
    }
  }

  // Sort strictly by relevance score descending
  results.sort((a, b) => {
    const scoreA = a.score ?? 0;
    const scoreB = b.score ?? 0;
    if (Math.abs(scoreA - scoreB) > 0.001) {
      return scoreB - scoreA;
    }
    return a.name.localeCompare(b.name);
  });

  return results.slice(0, 20);
});
