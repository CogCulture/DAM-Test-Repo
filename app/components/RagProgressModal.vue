<script setup lang="ts">
import { damModalUi, isGoogleDriveAsset } from "~/utils/damModal";
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRoute } from "vue-router";
import { useRole } from "~/composables/useRole";
import { resolveRagProgressMessage } from "~~/shared/utils/rag-progress";

const props = defineProps<{
  file: any;
}>();

const emit = defineEmits(["close"]);

const CLIENT_PROCESSING_TIMEOUT_MS = 13 * 60 * 1000;
const ragProgressText = ref("Preparing items for RAG...");
const totalRagCost = ref<number>(0);
const ragIsProcessing = ref(true);
const ragError = ref("");
const route = useRoute();
const refreshTrigger = useState("files-refresh-trigger", () => 0);

const currentFileIndex = ref(0);
const totalFilesCount = ref(0);
const currentFileName = ref("");

let eventSource: EventSource | null = null;
let processingTimeout: number | null = null;

const displayTitle = computed(() => {
  if (Array.isArray(props.file)) {
    return `${props.file.length} selected item${props.file.length === 1 ? '' : 's'}`;
  }
  return props.file?.name || "Selected Asset";
});

const clearProcessingTimeout = () => {
  if (processingTimeout !== null) {
    window.clearTimeout(processingTimeout);
    processingTimeout = null;
  }
};

const failProcessing = (message: string) => {
  ragError.value = message;
  ragIsProcessing.value = false;
  clearProcessingTimeout();
  eventSource?.close();
};

const supportedExtensions = new Set([
  ".txt", ".md", ".markdown", ".pdf", ".pptx", ".docx", ".xlsx", ".xls",
  ".mp4", ".mov", ".avi", ".mkv",
  ".mp3", ".wav", ".m4a",
  ".jpg", ".jpeg", ".png", ".webp"
]);

const isSupportedFile = (item: any) => {
  if (!item || item.type === "folder") return false;
  const name = String(item.name || "");
  const lastDot = name.lastIndexOf(".");
  const ext = lastDot !== -1 ? name.substring(lastDot).toLowerCase() : "";
  return supportedExtensions.has(ext);
};

const expandItems = async (items: any[], bucket: string): Promise<any[]> => {
  const fileList: any[] = [];
  for (const item of items) {
    if (!item) continue;
    if (item.type === "folder") {
      try {
        const isDrive = isGoogleDriveAsset(item) || String(bucket).startsWith("gdrive_");
        const listUrl = isDrive
          ? `/api/gdrive/list/${encodeURIComponent(item.id)}`
          : `/api/files/list/${encodeURIComponent(bucket)}/${encodeURIComponent(item.id)}`;
        const res: any = await $fetch(listUrl);
        const children = res?.data || res?.files || [];
        const nestedFiles = await expandItems(children, bucket);
        fileList.push(...nestedFiles);
      } catch (err) {
        console.warn("Could not expand folder for RAG:", item.name, err);
      }
    } else if (isSupportedFile(item)) {
      fileList.push(item);
    }
  }
  return fileList;
};

