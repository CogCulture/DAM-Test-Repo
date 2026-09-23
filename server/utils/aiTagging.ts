/**
 * Generates automated AI tags for uploaded assets based on content type,
 * extracted metadata, file extension, and Anthropic LLM analysis.
 */
export async function generateAiAutoTags(params: {
  fileName: string;
  contentType: string;
  category: string;
  ext: string;
  metadata: Record<string, any>;
}): Promise<string[]> {
  const tags = new Set<string>();

  // 1. Add core format & category tags
  if (params.category) tags.add(params.category.toLowerCase());
  if (params.ext) tags.add(params.ext.replace(/^\./, "").toLowerCase());

  // Content type tags
  const ctParts = params.contentType.split("/");
  if (ctParts.length > 1) {
    tags.add(ctParts[1].toLowerCase());
  }

  // 2. Extract tags from filename words
  const cleanName = params.fileName.replace(/\.[^/.]+$/, "");
  const words = cleanName.split(/[-_.\s]+/);
  for (const word of words) {
    if (word.length >= 3 && !/^\d+$/.test(word)) {
      tags.add(word.toLowerCase());
    }
  }

  // 3. Extract tags from technical metadata
  const meta = params.metadata || {};
  if (meta.exif?.make) tags.add(String(meta.exif.make).toLowerCase());
  if (meta.exif?.model) tags.add(String(meta.exif.model).toLowerCase());
  if (meta.colorMode) tags.add(String(meta.colorMode).toLowerCase());
  if (meta.usedOcrFallback) tags.add("scanned-ocr");
  if (meta.video?.format) tags.add("video-media");
  if (meta.audio?.codec) tags.add(String(meta.audio.codec).toLowerCase());
  if (meta.packagedDesign?.packageType) tags.add("indesign-package");

  // 4. Optional Anthropic AI Tagging Enhancement
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && apiKey.startsWith("sk-ant-")) {
    try {
      const prompt = `Analyze this file metadata and return a JSON array of 5-8 descriptive tags as lowercase strings.\nFile Name: "${params.fileName}"\nCategory: "${params.category}"\nContent Type: "${params.contentType}"\nMetadata: ${JSON.stringify(meta).slice(0, 1000)}\n\nRespond ONLY with a raw JSON array of strings, e.g. ["tag1", "tag2", "tag3"].`;

      const response = await $fetch<any>("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: {
          model: "claude-3-haiku-20240307",
          max_tokens: 150,
          messages: [{ role: "user", content: prompt }],
        },
      });

      const text = response?.content?.[0]?.text;
      if (text) {
        const jsonMatch = text.match(/\[.*\]/s);
        if (jsonMatch) {
          const aiTags = JSON.parse(jsonMatch[0]);
          if (Array.isArray(aiTags)) {
            for (const tag of aiTags) {
              if (typeof tag === "string" && tag.trim()) {
                tags.add(tag.trim().toLowerCase());
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[AiTagging] Anthropic AI tag generation skipped:`, err?.message || err);
    }
  }

  return Array.from(tags).slice(0, 15);
}
