export const useFiles = (endpoint: any = "root") => {
  const route = useRoute();
  const sortBy = ref("name");
  const order = ref("asc");
  const filters = ref<any>(null);
  const files = useState<IFile[]>("files", () => []);
  const loading = useState<boolean>("files-loading", () => false);
  const refreshTrigger = useState("files-refresh-trigger", () => 0);
  const isEnd = ref<boolean>(true);

  const page = ref(1);
  const fetchFiles = async (reset: boolean) => {
    if (reset) {
      files.value = [];
      page.value = 1;
      isEnd.value = true;
    }
    if (loading.value) return;
    loading.value = true;
    const filterQuery: { [key: string]: any } = {};
    if (filters.value) {
      Object.entries(filters.value).forEach(([key, value]) => {
        // Only add the filter if it has a value (not null, undefined, or empty string)
        if (value !== null && value !== undefined && value !== "") {
          // Use bracket notation for filters
          filterQuery[`filters[${key}]`] = value;
        }
      });
    }
    const isGDrive = route.params.bucket && (route.params.bucket as string).startsWith("gdrive_");
    const idParam = route.params.id;
    const resolvedId = Array.isArray(idParam) ? (idParam.join("/") || "root") : (idParam || "root");
    const endpoints = {
      root: isGDrive
        ? `/api/gdrive/list/${resolvedId}`
        : `/api/files/list/${route.params.bucket}/${resolvedId}`,
      favorites: `/api/files/${route.params.bucket}/favorites`,
      shared: `/api/files/${route.params.bucket}/shared`,
      published: `/api/files/${route.params.bucket}/published`,
      recent: `/api/files/${route.params.bucket}/recent`,
      trash: `/api/files/${route.params.bucket}/trash`,
    };
    try {
      const data = await $fetch<FilesFetchResponse>(
        endpoints[endpoint as keyof typeof endpoints] as string,
        {
          query: {
            page: page.value,
            sortBy: sortBy.value,
            order: order.value,
            ...filterQuery,
          },
        }
      );
      if (data && data.data) {
        files.value.push(...data.data);
        if (data.nextPage) {
          isEnd.value = false;
        } else {
          isEnd.value = true;
        }
      }
    } catch (err) {
      console.error("Error fetching files:", err);
    } finally {
      loading.value = false;
    }
  };
  const loadMore = () => {
    if (isEnd.value) return;
    page.value++;
    fetchFiles(false);
  };
  watch(
    () => route.params.id,
    (newId, oldId) => {
      fetchFiles(true);
    }
  );
  watch(
    refreshTrigger,
    () => {
      fetchFiles(true);
    }
  );
  watch(
    [sortBy, order, filters],
    () => {
      fetchFiles(true);
    },
    { deep: true }
  );
  onMounted(() => {
    fetchFiles(true);
  });
  const onSort = (e: { sortBy: string; order: string }) => {
    sortBy.value = e.sortBy;
    order.value = e.order;
  };
  const onFilter = (e: any) => {
    filters.value = toRaw(e);
  };
  return {
    files,
    isEnd,
    loadMore,
    loading,
    fetchFiles,
    onSort,
    onFilter,
    endpoint,
    refresh: () => fetchFiles(true),
  };
};
