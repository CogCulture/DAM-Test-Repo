<script setup lang="ts">
import { useFolder } from "~/composables/useFolder";
import { uploadFileToLocalStorage } from "~/composables/useLocalUpload";
import { useRole } from "~/composables/useRole";
import { useToast } from "~/composables/useToast";
import { resolveDriveRouteFolderId, resolveUploadStorageTarget } from "~~/shared/utils/drive-storage";
import { resolveUploadPickerMode } from "~~/shared/utils/upload-picker";
import { buildDriveUploadUrl, type UploadDestination } from "~~/shared/utils/department-upload";
import { useUploadDestination, type ActiveUploadFolder } from "~/composables/useUploadDestination";
import { getUploadDirectoryPaths, normalizeDirectoryManifest, resolveLocalUploadParentId } from "~~/shared/utils/folder-upload-target";
import { chooseUploadSource, type DirectoryUploadSelection } from "~~/shared/utils/directory-upload";
import { findEffectiveUploadGovernanceViolation } from "~~/shared/utils/file-nomenclature";
import { useUploadProgress } from "~/composables/useUploadProgress";

const props = withDefaults(defineProps<{
  type?: "files" | "folder";
  controllerOnly?: boolean;
}>(), {
  type: "files",
  controllerOnly: false,
});

const route = useRoute();
const toast = useToast();
const { folder } = useFolder();
const { orgType } = useRole();
const { user } = useUserSession();
const uploadProgressTracker = useUploadProgress();
const type = ref(resolveUploadPickerMode(props.type));
const storageTarget = useState<"local" | "gdrive">("upload-storage-target", () =>
  resolveUploadStorageTarget({ orgType: orgType.value }),
);
const canUseGDrive = computed(() => orgType.value === "gdrive");
const selectedDestinationId = ref<string | null>(null);
const uploadPhase = ref<"uploading" | "syncing" | null>(null);
const { data: uploadDestinations, refresh: refreshUploadDestinations } = useFetch<UploadDestination[]>(
  "/api/gdrive/upload-destinations",
  { immediate: false },
);
const selectedDestination = computed(() => (uploadDestinations.value || []).find(
  (destination) => destination.id === selectedDestinationId.value,
) || null);
const { activeFolder, selectUploadFolder } = useUploadDestination();
const folderOptions = ref<ActiveUploadFolder[]>([]);
const selectedFolderId = ref<string | null>(null);
const selectedFolder = computed(() => folderOptions.value.find(
  destination => destination.id === selectedFolderId.value,
) || activeFolder.value);
const folderItems = computed(() => folderOptions.value.map(destination => ({
  label: destination.path || destination.name,
  value: destination.id,
})));
const localDestinationItems = computed(() => (uploadDestinations.value || [])
  .filter(destination => destination.available)
  .map(destination => ({ label: destination.name, value: destination.id })));
const localRouteFolderIds = computed(() => [
  ...(folder.value?.breadcrumb || []).map(item => item.id),
  ...(folder.value?.id ? [folder.value.id] : []),
]);
const routeDepartmentDestination = computed(() => (uploadDestinations.value || []).find(
  destination => destination.available
    && Boolean(destination.folderId)
    && localRouteFolderIds.value.includes(destination.folderId!),
) || null);
const localParentId = computed(() => resolveLocalUploadParentId({
  selectedDestinationId: selectedDestinationId.value,
  selectedDepartmentFolderId: selectedDestination.value?.folderId,
  routeFolderId: folder.value?.id,
  routeBreadcrumbIds: localRouteFolderIds.value,
}));

const mergeFolderOptions = (incoming: ActiveUploadFolder[]) => {
  const byId = new Map(folderOptions.value.map(destination => [destination.id, destination]));
  for (const destination of incoming) {
    byId.set(destination.id, { ...byId.get(destination.id), ...destination });
  }
  folderOptions.value = [...byId.values()];
};

const loadFolderChildren = async (parentId: string) => {
  if (!canUseGDrive.value) return;
  const children = await $fetch<ActiveUploadFolder[]>("/api/gdrive/upload-folders", {
    query: { parentId },
  });
  const parent = folderOptions.value.find(destination => destination.id === parentId);
  mergeFolderOptions(children.map(child => ({
    ...child,
    departmentId: child.departmentId || parent?.departmentId || null,
  })));
};

