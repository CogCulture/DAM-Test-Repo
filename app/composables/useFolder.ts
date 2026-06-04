export const useFolder = () => {
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

  const fetchFolder = async () => {
    if (!route.params.bucket) return;
    const idParam = route.params.id;
    const resolvedId = Array.isArray(idParam) ? idParam.join("/") : (idParam || "");
    if (!resolvedId) {
      folder.value = null;
      return;
    }
    if (loading.value) return;
    loading.value = true;
    try {
      const data = await $fetch<Folder>(
        `/api/folder/${route.params.bucket}/${resolvedId}`
      );
      if (data) folder.value = data;
    } catch (e) {
      console.error("Error fetching folder:", e);
    } finally {
      loading.value = false;
    }
  };

  watch(
    () => route.params.id,
    (newId, oldId) => {
      fetchFolder();
    }
  );
  onMounted(() => {
    fetchFolder();
  });
  return { loading, folder };
};
