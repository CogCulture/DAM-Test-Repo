export type DirectoryPage<T> = {
  data?: T[];
  nextPage?: number | null;
};

export const loadAllDirectoryPages = async <T extends { id: string }>(
  fetchPage: (page: number) => Promise<DirectoryPage<T>>,
) => {
  const entries = new Map<string, T>();
  const requestedPages = new Set<number>();
  let page = 1;

  while (true) {
    if (requestedPages.has(page)) {
      throw new Error(`Directory pagination returned a repeated page token: ${page}`);
    }
    requestedPages.add(page);

    const response = await fetchPage(page);
    for (const entry of response?.data || []) {
      entries.set(entry.id, entry);
    }

    if (typeof response?.nextPage !== "number") break;
    page = response.nextPage;
  }

  return [...entries.values()];
};

export const loadCompleteAssetView = loadAllDirectoryPages;
