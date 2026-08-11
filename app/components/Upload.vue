<script setup lang="ts">
import { useFolder } from "~/composables/useFolder";
import { uploadFileToLocalStorage } from "~/composables/useLocalUpload";
import { useRole } from "~/composables/useRole";
import { useToast } from "~/composables/useToast";
import { resolveDriveRouteFolderId, resolveUploadStorageTarget } from "~~/shared/utils/drive-storage";
import { resolveUploadPickerMode } from "~~/shared/utils/upload-picker";
import { buildDriveUploadUrl, type UploadDestination } from "~~/shared/utils/department-upload";
import { useUploadDestination, type ActiveUploadFolder } from "~/composables/useUploadDestination";

const props = withDefaults(defineProps<{
  type?: "files" | "folder";
}>(), {
  type: "files",
});

const route = useRoute();
const toast = useToast();
const { folder } = useFolder();
const { orgType } = useRole();
const { user } = useUserSession();
const type = ref(resolveUploadPickerMode(props.type));
const storageTarget = useState<"local" | "gdrive">("upload-storage-target", () =>
  resolveUploadStorageTarget({ orgType: orgType.value }),
);
const canUseGDrive = computed(() => orgType.value === "gdrive");
const selectedDestinationId = ref<string | null>(null);
const uploadPhase = ref<"uploading" | "syncing" | null>(null);
const { data: uploadDestinations, refresh: refreshUploadDestinations } = await useFetch<UploadDestination[]>(
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
const nomenclatureOpen = ref(false);
const nomenclatureFiles = ref<File[]>([]);
const nomenclatureQuery = computed(() => selectedDestinationId.value && selectedDestinationId.value !== "root"
  ? { departmentId: selectedDestinationId.value }
  : {});
const { data: nomenclaturePolicy, refresh: refreshNomenclaturePolicy } = await useFetch<any>(
  "/api/nomenclature/effective",
  { query: nomenclatureQuery },
);

const handleNomenclatureSuccess = async (result?: any) => {
  uploadPhase.value = "syncing";
  filesRefreshTrigger.value++;
  emit("success");
  if (result?.destination?.route && selectedFolderId.value !== "root") {
    await navigateTo(result.destination.route);
  }
  uploadPhase.value = null;
};

watch([orgType, () => (user.value as any)?.role], ([value]) => {
  storageTarget.value = resolveUploadStorageTarget({ orgType: value });
  if (value === "gdrive") {
    refreshUploadDestinations();
    initializeFolderOptions().catch((error) => {
      toast.add({
        title: "Folder destinations unavailable",
        description: error?.data?.message || error?.message || "Unable to load Google Drive folders.",
        color: "error",
      });
    });
  }
}, { immediate: true });

watch(uploadDestinations, (destinations) => {
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

const processFiles = async (filesList: File[]) => {
  if (!filesList || !filesList.length) {
    toast.add({ title: "No files found", description: "Empty folders cannot be uploaded.", color: "red" });
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

  await refreshNomenclaturePolicy();
  if (nomenclaturePolicy.value?.enforced) {
    nomenclatureFiles.value = filesList;
    nomenclatureOpen.value = true;
    if (fileInput.value) fileInput.value.value = "";
    return;
  }

  totalFiles.value = filesList.length;
  uploadedFiles.value = 0;
  isUploading.value = true;
  uploadPhase.value = "uploading";
  const destination = canUseGDrive.value && storageTarget.value === "gdrive" ? "Google Drive" : "local DAM storage";
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
    filesRefreshTrigger.value++;
    emit("success");
    const responseDestination = results.find((result) => result?.destination)?.destination;
    if (responseDestination?.route && selectedFolderId.value !== "root") {
      await navigateTo(responseDestination.route);
    }
  } catch (err: any) {
    console.error("Upload error:", err);
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

const uploadFiles = async (event: any) => {
  const files = event?.target?.files;
  if (files && files.length) {
    await processFiles([...files]);
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
    const formData = new FormData();
    formData.append("files", file);

    try {
      uploadProgress.value[relativePath] = 10;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      const res = await fetch(buildDriveUploadUrl({
        parentId: resolvedId,
        folderId: selectedFolderId.value,
        relativePath,
        departmentId: selectedDestinationId.value,
      }), {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        let parsedMessage = errText;
        try {
          const json = JSON.parse(errText);
          if (json.message) parsedMessage = json.message;
        } catch {}
        throw new Error(parsedMessage);
      }
      const uploadResult = await res.json().catch(() => ({ success: true, files: [] }));
      uploadProgress.value[relativePath] = 100;
      uploadedFiles.value++;
      return { ...uploadResult, storage: { type: "gdrive" } };
    } catch (err: any) {
      console.error("Google Drive upload failed:", err);
      uploadProgress.value[relativePath] = 100;
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
    parentId: folder.value?.id || "root",
    relativePath: targetRelativePath,
    dimensions,
    onProgress: (value) => {
      uploadProgress.value[relativePath] = value;
    },
  });
  uploadedFiles.value++;
  uploadProgress.value[relativePath] = 100;
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

defineExpose({ processFiles });
</script>

<template>
  <div class="flex w-full min-w-0 flex-wrap items-center gap-2">
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <div class="destination-switch flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] px-3 py-2" aria-label="Upload destination">
        <Icon :name="canUseGDrive ? 'logos:google-drive' : 'lucide:hard-drive'" class="size-4 shrink-0" />
        <USelect
          v-if="canUseGDrive"
          v-model="selectedFolderId"
          :items="folderItems"
          value-key="value"
          label-key="label"
          class="min-w-0 flex-1"
          aria-label="Select upload folder"
        />
        <span v-else class="truncate text-xs font-semibold text-[var(--dam-ink)]">Local development storage</span>
      </div>
      <UButtonGroup class="h-10 min-w-0 flex-1 rounded-xl shadow-[0_12px_30px_rgba(37,99,235,.22)]">
        <UButton
          size="md"
          color="primary"
          variant="solid"
          :icon="type === 'files' ? 'lucide:file-up' : 'lucide:folder-up'"
          @click="type = type === 'folder' ? 'files' : 'folder'"
          class="rounded-l-xl border-r border-white/15 opacity-90"
        />
        <UButton
          color="primary"
          variant="solid"
          :label="type === 'folder' ? 'Upload Folder' : 'Upload Files'"
          class="min-w-0 flex-1 justify-center rounded-r-xl font-semibold"
          @click="fileInput?.click()"
        />
        <input
          ref="fileInput"
          type="file"
          :webkitdirectory="type === 'folder'"
          :multiple="type === 'files'"
          @change="uploadFiles"
          class="hidden"
        />
      </UButtonGroup>
    </div>
    <div v-if="isUploading" class="min-w-32">
      <div class="mb-1 flex justify-between text-[10px] font-medium uppercase tracking-wider text-[var(--dam-muted)]">
        <span>{{ uploadPhase === "syncing" ? "Syncing with Google Drive" : `Uploading to ${selectedFolder?.path || selectedFolder?.name || "Google Drive"}` }}</span>
        <span>{{ overallProgress }}%</span>
      </div>
      <div class="h-1 overflow-hidden rounded-full bg-[var(--dam-line)]">
        <div class="h-full rounded-full bg-primary-500 transition-all" :style="{ width: `${overallProgress}%` }" />
      </div>
    </div>
  </div>
  <NomenclatureUploadModal
    v-model:open="nomenclatureOpen"
    :files="nomenclatureFiles"
    :folder="folder"
    :destination-id="selectedDestinationId"
    :destination-name="selectedFolder?.path || selectedFolder?.name || selectedDestination?.name || 'Google Drive'"
    :folder-id="selectedFolderId"
    @success="handleNomenclatureSuccess"
  />
</template>