onMounted(async () => {
  const { orgType } = useRole();
  const bucket = route.params.bucket ? String(route.params.bucket) : "local";
  const rawItems = Array.isArray(props.file) ? props.file : [props.file];

  ragProgressText.value = "Scanning folders and collecting documents...";
  const targetFiles = await expandItems(rawItems, bucket);

  if (targetFiles.length === 0) {
    failProcessing("No supported documents or media files were found in the selection.");
    return;
  }

  totalFilesCount.value = targetFiles.length;

  const processNextFile = (index: number) => {
    if (index >= targetFiles.length) {
      ragProgressText.value = "All items processed successfully!";
      ragIsProcessing.value = false;
      clearProcessingTimeout();
      refreshTrigger.value++;
      return;
    }

    currentFileIndex.value = index;
    const targetFile = targetFiles[index];
    currentFileName.value = targetFile.name || `File ${index + 1}`;

    const isGDrive = isGoogleDriveAsset(targetFile) || (targetFile?.bucketName && String(targetFile.bucketName).startsWith("gdrive_"));
    const fileBucket = targetFile?.bucketName || (bucket.startsWith("gdrive_") ? "local" : bucket);
    const fileId = (isGDrive && targetFile?.assetMetadata?.googleDriveFileId) || targetFile?.id;

    const sourceUrl = isGDrive
      ? `/api/gdrive/rag?fileId=${encodeURIComponent(fileId)}&fileName=${encodeURIComponent(targetFile.name || '')}`
      : `/api/files/${encodeURIComponent(fileBucket)}/rag?fileId=${encodeURIComponent(targetFile.id)}`;

    ragProgressText.value = `[${index + 1}/${targetFiles.length}] Processing ${targetFile.name}...`;

    eventSource = new EventSource(sourceUrl);
    clearProcessingTimeout();
    processingTimeout = window.setTimeout(() => {
      failProcessing(`RAG processing for ${targetFile.name} timed out.`);
    }, CLIENT_PROCESSING_TIMEOUT_MS);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "start") {
          ragProgressText.value = `[${index + 1}/${targetFiles.length}] ${data.message}`;
        } else if (data.type === "progress") {
          ragProgressText.value = `[${index + 1}/${targetFiles.length}] ${resolveRagProgressMessage(data.text) || data.text}`;
        } else if (data.type === "complete") {
          totalRagCost.value += Number(data.cost || 0);
          eventSource?.close();
          processNextFile(index + 1);
        } else if (data.type === "fatal" || data.type === "error") {
          failProcessing(data.message || data.text || `Error processing ${targetFile.name}`);
        }
      } catch {
        failProcessing("Invalid server response during RAG progress.");
      }
    };

    eventSource.onerror = () => {
      if (ragIsProcessing.value) {
        failProcessing(`Connection lost while processing ${targetFile.name}.`);
      }
    };
  };

  processNextFile(0);
});

onUnmounted(() => {
  clearProcessingTimeout();
  eventSource?.close();
});
</script>

<template>
  <UModal
    title="Process RAG Intelligence"
    :description="`Processing ${displayTitle}`"
    :dismissible="!ragIsProcessing"
    :ui="damModalUi"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <Icon name="lucide:bot" class="text-2xl text-primary-500" />
          <span class="font-medium break-all">{{ currentFileName || displayTitle }}</span>
        </div>

        <div v-if="ragIsProcessing" class="flex flex-col gap-2">
          <UProgress animation="carousel" />
          <p class="text-sm text-neutral-500 dark:text-neutral-400 font-mono text-center">
            {{ ragProgressText || 'Processing...' }}
          </p>
        </div>

        <div v-else-if="ragError" class="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-md text-sm border border-red-200 dark:border-red-800/50">
          <p class="font-semibold mb-1">Failed to process</p>
          <p class="font-mono text-xs">{{ ragError }}</p>
        </div>

        <div v-else class="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-4 rounded-md border border-green-200 dark:border-green-800/50 flex flex-col items-center justify-center text-center">
          <Icon name="lucide:check-circle-2" class="text-4xl mb-2" />
          <p class="font-bold text-lg mb-1">Processing Complete</p>
          <p class="text-sm mb-3 opacity-90">Processed {{ totalFilesCount }} file{{ totalFilesCount === 1 ? '' : 's' }} successfully.</p>
          <div class="inline-flex items-center px-3 py-1 rounded-full bg-white dark:bg-neutral-900 shadow-sm border border-green-200 dark:border-green-800">
            <span class="font-mono text-sm font-semibold">Total Cost: ${{ totalRagCost.toFixed(4) }}</span>
          </div>
        </div>
      </div>
    </template>
    
    <template #footer>
      <div class="flex justify-end w-full">
        <UButton
          v-if="!ragIsProcessing"
          color="gray"
          variant="solid"
          @click="emit('close')"
        >
          Close
        </UButton>
      </div>
    </template>
  </UModal>
</template>
