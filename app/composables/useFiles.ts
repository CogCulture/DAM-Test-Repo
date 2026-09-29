import type { MaybeRefOrGetter } from "vue";
import { useRole } from "./useRole";
import { resolveDriveRouteFolderId } from "~~/shared/utils/drive-storage";
import { replaceFetchedFiles } from "~~/shared/utils/department-upload";
import { loadCompleteAssetView } from "~~/shared/utils/directory-pagination";
import { processFileDuplicates } from "~~/shared/utils/file-collision";

export function useFiles(endpoint: MaybeRefOrGetter<string | undefined> = "root") {
  const route = useRoute();
  const { orgType } = useRole();
  const { user } = useUserSession();
  const sortBy = ref("createdAt");
  const order = ref("desc");
  const filters = ref<any>(null);
  const files = useState<IFile[]>("files", () => []);
  const loading = useState<boolean>("files-loading", () => false);
  const error = useState<string | null>("files-error", () => null);
  const refreshTrigger = useState("files-refresh-trigger", () => 0);
  let requestVersion = 0;
  let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  const fetchFiles = async (options: { silent?: boolean } = {}) => {
    const version = ++requestVersion;
    if (!options.silent) {
      loading.value = true;
    }
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
    const isReserved = (id: string) => ["favorites", "shared", "published", "recent", "trash"].includes(id);

    let rawFolderId = "";
    if (Array.isArray(idParam)) {
      rawFolderId = idParam.filter(Boolean).join("/");
    } else if (typeof idParam === "string") {
      rawFolderId = idParam;
    }

    const resolvedId = isGDrive
      ? resolveDriveRouteFolderId({
          idParam: idParam as string | string[] | undefined,
          organizationId: (user.value as any)?.organizationId,
        })
      : (rawFolderId && !isReserved(rawFolderId) ? rawFolderId : "root");
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
      const requestTimestamp = Date.now();
      const completeFiles = await loadCompleteAssetView<IFile>(page =>
        $fetch<FilesFetchResponse>(
          endpoints[(toValue(endpoint) || "root") as keyof typeof endpoints] as string,
          {
            query: {
              page,
              sortBy: sortBy.value,
              order: order.value,
              t: requestTimestamp,
              ...filterQuery,
            },
            timeout: 30000,
          },
        ),
      );
      if (version !== requestVersion) return;
      const processedFiles = processFileDuplicates(completeFiles, sortBy.value, order.value);
      files.value = processedFiles;
    } catch (err: any) {
      if (version !== requestVersion) return;
      if (!options.silent) {
        console.error("Error fetching files:", err);
        error.value = err?.data?.message || err?.message || "Files could not be loaded.";
      }
    } finally {
      if (version === requestVersion) loading.value = false;
    }
  };
  watch(
    () => [route.fullPath, route.params.id, route.params.bucket, toValue(endpoint)],
    () => {
      files.value = [];
      loading.value = true;
      fetchFiles();
    },
    { immediate: true }
  );
  watch(
    refreshTrigger,
    () => {
      fetchFiles();
    }
  );
  watch(
    [sortBy, order, filters],
    () => {
      fetchFiles();
    },
    { deep: true }
  );
  onUnmounted(() => {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
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