const initializeFolderOptions = async () => {
  if (!canUseGDrive.value) return;
  folderOptions.value = (user.value as any)?.role === "admin"
    ? [{ id: "root", name: "Organization root", path: "Organization root", parentId: null, type: "folder" }]
    : [];
  await loadFolderChildren("root");
  if (activeFolder.value && !folderOptions.value.some(destination => destination.id === activeFolder.value?.id)) {
    mergeFolderOptions([activeFolder.value]);
  }
  selectedFolderId.value = activeFolder.value?.id && folderOptions.value.some(
    destination => destination.id === activeFolder.value?.id,
  )
    ? activeFolder.value.id
    : folderOptions.value[0]?.id || null;
};
const uploadProgress = ref<Record<string, number>>({});
const totalFiles = ref(0);
const uploadedFiles = ref(0);
const isUploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const emit = defineEmits(["success"]);
const filesRefreshTrigger = useState<number>("files-refresh-trigger", () => 0);
const nomenclatureQuery = computed(() => selectedDestinationId.value && selectedDestinationId.value !== "root"
  ? { departmentId: selectedDestinationId.value }
  : {});
const { data: nomenclaturePolicy, refresh: refreshNomenclaturePolicy } = useFetch<any>(
  "/api/nomenclature/effective",
  { query: nomenclatureQuery },
);

watch([orgType, () => (user.value as any)?.role], ([value]) => {
  storageTarget.value = resolveUploadStorageTarget({ orgType: value });
  refreshUploadDestinations();
  if (value === "gdrive") {
    initializeFolderOptions().catch((error) => {
      toast.add({
        title: "Folder destinations unavailable",
        description: error?.data?.message || error?.message || "Unable to load Google Drive folders.",
        color: "error",
      });
    });
  }
}, { immediate: true });

watch([uploadDestinations, folder], ([destinations]) => {
  const routeDestination = routeDepartmentDestination.value;
  if (routeDestination) {
    selectedDestinationId.value = routeDestination.id;
    return;
  }
  const current = destinations?.find((destination) => destination.id === selectedDestinationId.value && destination.available);
  if (!current) {
    selectedDestinationId.value = destinations?.find((destination) => destination.available)?.id || null;
  }
}, { immediate: true });

watch(activeFolder, (destination) => {
  if (!destination) return;
  mergeFolderOptions([destination]);
  selectedFolderId.value = destination.id;
}, { deep: true });

watch(selectedFolderId, async (folderId) => {
  if (!folderId) return;
  const destination = folderOptions.value.find(folder => folder.id === folderId);
  if (!destination) return;
  selectUploadFolder(destination);
  if (destination.departmentId) selectedDestinationId.value = destination.departmentId;
  else if (destination.id === "root") selectedDestinationId.value = "root";
  try {
    await loadFolderChildren(destination.id);
  } catch (error: any) {
    toast.add({
      title: "Folder could not be expanded",
      description: error?.data?.message || error?.message || "Unable to load child folders.",
      color: "error",
    });
  }
});

const createDirectoryTree = async (paths: string[]) => {
  if (!paths.length) return { created: [] as string[] };
  return await $fetch<{ created: string[] }>("/api/folder/upload-tree", {
    method: "POST",
    body: {
      paths,
      departmentId: selectedDestinationId.value,
      destinationFolderId: canUseGDrive.value ? selectedFolderId.value : localParentId.value,
      storageTarget: canUseGDrive.value && storageTarget.value === "gdrive" ? "gdrive" : "local",
      bucket: String(route.params.bucket || "org"),
    },
  });
};

