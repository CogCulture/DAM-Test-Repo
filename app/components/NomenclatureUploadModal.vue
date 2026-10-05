<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute } from "vue-router";
import { uploadFileToLocalStorage } from "~/composables/useLocalUpload";
import { useRole } from "~/composables/useRole";
import { resolveDriveRouteFolderId, resolveUploadStorageTarget } from "~~/shared/utils/drive-storage";
import { getUploadDirectoryPaths } from "~~/shared/utils/folder-upload-target";
import { useUploadProgress } from "~/composables/useUploadProgress";

const props = defineProps<{
  open: boolean;
  files: File[];
  folder: any;
  destinationId?: string | null;
  destinationName?: string;
  folderId?: string | null;
}>();

const emit = defineEmits(["update:open", "success", "close"]);

const route = useRoute();
const { orgType } = useRole();
const { user } = useUserSession();
const uploadProgressTracker = useUploadProgress();
const storageTarget = useState<"local" | "gdrive">("upload-storage-target", () =>
  resolveUploadStorageTarget({ orgType: orgType.value }),
);

watch(orgType, (value) => {
  storageTarget.value = resolveUploadStorageTarget({ orgType: value });
}, { immediate: true });

// Resolve the uploader's effective department template, including admin fallback.
const policyQuery = computed(() => props.destinationId && props.destinationId !== "root"
  ? { departmentId: props.destinationId }
  : {});
const { data: policy, refresh: refreshPolicy } = await useFetch<any>(
  "/api/nomenclature/effective",
  { query: policyQuery },
);
const nomenclature = computed(() => policy.value?.nomenclature || null);

watch(() => props.open, (open) => {
  if (open) refreshPolicy();
});

// Configuration state for each file: index -> { [segmentKey]: value }
const fileConfigs = ref<Record<number, Record<string, string>>>({});
const isUploading = ref(false);
const uploadProgress = ref<Record<string, number>>({});
const uploadedCount = ref(0);
const totalCount = ref(0);
const errorMessage = ref("");

// Initialize configs when files or nomenclature change
const initializeConfigs = () => {
  if (!props.files) return;
  fileConfigs.value = {};
  totalCount.value = props.files.length;
  uploadedCount.value = 0;
  uploadProgress.value = {};
  errorMessage.value = "";

  props.files.forEach((file, index) => {
    fileConfigs.value[index] = {};
    const lastDot = file.name.lastIndexOf(".");
    const nameWithoutExt = lastDot > 0 ? file.name.slice(0, lastDot) : file.name;
    const parts = nameWithoutExt.split("_");

    if (nomenclature.value?.segments) {
      nomenclature.value.segments.forEach((seg: any, segIndex: number) => {
        const partVal = parts[segIndex];
        if (partVal) {
          if (seg.allowedValues?.length) {
            if (seg.allowedValues.includes(partVal)) {
              fileConfigs.value[index][seg.key] = partVal;
            } else {
              fileConfigs.value[index][seg.key] = seg.allowedValues[0] || "";
            }
          } else {
            fileConfigs.value[index][seg.key] = partVal;
          }
        } else {
          fileConfigs.value[index][seg.key] = seg.allowedValues?.[0] || "";
        }
      });
    }
  });
};

watch(
  [() => props.files, () => nomenclature.value],
  () => {
    initializeConfigs();
  },
  { immediate: true, deep: true }
);

const segments = computed(() => {
  return nomenclature.value?.segments || [];
});

const getExtension = (fileName: string) => {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot >= 0 ? fileName.slice(lastDot) : "";
};

const allowedExtensions = computed<string[]>(() =>
  Array.isArray(nomenclature.value?.allowedExtensions)
    ? nomenclature.value.allowedExtensions.map((value: string) => value.toLowerCase())
    : []
);

const isExtensionAllowed = (fileName: string) => {
  if (!allowedExtensions.value.length) return true;
  return allowedExtensions.value.includes(getExtension(fileName).replace(/^\./, "").toLowerCase());
};

