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
    if (!route.params.bucket) {
      folder.value = null;
      return;
    }
    const idParam = route.params.id;
    const resolvedId = Array.isArray(idParam) ? idParam.filter(Boolean).join("/") : (typeof idParam === "string" ? idParam : "");
    if (!resolvedId) {
      folder.value = null;
      return;
    }

    if (folder.value?.id !== resolvedId) {
      folder.value = null;
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
      const idParam = route.params.id;
      const resolvedId = Array.isArray(idParam) ? idParam.filter(Boolean).join("/") : (typeof idParam === "string" ? idParam : "");
      if (!resolvedId) {
        folder.value = null;
      } else {
        fetchFolder();
      }
    },
    { immediate: true }
  );

  return { loading, folder, fetchFolder };
}
