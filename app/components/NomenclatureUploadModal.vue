<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute } from "vue-router";

const props = defineProps<{
  open: boolean;
  files: File[];
  folder: any;
}>();

const emit = defineEmits(["update:open", "success", "close"]);

const route = useRoute();
const { departmentId, isAdmin, isDeptHead } = useRole();

// Fetch the department's nomenclature
const { data: nomenclature } = await useFetch<any>(
  () => departmentId.value ? `/api/nomenclature/${departmentId.value}` : null
);

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

  const currentFolderPath = props.folder?.path
    ? "/" + props.folder.path
    : (route.params.bucket as string);

  try {
    const uploadPromises = props.files.map(async (file, index) => {
      const finalName = getTargetFileName(file, index);
      const renamedFile = new File([file], finalName, { type: file.type });
      
      let dimensions: string | null = null;
      const fileType = file.type.split("/")[0];
      if (fileType === "image") {
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

      const partSize = chunkSize(renamedFile.size);
      const upload = useMultipartUpload(
        `/upload/${route.params.bucket}/${route.params.id || "root"}`,
        {
          partSize,
          concurrent: 5,
          prefix: currentFolderPath,
          fetchOptions: {
            headers: {
              "x-amz-meta-dimensions": dimensions,
              "x-amz-meta-content-type": renamedFile.type,
            },
          },
        }
      );

      const { progress, completed } = upload(renamedFile);
      watch(progress, (val) => {
        uploadProgress.value[finalName] = val;
      });

      await completed;
      uploadedCount.value++;
      uploadProgress.value[finalName] = 100;
    });

    await Promise.all(uploadPromises);
    
    setTimeout(() => {
      isUploading.value = false;
      emit("success");
      emit("update:open", false);
    }, 1000);

  } catch (error: any) {
    console.error("Upload failed:", error);
    errorMessage.value = error?.message || "An error occurred during upload. Please try again.";
    isUploading.value = false;
  }
};

const overallProgress = computed(() => {
  const keys = Object.keys(uploadProgress.value);
  if (!keys.length) return 0;
  const sum = keys.reduce((acc, key) => acc + uploadProgress.value[key], 0);
  return Math.round(sum / keys.length);
});
</script>

<template>
  <UModal :open="open" @update:open="$emit('update:open', $event)" :dismissible="!isUploading" size="xl">
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
              <span class="font-semibold text-sm">Overall Progress</span>
              <span class="text-xs font-mono">{{ uploadedCount }} / {{ totalCount }} files done</span>
            </div>
            <UProgress :value="overallProgress" color="primary" />
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
              <UProgress :value="uploadProgress[getTargetFileName(file, files.indexOf(file))] || 0" size="sm" color="primary" />
            </div>
          </div>
        </div>

        <div v-else class="space-y-4">
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
          @click="$emit('update:open', false)"
          :disabled="isUploading"
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
