export function useFolder() {
  type Folder = {
    id: string;
    name: string;
    path: string;
    parentId?: string;
    breadcrumb?: FolderBreadcrumb[];
  };
  const route = useRoute();
  const folder = useState<Folder | null>("folder", () => null);
  const loading = useState<boolean>("folder-loading", () => false);
  let activeFetchId = "";

  const fetchFolder = async () => {
    if (!route.params.bucket) return;
    const idParam = route.params.id;
    // Only use idParam as a folder path when it's an ARRAY (from [...id] catch-all)
    // String idParam means we're on a named sub-page like file/[id], so no folder to fetch
    const resolvedId = Array.isArray(idParam) ? idParam.join("/") : "";
    if (!resolvedId) {
      folder.value = null;
      return;
    }

    activeFetchId = resolvedId;
    loading.value = true;
    try {
      const data = await $fetch<Folder>(
        `/api/folder/${route.params.bucket}/${encodeURIComponent(resolvedId)}`
      );
      if (data && activeFetchId === resolvedId) {
        folder.value = data;
      }
    } catch (e) {
      console.error("Error fetching folder:", e);
    } finally {
      loading.value = false;
    }
  };

  watch(
    () => route.fullPath,
    () => {
      fetchFolder();
    },
    { immediate: true }
  );

  return { loading, folder, fetchFolder };
}
