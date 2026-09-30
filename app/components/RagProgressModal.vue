<script setup lang="ts">
import { damModalUi, isGoogleDriveAsset } from "~/utils/damModal";
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRoute } from "vue-router";
import { useRole } from "~/composables/useRole";
import { resolveRagProgressMessage } from "~~/shared/utils/rag-progress";
import { formatBytes } from "~/utils/helper";

const props = defineProps<{
  file: any;
}>();

const emit = defineEmits(["close"]);

// Batch processing threshold: only trigger the batch API if total size is > 256 MB
const BATCH_SIZE_THRESHOLD_BYTES = 256 * 1024 * 1024; // 256 MB in bytes

const CLIENT_PROCESSING_TIMEOUT_MS = 13 * 60 * 1000;
const ragProgressText = ref("Preparing items for RAG...");
const totalRagCost = ref<number>(0);
const ragIsProcessing = ref(true);
const ragError = ref("");
const route = useRoute();
const refreshTrigger = useState("files-refresh-trigger", () => 0);

const currentFileIndex = ref(0);
const totalFilesCount = ref(0);
const totalSizeBytes = ref(0);
const isBatchMode = ref(false);
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
  if (supportedExtensions.has(ext)) return true;
  if (item.contentType === "application/vnd.google-apps.document") return true;
  return false;
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

// ── Batch endpoint: POST /rag-batch (handles local & Google Drive files > 256 MB) ──
const runBatch = (targetFilesList: any[], bucket: string) => {
  const batchBucket = targetFilesList[0]?.bucketName && !String(targetFilesList[0].bucketName).startsWith("gdrive")
    ? targetFilesList[0].bucketName
    : (String(bucket).startsWith("gdrive") ? "local" : bucket);
  const batchUrl = `/api/files/${encodeURIComponent(batchBucket)}/rag-batch`;

  // EventSource only supports GET; use fetch + ReadableStream for POST SSE
  const ctrl = new AbortController();
  ragProgressText.value = `Batch mode: queuing ${targetFilesList.length} files (${formatBytes(totalSizeBytes.value)}) for processing...`;

  const payload = {
    fileIds: targetFilesList.map((f) => f.id),
    items: targetFilesList.map((f) => {
      const isDrive = isGoogleDriveAsset(f) || String(f.bucketName || "").startsWith("gdrive_") || f.storageProvider === "gdrive" || f.bucketName === "gdrive";
      return {
        id: f.id,
        name: f.name,
        size: Number(f?.size ?? f?.fileSize ?? f?.metadata?.size ?? 0) || 0,
        bucketName: f.bucketName,
        isGDrive: isDrive,
        googleDriveFileId: (isDrive && f.assetMetadata?.googleDriveFileId) || f.id,
        contentType: f.contentType,
        parentId: f.parentId || f.parents?.[0] || "root",
      };
    }),
  };

  fetch(batchUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: ctrl.signal,
  }).then(async (resp) => {
    if (!resp.body) { failProcessing("No response body from batch endpoint."); return; }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    clearProcessingTimeout();
    // Dynamic timeout: at least 13 min, plus 3 min per file
    processingTimeout = window.setTimeout(() => {
      ctrl.abort();
      failProcessing("Batch RAG processing timed out.");
    }, Math.max(CLIENT_PROCESSING_TIMEOUT_MS, targetFilesList.length * 3 * 60 * 1000));

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        try {
          handleBatchEvent(JSON.parse(trimmed.slice(5).trim()));
        } catch { /* non-JSON line */ }
      }
    }
    // Stream ended normally
    if (ragIsProcessing.value) {
      ragIsProcessing.value = false;
      clearProcessingTimeout();
      refreshTrigger.value++;
    }
  }).catch((err) => {
    if (err.name !== "AbortError") failProcessing(err.message || "Batch request failed.");
  });

  eventSource = { close: () => ctrl.abort() } as any;
};

