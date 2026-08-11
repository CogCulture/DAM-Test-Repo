const API_VERSION = "2025-04";

export async function deletePineconeFileVectors(fileId: string, namespace: string) {
  const apiKey = process.env.PINECONE_API_KEY;
  const configuredHost = process.env.PINECONE_INDEX_HOST;
  if (!apiKey || !configuredHost) return 0;

  const host = configuredHost.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const ids: string[] = [];
  let paginationToken: string | undefined;

  do {
    const response = await $fetch<any>(`https://${host}/vectors/list`, {
      headers: {
        "Api-Key": apiKey,
        "X-Pinecone-Api-Version": API_VERSION,
      },
      query: {
        namespace,
        prefix: `${fileId}_chunk-`,
        limit: 100,
        ...(paginationToken ? { paginationToken } : {}),
      },
    });
    ids.push(...(response?.vectors || []).map((vector: any) => vector.id).filter(Boolean));
    paginationToken = response?.pagination?.next || undefined;
  } while (paginationToken);

  for (let index = 0; index < ids.length; index += 1000) {
    await $fetch(`https://${host}/vectors/delete`, {
      method: "POST",
      headers: {
        "Api-Key": apiKey,
        "Content-Type": "application/json",
        "X-Pinecone-Api-Version": API_VERSION,
      },
      body: {
        ids: ids.slice(index, index + 1000),
        namespace,
      },
    });
  }

  return ids.length;
}