const getTargetFileName = (file: File, index: number) => {
  if (!segments.value.length) return file.name;
  
  const ext = getExtension(file.name);
  const parts = segments.value.map((seg: any) => {
    const val = fileConfigs.value[index]?.[seg.key] || "";
    const cleanVal = val.trim().replace(/[\/\\:*?"<>|]/g, "-");
    return cleanVal || `[${seg.label}]`;
  });
  
  return parts.join("_") + ext;
};

// Check if nomenclature form is valid (no empty segments if required/provided)
const isFormValid = computed(() => {
  if (!segments.value.length) return true;
  for (let i = 0; i < props.files.length; i++) {
    if (!isExtensionAllowed(props.files[i]!.name)) return false;
    for (const seg of segments.value) {
      const val = fileConfigs.value[i]?.[seg.key];
      if (!val || !val.trim()) return false;
    }
  }
  return true;
});

const handleUpload = async () => {
  if (isUploading.value) return;
  isUploading.value = true;
  errorMessage.value = "";
  uploadedCount.value = 0;

  try {
    const folderPaths = getUploadDirectoryPaths(props.files.map(
      file => (file as any).customPath || file.webkitRelativePath || file.name,
    ));
    if (folderPaths.length) {
      await $fetch("/api/nomenclature/folder-upload-preflight", {
        method: "POST",
        body: {
          paths: folderPaths,
          departmentId: props.destinationId,
          destinationFolderId: props.folderId,
        },
      });
    }

    const destination = props.destinationName || (orgType.value === "gdrive" && storageTarget.value === "gdrive" ? "Google Drive" : "DAM Storage");
    uploadProgressTracker.startUpload(
      props.files.map((file, idx) => ({
        name: getTargetFileName(file, idx),
        size: file.size,
      })),
      destination,
    );

    let uploadResult: any = null;
    const uploadPromises = props.files.map(async (file, index) => {
      const finalName = getTargetFileName(file, index);
      const renamedFile = new File([file], finalName, { type: file.type });
      
      let dimensions: string | null = null;
      const fileType = file.type.split("/")[0];
      const isDesignFile = /\.(psd|ai|eps|indd|raw|cr2|nef)$/i.test(finalName);
      if (fileType === "image" && !isDesignFile) {
        const image = new Image();
        image.src = URL.createObjectURL(file);
        await new Promise<void>((resolve) => {
          image.onload = () => {
            dimensions = image.width + "x" + image.height;
            resolve();
          };
          image.onerror = () => resolve(); // fallback
        });
      }

      uploadProgress.value[finalName] = 0;
      uploadProgressTracker.updateItemProgress(finalName, 5);

      const isGDrive = orgType.value === "gdrive" && storageTarget.value === "gdrive";

      if (isGDrive) {
        const resolvedId = resolveDriveRouteFolderId({
          idParam: route.params.id as string | string[] | undefined,
          organizationId: (user.value as any)?.organizationId,
        });
        const originalPath = (file as any).customPath || file.webkitRelativePath || file.name;
        const originalParts = originalPath.split("/");
        originalParts.pop();
        const targetRelativePath = originalParts.length ? `${originalParts.join("/")}/${finalName}` : finalName;

        try {
          // Step 1: Get resumable session URL from server (no file data sent)
          const session = await $fetch<{
            sessionUrl: string;
            folderId: string;
            finalName: string;
            renamed: boolean;
            originalName: string;
          }>("/api/gdrive/upload-session", {
            method: "POST",
            body: {
              fileName: finalName,
              fileSize: renamedFile.size,
              contentType: renamedFile.type || "application/octet-stream",
              parentId: resolvedId,
              folderId: props.folderId,
              relativePath: targetRelativePath,
              departmentId: props.destinationId,
            },
          });

          uploadProgressTracker.updateItemProgress(finalName, 5);

          // Step 2: Upload file in optimized chunks through our server (OAuth token stays server-side)
          // Larger chunks drastically reduce HTTP request overhead, round-trip latency, and maximize throughput.
          // Must be a multiple of 256 KB (262,144 bytes) for Google Drive Resumable Upload.
          const getOptimalChunkSize = (size: number): number => {
            if (size >= 1024 * 1024 * 1024) {
              return 64 * 1024 * 1024;
            }
            if (size >= 100 * 1024 * 1024) {
              return 32 * 1024 * 1024;
            }
            if (size >= 25 * 1024 * 1024) {
              return 16 * 1024 * 1024;
            }
            return 8 * 1024 * 1024;
          };

          const CHUNK_SIZE = getOptimalChunkSize(renamedFile.size);
          const totalSize = renamedFile.size;
          const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
          const contentType = renamedFile.type || "application/octet-stream";
          let uploadedFile: any = null;

          for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const rangeStart = chunkIndex * CHUNK_SIZE;
            const rangeEnd = Math.min(rangeStart + CHUNK_SIZE - 1, totalSize - 1);
            const chunk = renamedFile.slice(rangeStart, rangeEnd + 1);
            const isFinalChunk = chunkIndex === totalChunks - 1;

            let chunkResult: { done: boolean; file?: any } | null = null;
            let lastError: any = null;

            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                chunkResult = await new Promise<{ done: boolean; file?: any }>((resolve, reject) => {
                  const xhr = new XMLHttpRequest();
                  const params = new URLSearchParams({
                    sessionUrl: session.sessionUrl,
                    rangeStart: String(rangeStart),
                    rangeEnd: String(rangeEnd),
                    totalSize: String(totalSize),
                    contentType,
                  });
                  xhr.open("POST", `/api/gdrive/upload-chunk?${params}`);
                  xhr.responseType = "json";
                  xhr.timeout = isFinalChunk ? 10 * 60 * 1000 : 5 * 60 * 1000;

                  xhr.upload.onprogress = (ev) => {
                    if (ev.lengthComputable) {
                      const chunkFraction = (chunkIndex + ev.loaded / ev.total) / totalChunks;
                      const pct = 5 + Math.round(chunkFraction * 90);
                      uploadProgress.value[finalName] = pct;
                      uploadProgressTracker.updateItemProgress(finalName, pct);
                    }
                  };

                  xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                      resolve(xhr.response);
                    } else {
                      const errMsg = xhr.response?.message || xhr.response?.statusMessage || `Chunk ${chunkIndex + 1}/${totalChunks} failed (${xhr.status})`;
                      reject(new Error(errMsg));
                    }
                  };
                  xhr.onerror = () => reject(new Error("Connection to server lost during chunk upload."));
                  xhr.ontimeout = () => reject(new Error(`Chunk ${chunkIndex + 1} timed out.`));

                  xhr.setRequestHeader("Content-Type", "application/octet-stream");
                  xhr.setRequestHeader("X-Session-Url", session.sessionUrl);
                  xhr.setRequestHeader("X-Range-Start", String(rangeStart));
                  xhr.setRequestHeader("X-Range-End", String(rangeEnd));
                  xhr.setRequestHeader("X-Total-Size", String(totalSize));
                  xhr.setRequestHeader("X-Content-Type", contentType);

                  xhr.send(chunk);
                });

                break;
              } catch (err: any) {
                lastError = err;
                if (attempt < 3) {
                  await new Promise((r) => setTimeout(r, attempt * 1500));
                }
              }
            }

            if (!chunkResult) {
              throw lastError || new Error(`Chunk ${chunkIndex + 1}/${totalChunks} failed.`);
            }

            if (chunkResult.done) {
              uploadedFile = chunkResult.file;
              break;
            }
          }

          uploadResult = { success: true, files: [{ id: uploadedFile?.id, finalName: session.finalName }] };
        } catch (err: any) {
          console.error("GDrive upload failed for", finalName, err);
          errorMessage.value = err?.data?.message || err?.message || "Upload failed.";
          uploadProgress.value[finalName] = 100;
          uploadProgressTracker.setItemError(finalName, err?.data?.message || err?.message || "Upload failed");
          uploadedCount.value++;
          throw err;
        }
        uploadProgress.value[finalName] = 100;
        uploadProgressTracker.setItemComplete(finalName);
        uploadedCount.value++;
        return;
      }

      const pathForFolder = (file as any).customPath || file.webkitRelativePath;
      const pathParts = pathForFolder ? pathForFolder.split("/") : [];
      pathParts.pop();
      const relativePath = pathParts.length > 0
        ? `${pathParts.join("/")}/${finalName}`
        : finalName;

      await uploadFileToLocalStorage({
        file: renamedFile,
        bucket: String(route.params.bucket || "org"),
        parentId: props.folder?.id || "root",
        relativePath,
        dimensions,
        onProgress: (value) => {
          uploadProgress.value[finalName] = value;
          uploadProgressTracker.updateItemProgress(finalName, value);
        },
      });
      uploadedCount.value++;
      uploadProgress.value[finalName] = 100;
      uploadProgressTracker.setItemComplete(finalName);
    });

    await Promise.all(uploadPromises);
    uploadProgressTracker.completeUpload();
    emit("success", uploadResult);
    emit("update:open", false);
  } catch (error: any) {
    console.error("Upload failed:", error);
    uploadProgressTracker.failUpload(error?.message);
    errorMessage.value = error?.message || "An error occurred during upload. Please try again.";
  } finally {
    isUploading.value = false;
  }
};

