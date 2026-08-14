export function useFile() {
  const route = useRoute();
  const loading = useState<boolean>("file-loading", () => false);
  const file = useState<IFile | null>("file", () => null);

  const fetchFile = async () => {
    if (loading.value) return;
    loading.value = true;
    try {
      const { data } = await useFetch<IFile>(
        `/api/files/${route.params.bucket}/file/${route.params.id}`
      );
      if (data.value && data.value.id) {
        file.value = data.value;
      }
    } catch (err) {
      console.error("Error fetching file:", err);
    } finally {
      loading.value = false;
    }
  };

  onMounted(() => {
    fetchFile();
  });
  return {
    file,
    loading,
  };
};