const processSelection = async (selection: DirectoryUploadSelection) => {
  const filesList = selection.files || [];
  const folderPaths = normalizeDirectoryManifest(selection.directories || []);
  if (!filesList.length && !folderPaths.length) {
    toast.add({ title: "No files or folders found", color: "error" });
    return;
  }

  if (canUseGDrive.value && storageTarget.value === "gdrive" && !selectedFolderId.value) {
    toast.add({
      title: "Choose an upload folder",
      description: "Select an authorized workspace folder before uploading files.",
      color: "error",
    });
    return;
  }

  if (folderPaths.length) {
    try {
      await $fetch("/api/nomenclature/folder-upload-preflight", {
        method: "POST",
        body: {
          paths: folderPaths,
          departmentId: selectedDestinationId.value,
          destinationFolderId: canUseGDrive.value ? selectedFolderId.value : localParentId.value,
        },
      });
    } catch (error: any) {
      toast.add({
        title: "Folder naming rule not met",
        description: error?.data?.message || error?.message || "One or more folders do not follow the configured nomenclature.",
        color: "error",
      });
      if (fileInput.value) fileInput.value.value = "";
      return;
    }
  }

  await refreshNomenclaturePolicy();
  if (!filesList.length) {
    await createDirectoryTree(folderPaths);
    toast.add({
      title: "Folder upload complete",
      description: `Created ${folderPaths.length} folder(s), including empty folders.`,
      color: "success",
    });
    filesRefreshTrigger.value++;
    emit("success");
    return;
  }
  const violation = findEffectiveUploadGovernanceViolation(
    filesList.map(file => file.name),
    nomenclaturePolicy.value,
  );
  if (violation) {
    toast.add({
      title: "Upload rejected",
      description: `${violation.filename}: ${violation.message}`,
      color: "error",
    });
    if (fileInput.value) fileInput.value.value = "";
    return;
  }

  await createDirectoryTree(folderPaths);

  totalFiles.value = filesList.length;
  uploadedFiles.value = 0;
  isUploading.value = true;
  uploadPhase.value = "uploading";
  const destination = canUseGDrive.value && storageTarget.value === "gdrive" ? "Google Drive" : "local DAM storage";
  uploadProgressTracker.startUpload(
    filesList.map(f => ({ name: f.name, size: f.size })),
    destination
  );
  toast.add({ title: "Uploading...", description: `Uploading ${filesList.length} file(s) to ${destination}...`, color: "blue" });

  try {
    const containsFolderPaths = filesList.some((file) => Boolean((file as any).customPath || file.webkitRelativePath));
    const results = containsFolderPaths
      ? await filesList.reduce(async (pending, file) => [...await pending, await uploadFile(file)], Promise.resolve([] as any[]))
      : await Promise.all([...filesList].map(uploadFile));
    const localResult = results.find((result) => result?.storage?.type === "local");
    const verifiedLocation = localResult?.storage?.relativePath
      ? ` Verified on disk at local dam storage/${localResult.storage.relativePath}.`
      : "";
    const outcomes = results.flatMap((result) => result?.files || (result?.storage ? [result.storage] : []));
    const renamed = outcomes.filter((outcome) => outcome?.renamed);
    const duplicates = outcomes.filter((outcome) => outcome?.duplicate);
    const organizationNotes = [
      renamed.length ? `${renamed.length} name collision(s) were numbered automatically.` : "",
      duplicates.length ? `${duplicates.length} byte-identical file(s) reuse existing content.` : "",
    ].filter(Boolean).join(" ");
    toast.add({
      title: "Upload Complete",
      description: `Successfully uploaded ${filesList.length} file(s). ${organizationNotes}${verifiedLocation}`.trim(),
      color: "green",
    });
    uploadPhase.value = "syncing";
    uploadProgressTracker.setPhase("syncing");
    uploadProgressTracker.completeUpload();
    filesRefreshTrigger.value++;
    emit("success");
    const responseDestination = results.find((result) => result?.destination)?.destination;
    if (responseDestination?.route && selectedFolderId.value !== "root") {
      await navigateTo(responseDestination.route);
    }
  } catch (err: any) {
    console.error("Upload error:", err);
    uploadProgressTracker.failUpload(err?.message);
    toast.add({ title: "Upload Failed", description: err?.message || "File upload failed.", color: "red" });
  } finally {
    isUploading.value = false;
    uploadPhase.value = null;
    uploadProgress.value = {};
    if (fileInput.value) {
      fileInput.value.value = "";
    }
  }
};

const processFiles = async (filesList: File[]) => processSelection({
  files: filesList,
  directories: getUploadDirectoryPaths(filesList.map(
    file => (file as any).customPath || file.webkitRelativePath || file.name,
  )),
});