const overallProgress = computed(() => {
  const keys = Object.keys(uploadProgress.value);
  if (!keys.length) return 0;
  const sum = keys.reduce((acc, key) => acc + uploadProgress.value[key], 0);
  return Math.round(sum / keys.length);
});

const handleClose = () => {
  isUploading.value = false;
  errorMessage.value = "";
  uploadProgress.value = {};
  uploadedCount.value = 0;
  emit("update:open", false);
  emit("close");
};
</script>

<template>
  <UModal :open="open" @update:open="handleClose" :dismissible="true" size="xl">
    <template #title>
      <div class="flex items-center gap-2">
        <Icon name="lucide:file-signature" class="size-5 text-primary" />
        <span>Nomenclature Upload Wizard</span>
      </div>
    </template>
    <template #description>
      Configure nomenclature naming rules for your files before uploading.
    </template>

    <template #body>
      <div class="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
        <UAlert
          v-if="errorMessage"
          title="Upload Error"
          :description="errorMessage"
          color="error"
          variant="soft"
          icon="lucide:alert-circle"
          class="mb-4"
        />

        <div v-if="isUploading" class="space-y-4">
          <div class="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
            <div class="flex justify-between items-center mb-2">
              <span class="font-semibold text-sm">Uploading to {{ destinationName || "Google Drive" }}</span>
              <span class="text-xs font-mono">{{ uploadedCount }} / {{ totalCount }} files done</span>
            </div>
            <UProgress :model-value="overallProgress" :max="100" color="primary" />
          </div>

          <div class="space-y-3 max-h-60 overflow-y-auto">
            <div
              v-for="file in files"
              :key="file.name"
              class="text-xs bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-3 rounded-lg"
            >
              <div class="flex justify-between mb-1 items-center gap-4">
                <span class="truncate font-mono font-medium">{{ getTargetFileName(file, files.indexOf(file)) }}</span>
                <span class="font-mono text-neutral-500 shrink-0">{{ (uploadProgress[getTargetFileName(file, files.indexOf(file))] || 0).toFixed(0) }}%</span>
              </div>
              <UProgress :model-value="uploadProgress[getTargetFileName(file, files.indexOf(file))] || 0" :max="100" size="sm" color="primary" />
            </div>
          </div>
        </div>

        <div v-else class="space-y-4">
          <UAlert
            v-if="allowedExtensions.length"
            title="Allowed file formats"
            :description="`Only ${allowedExtensions.map(ext => '.' + ext).join(', ')} files can be stored for this department. This rule also applies to administrators and Department Heads.`"
            color="info"
            variant="soft"
            icon="lucide:file-check-2"
          />

          <div
            v-for="(file, index) in files"
            :key="index"
            class="p-4 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 rounded-xl space-y-4 shadow-sm"
          >
            <div class="flex justify-between items-start gap-4">
              <div>
                <span class="text-xs text-neutral-400 font-medium block">Original Filename</span>
                <span class="text-sm font-semibold truncate max-w-md block font-mono text-neutral-700 dark:text-neutral-300">
                  {{ file.name }}
                </span>
              </div>
              <span class="text-xs px-2.5 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded-full font-medium font-mono shrink-0">
                {{ (file.size / 1024 / 1024).toFixed(2) }} MB
              </span>
            </div>
            <UAlert
              v-if="!isExtensionAllowed(file.name)"
              title="File format not allowed"
              :description="`The .${getExtension(file.name).replace(/^\./, '') || '(none)'} extension is not permitted by the department policy.`"
              color="error"
              variant="soft"
              icon="lucide:shield-x"
            />

            <div class="bg-primary-50/50 dark:bg-primary-950/20 border border-primary-500/10 rounded-lg p-3">
              <span class="text-xs text-primary-500 dark:text-primary-400 font-semibold block mb-1">Target Filename Preview</span>
              <span class="text-xs font-mono font-bold text-primary-600 dark:text-primary-300 break-all">
                {{ getTargetFileName(file, index) }}
              </span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div v-for="seg in segments" :key="seg.key">
                <UFormField :label="seg.label">
                  <!-- Custom implementation matching dropdowns -->
                  <USelect
                    v-if="seg.allowedValues && seg.allowedValues.length > 0"
                    v-model="fileConfigs[index][seg.key]"
                    :items="seg.allowedValues.map(val => ({ label: val, value: val }))"
                    class="w-full"
                    placeholder="Select value"
                  />
                  <UInput
                    v-else
                    v-model="fileConfigs[index][seg.key]"
                    placeholder="Enter value"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          @click="handleClose"
        >
          Cancel
        </UButton>
        <UButton
          v-if="!isUploading"
          color="primary"
          variant="solid"
          @click="handleUpload"
          :disabled="!isFormValid"
          icon="lucide:upload-cloud"
        >
          Upload Renamed Files
        </UButton>
      </div>
    </template>
  </UModal>
</template>
