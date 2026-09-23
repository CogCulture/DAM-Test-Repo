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
  const sortBy = ref("name");
  const order = ref("asc");
  const filters = ref<any>(null);
  const files = useState<IFile[]>("files", () => []);
  const loading = useState<boolean>("files-loading", () => false);
  const error = useState<string | null>("files-error", () => null);
  const refreshTrigger = useState("files-refresh-trigger", () => 0);
  let requestVersion = 0;
  const fetchFiles = async () => {
    const version = ++requestVersion;
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
      const processedFiles = processFileDuplicates(completeFiles);
      files.value = replaceFetchedFiles({
        current: files.value,
        incoming: processedFiles,
        reset: true,
        responseReady: true,
      });
    } catch (err: any) {
      if (version !== requestVersion) return;
      console.error("Error fetching files:", err);
      error.value = err?.data?.message || err?.message || "Files could not be loaded.";
    } finally {
      if (version === requestVersion) loading.value = false;
    }
  };
  watch(
    () => [route.params.id, route.params.bucket, route.path, toValue(endpoint)],
    () => {
      fetchFiles();
    }
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
  onMounted(() => {
    fetchFiles();
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