const uploadFiles = async (event: any) => {
  const files = event?.target?.files;
  if (files && files.length) {
    await processFiles([...files]);
  }
};

const openUploadPicker = async () => {
  if (!import.meta.client) return;

  try {
    const selection = await chooseUploadSource({
      mode: type.value,
      pickerWindow: window,
      openFallback: () => fileInput.value?.click(),
    });

    if (selection) {
      await processSelection(selection);
    }
  } catch (error: any) {
    toast.add({
      title: "Folder could not be selected",
      description: error?.message || "The selected folder could not be read.",
      color: "error",
    });
  }
};

const uploadFile = async (file: File) => {
  const relativePath = (file as any).customPath || file.webkitRelativePath || file.name;
  const isGDrive = canUseGDrive.value && storageTarget.value === "gdrive";

  if (isGDrive) {
    const resolvedId = resolveDriveRouteFolderId({
      idParam: route.params.id as string | string[] | undefined,
      organizationId: (user.value as any)?.organizationId,
    });
    uploadProgress.value[relativePath] = 0;
    uploadProgressTracker.updateItemProgress(file.name, 5);
    const formData = new FormData();
    formData.append("files", file);

    try {
      const gdriveUploadPromise = new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", buildDriveUploadUrl({
          parentId: resolvedId,
          folderId: selectedFolderId.value,
          relativePath,
          departmentId: selectedDestinationId.value,
        }));
        xhr.responseType = "json";
        xhr.timeout = 180000;
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100);
            uploadProgress.value[relativePath] = pct;
            uploadProgressTracker.updateItemProgress(file.name, pct);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            uploadProgress.value[relativePath] = 100;
            uploadProgressTracker.setItemComplete(file.name);
            resolve(xhr.response || { success: true, files: [] });
          } else {
            const errText = xhr.response?.message || xhr.statusText || `Upload failed (${xhr.status})`;
            uploadProgressTracker.setItemError(file.name, errText);
            reject(new Error(errText));
          }
        };
        xhr.onerror = () => {
          uploadProgressTracker.setItemError(file.name, "Connection lost");
          reject(new Error("Google Drive upload connection failed."));
        };
        xhr.ontimeout = () => {
          uploadProgressTracker.setItemError(file.name, "Timed out");
          reject(new Error("Google Drive upload timed out."));
        };
        xhr.send(formData);
      });

      const uploadResult = await gdriveUploadPromise;
      uploadProgress.value[relativePath] = 100;
      uploadProgressTracker.setItemComplete(file.name);
      uploadedFiles.value++;
      return { ...uploadResult, storage: { type: "gdrive" } };
    } catch (err: any) {
      console.error("Google Drive upload failed:", err);
      uploadProgress.value[relativePath] = 100;
      uploadProgressTracker.setItemError(file.name, err?.message || "Upload failed");
      throw err;
    }
  }

  const fileType = file.type.split("/")[0];
  let dimensions: string | null = null;
  if (fileType === "image") {
    const image = new Image();
    image.src = URL.createObjectURL(file);
    await new Promise<void>((resolve) => {
      image.onload = () => {
        dimensions = image.width + "x" + image.height;
        resolve();
      };
      image.onerror = () => resolve();
    });
  }
  uploadProgress.value[relativePath] = 0;
  uploadProgressTracker.updateItemProgress(file.name, 0);

  const pathForFolder = (file as any).customPath || file.webkitRelativePath;
  let targetRelativePath = file.name;
  if (pathForFolder) {
    const pathParts = pathForFolder.split("/");
    pathParts.pop();
    if (pathParts.length > 0) {
      targetRelativePath = `${pathParts.join("/")}/${file.name}`;
    }
  }

  const result = await uploadFileToLocalStorage({
    file,
    bucket: String(route.params.bucket || "org"),
    parentId: localParentId.value,
    departmentId: selectedDestinationId.value,
    relativePath: targetRelativePath,
    dimensions,
    onProgress: (value) => {
      uploadProgress.value[relativePath] = value;
      uploadProgressTracker.updateItemProgress(file.name, value);
    },
  });
  uploadedFiles.value++;
  uploadProgress.value[relativePath] = 100;
  uploadProgressTracker.setItemComplete(file.name);
  return result;
};