const handleBatchEvent = (data: any) => {
  if (!data?.type) return;
  switch (data.type) {
    case "scan":
    case "start":
      ragProgressText.value = data.message || ragProgressText.value;
      totalFilesCount.value = data.total || totalFilesCount.value;
      break;
    case "file_start":
      currentFileIndex.value = (data.index ?? 0) + 1;
      totalFilesCount.value = data.total || totalFilesCount.value;
      currentFileName.value = data.file_name || currentFileName.value;
      ragProgressText.value = `[${currentFileIndex.value}/${totalFilesCount.value}] Parsing ${data.file_name}...`;
      break;
    case "file_progress":
    case "progress":
      ragProgressText.value = `[${currentFileIndex.value}/${totalFilesCount.value}] ${resolveRagProgressMessage(data.text) || data.text || data.message}`;
      break;
    case "file_done":
      totalRagCost.value += Number(data.cost || 0);
      ragProgressText.value = `[${currentFileIndex.value}/${totalFilesCount.value}] ✓ Indexed (${data.chunks} chunks)`;
      break;
    case "file_skip":
      ragProgressText.value = `Skipped ${data.file_name} (already indexed)`;
      break;
    case "file_error":
      ragProgressText.value = `⚠️ ${data.file_name}: ${data.error}`;
      break;
    case "batch_embed":
      ragProgressText.value = data.message || `Embedding ${data.total_chunks} chunks in one call...`;
      break;
    case "batch_upsert":
      ragProgressText.value = data.message || `Uploading ${data.total_vectors} vectors to Pinecone...`;
      break;
    case "summary":
      totalRagCost.value = Number(data.total_cost || totalRagCost.value);
      totalFilesCount.value = data.processed || totalFilesCount.value;
      ragProgressText.value = `Done! ${data.processed} file(s) indexed.`;
      ragIsProcessing.value = false;
      clearProcessingTimeout();
      refreshTrigger.value++;
      break;
    case "complete":
      totalRagCost.value = Number(data.total_cost || data.cost || totalRagCost.value);
      ragIsProcessing.value = false;
      clearProcessingTimeout();
      refreshTrigger.value++;
      break;
    case "fatal":
    case "error":
      failProcessing(data.message || data.text || "RAG batch processing failed.");
      break;
  }
};

// ── Single-file SSE handler (GDrive or single file) ───────────────────────
const processNextFile = (targetFiles: any[], index: number, bucket: string) => {
  if (index >= targetFiles.length) {
    ragProgressText.value = "All items processed successfully!";
    ragIsProcessing.value = false;
    clearProcessingTimeout();
    refreshTrigger.value++;
    return;
  }

  currentFileIndex.value = index + 1;
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
        processNextFile(targetFiles, index + 1, bucket);
      } else if (data.type === "fatal" || data.type === "error") {
        failProcessing(data.message || data.text || `Error processing ${targetFile.name}`);
      }
    } catch {
      failProcessing("Invalid server response during RAG progress.");
    }
  };

  eventSource.onerror = () => {
    if (ragIsProcessing.value) failProcessing(`Connection lost while processing ${targetFile.name}.`);
  };
};

onMounted(async () => {
  const bucket = route.params.bucket ? String(route.params.bucket) : "local";
  const rawItems = Array.isArray(props.file) ? props.file : [props.file];

  ragProgressText.value = "Scanning folders and collecting documents...";
  const targetFiles = await expandItems(rawItems, bucket);

  if (targetFiles.length === 0) {
    failProcessing("No supported documents or media files were found in the selection.");
    return;
  }

  totalFilesCount.value = targetFiles.length;

  // Calculate total size across all selected files or expanded folder contents
  const getFileSize = (item: any): number => {
    return Number(item?.size ?? item?.fileSize ?? item?.metadata?.size ?? 0) || 0;
  };
  const calculatedTotalSize = targetFiles.reduce((acc, f) => acc + getFileSize(f), 0);
  totalSizeBytes.value = calculatedTotalSize;

  // Trigger batch API call if total size > 256 MB
  // (Both local files and Google Drive files trigger batch processing when > 256 MB)
  // Otherwise, push files as normal (sequential pipeline)
  const shouldBatch = calculatedTotalSize > BATCH_SIZE_THRESHOLD_BYTES;

  if (shouldBatch) {
    isBatchMode.value = true;
    runBatch(targetFiles, bucket);
  } else {
    isBatchMode.value = false;
    processNextFile(targetFiles, 0, bucket);
  }
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

        <!-- Mode badge -->
        <div
          v-if="isBatchMode && ragIsProcessing"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-500/10 text-primary-400 border border-primary-500/20 self-start"
        >
          <Icon name="lucide:layers" class="text-sm" />
          Batch mode (&gt;256 MB: {{ formatBytes(totalSizeBytes) }}) — optimized AI cost
        </div>
        <div
          v-else-if="totalFilesCount > 1 && ragIsProcessing"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-500/10 text-neutral-400 border border-neutral-500/20 self-start"
        >
          <Icon name="lucide:file-text" class="text-sm" />
          Standard mode ({{ formatBytes(totalSizeBytes) }}) — processing sequentially
        </div>

        <!-- Progress bar for multi-file -->
        <div v-if="totalFilesCount > 1 && ragIsProcessing" class="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
          <div
            class="h-full bg-primary-500 transition-all duration-500"
            :style="{ width: `${Math.round((Math.max(0, currentFileIndex) / totalFilesCount) * 100)}%` }"
          />
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
          <p class="text-sm mb-3 opacity-90">Processed {{ totalFilesCount }} file{{ totalFilesCount === 1 ? '' : 's' }} ({{ formatBytes(totalSizeBytes) }}) successfully.</p>
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
