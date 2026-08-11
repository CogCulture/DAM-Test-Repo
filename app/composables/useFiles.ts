import type { MaybeRefOrGetter } from "vue";
import { useRole } from "./useRole";
import { resolveDriveRouteFolderId } from "~~/shared/utils/drive-storage";
import { replaceFetchedFiles } from "~~/shared/utils/department-upload";

export function useFiles(endpoint: MaybeRefOrGetter<string | undefined> = "root") {
  const route = useRoute();
  const { orgType } = useRole();
  const { user } = useUserSession();
  const sortBy = ref("name");
  const order = ref("asc");
  const filters = ref<any>(null);
  const files = useState<IFile[]>("files", () => []);
  const loading = useState<boolean>("files-loading", () => false);
  const error = useState<string | null>("files-error", () => null);
  const refreshTrigger = useState("files-refresh-trigger", () => 0);
  const isEnd = ref<boolean>(true);

  const page = ref(1);
  let requestVersion = 0;
  const fetchFiles = async (reset: boolean) => {
    const version = ++requestVersion;
    if (reset) {
      page.value = 1;
      isEnd.value = true;
    }
    if (!reset && loading.value) return;
    loading.value = true;
    error.value = null;
    const filterQuery: Record<string, string | boolean> = {};
    if (filters.value) {
      const { tags = [], meta = {}, ...standardFilters } = filters.value;
      Object.entries(standardFilters).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== "" && value !== false) {
          filterQuery[`filters[${key}]`] = String(value);
        }
      });
      if (Array.isArray(tags) && tags.length > 0) {
        filterQuery["filters[tags]"] = tags.join(",");
      }
      Object.entries(meta as Record<string, string | string[]>).forEach(([key, value]) => {
        const normalized = Array.isArray(value) ? value.filter(Boolean).join(",") : value;
        if (normalized) {
          filterQuery[`filters[meta][${key}]`] = normalized;
        }
      });
    }
    const isGDrive = orgType.value === "gdrive" || (route.params.bucket && (route.params.bucket as string).startsWith("gdrive_"));
    const idParam = route.params.id;
    // Only treat idParam as a folder ID when it's an ARRAY (from the [...id] catch-all route).
    // A string idParam means we're on a named sub-page (e.g. file/[id]) — use 'root' in that case.
    const resolvedId = isGDrive
      ? resolveDriveRouteFolderId({
          idParam: idParam as string | string[] | undefined,
          organizationId: (user.value as any)?.organizationId,
        })
      : Array.isArray(idParam) ? (idParam.join("/") || "root") : "root";
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
        endpoints[(toValue(endpoint) || "root") as keyof typeof endpoints] as string,
        {
          query: {
            page: page.value,
            sortBy: sortBy.value,
            order: order.value,
            t: Date.now(),
            ...filterQuery,
          },
          timeout: 30000,
        }
      );
      if (version !== requestVersion) return;
      if (data && data.data) {
        files.value = replaceFetchedFiles({
          current: files.value,
          incoming: data.data,
          reset,
          responseReady: true,
        });
        if (data.nextPage) {
          isEnd.value = false;
        } else {
          isEnd.value = true;
        }
      }
    } catch (err: any) {
      if (version !== requestVersion) return;
      console.error("Error fetching files:", err);
      error.value = err?.data?.message || err?.message || "Files could not be loaded.";
    } finally {
      if (version === requestVersion) loading.value = false;
    }
  };
  const loadMore = () => {
    if (isEnd.value) return;
    page.value++;
    fetchFiles(false);
  };
  watch(
    () => [route.params.id, route.params.bucket, route.path, toValue(endpoint)],
    () => {
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
    error,
    fetchFiles,
    onSort,
    onFilter,
    endpoint: computed(() => toValue(endpoint) || "root"),
    refresh: () => {
      refreshTrigger.value++;
    },
  };
};