const overallProgress = computed(() => {
  if (!Object.keys(uploadProgress.value).length) return 0;
  const sum = Object.values(uploadProgress.value).reduce(
    (acc, val) => acc + val,
    0
  );
  return Math.round(sum / Object.keys(uploadProgress.value).length);
});

defineExpose({ processFiles, processSelection });
</script>

<template>
  <div v-if="!controllerOnly" class="flex w-full min-w-0 flex-col gap-3">
    <!-- Destination Selector (Full Width) -->
    <div class="destination-switch flex w-full items-center gap-2.5 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] px-3.5 py-2 shadow-sm" aria-label="Upload destination">
      <Icon :name="canUseGDrive ? 'logos:google-drive' : 'lucide:hard-drive'" class="size-4 shrink-0 text-[#ff5733]" />
      <span class="text-xs font-medium text-[var(--dam-muted)] shrink-0">Target:</span>
      <select
        v-if="canUseGDrive"
        v-model="selectedFolderId"
        class="min-w-0 flex-1 rounded-lg border border-[var(--dam-line)] bg-[var(--dam-panel)] px-2.5 py-1.5 text-xs font-medium text-[var(--dam-ink)] focus:outline-none focus:ring-1 focus:ring-primary-500"
        aria-label="Select upload folder"
      >
        <option v-for="item in folderItems" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
      <select
        v-else
        v-model="selectedDestinationId"
        class="min-w-0 flex-1 rounded-lg border border-[var(--dam-line)] bg-[var(--dam-panel)] px-2.5 py-1.5 text-xs font-medium text-[var(--dam-ink)] focus:outline-none focus:ring-1 focus:ring-primary-500"
        aria-label="Select upload department"
      >
        <option v-for="item in localDestinationItems" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
    </div>

    <!-- Upload Action Buttons -->
    <div class="flex w-full items-center gap-2">
      <button
        type="button"
        class="dam-btn-primary flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer shadow-md transition hover:scale-[1.01]"
        @click="openUploadPicker"
      >
        <Icon :name="type === 'folder' ? 'lucide:folder-up' : 'lucide:file-up'" class="size-4" />
        <span>{{ type === 'folder' ? 'Upload Folder' : 'Upload Files' }}</span>
      </button>

      <UTooltip :text="type === 'folder' ? 'Switch to File Upload' : 'Switch to Folder Upload'" arrow :delay-duration="0">
        <button
          type="button"
          aria-label="Toggle File or Folder Mode"
          class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] text-[var(--dam-muted)] transition hover:border-[#ff5733] hover:text-white"
          @click="type = type === 'folder' ? 'files' : 'folder'"
        >
          <Icon :name="type === 'folder' ? 'lucide:folder' : 'lucide:file'" class="size-4" />
        </button>
      </UTooltip>

      <input
        ref="fileInput"
        type="file"
        :webkitdirectory="type === 'folder'"
        :multiple="type === 'files'"
        @change="uploadFiles"
        class="hidden"
      />
    </div>

    <!-- Upload Progress Bar (Inline) -->
    <div v-if="isUploading" class="w-full rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] p-3 space-y-2 shadow-sm">
      <div class="flex items-center justify-between text-xs font-semibold text-[var(--dam-ink)]">
        <span class="flex items-center gap-1.5">
          <Icon name="lucide:loader" class="size-3.5 animate-spin text-[#ff5733]" />
          {{ uploadPhase === "syncing" ? "Syncing with Storage..." : `Uploading ${uploadedFiles}/${totalFiles}...` }}
        </span>
        <span class="font-mono text-xs font-bold text-[#ff5733]">{{ overallProgress }}%</span>
      </div>
      <div class="relative h-2 w-full overflow-hidden rounded-full bg-[var(--dam-line)]">
        <div
          class="h-full rounded-full bg-gradient-to-r from-[#ff5733] via-orange-500 to-amber-400 transition-all duration-300 ease-out"
          :style="{ width: `${overallProgress}%` }"
        />
      </div>
    </div>
  </div>
</template>
