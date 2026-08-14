<script setup lang="ts">
import { damModalUi } from "~/utils/damModal";
import { ref, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { useRole } from "~/composables/useRole";

const props = defineProps<{
  file: any;
}>();

const emit = defineEmits(["close"]);

const CLIENT_PROCESSING_TIMEOUT_MS = 13 * 60 * 1000;
const ragProgressText = ref("Initializing...");
const ragCost = ref<number | null>(null);
const ragIsProcessing = ref(true);
const ragError = ref("");
const route = useRoute();
const refreshTrigger = useState("files-refresh-trigger", () => 0);

let eventSource: EventSource | null = null;
let processingTimeout: number | null = null;

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

onMounted(() => {
  const { orgType } = useRole();
  const isGDrive = orgType.value === "gdrive" || (route.params.bucket && (route.params.bucket as string).startsWith("gdrive_"));
  const bucket = route.params.bucket || "local";
  const sourceUrl = isGDrive
    ? `/api/gdrive/rag?fileId=${props.file.id}&fileName=${encodeURIComponent(props.file.name)}`
    : `/api/files/${bucket}/rag?fileId=${props.file.id}`;

  eventSource = new EventSource(sourceUrl);
  processingTimeout = window.setTimeout(() => {
    failProcessing("RAG processing exceeded 13 minutes and was stopped. Try again or contact an administrator if the document repeatedly times out.");
  }, CLIENT_PROCESSING_TIMEOUT_MS);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "start") {
        ragProgressText.value = data.message;
      } else if (data.type === "progress") {
        const lines = String(data.text || "").split("\n").filter((line: string) => line.trim().length > 0);
        if (lines.length > 0) {
          ragProgressText.value = lines[lines.length - 1];
        }
      } else if (data.type === "complete") {
        ragProgressText.value = "Done!";
        ragCost.value = Number(data.cost || 0);
        ragIsProcessing.value = false;
        clearProcessingTimeout();
        refreshTrigger.value++;
        eventSource?.close();
      } else if (data.type === "fatal" || data.type === "error") {
        failProcessing(data.message || data.text || "An error occurred while processing the document.");
      }
    } catch {
      failProcessing("The server returned an invalid RAG progress response.");
    }
  };

  eventSource.onerror = () => {
    if (ragIsProcessing.value) {
      failProcessing("Connection lost or processing failed. Check the server logs and required RAG API keys.");
    }
  };
});

onUnmounted(() => {
  clearProcessingTimeout();
  eventSource?.close();
});
</script>

<template>
  <UModal
    title="Process RAG Intelligence"
    :description="`Processing ${file.name}`"
    :dismissible="!ragIsProcessing"
    :ui="damModalUi"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <Icon name="lucide:bot" class="text-2xl text-primary-500" />
          <span class="font-medium break-all">{{ file.name }}</span>
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

        <div v-else-if="ragCost !== null" class="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-4 rounded-md border border-green-200 dark:border-green-800/50 flex flex-col items-center justify-center text-center">
          <Icon name="lucide:check-circle-2" class="text-4xl mb-2" />
          <p class="font-bold text-lg mb-1">Processing Complete</p>
          <p class="text-sm mb-3 opacity-90">The Markdown file has been saved in the same directory.</p>
          <div class="inline-flex items-center px-3 py-1 rounded-full bg-white dark:bg-neutral-900 shadow-sm border border-green-200 dark:border-green-800">
            <span class="font-mono text-sm font-semibold">Total Cost: ${{ ragCost.toFixed(4) }}</span>
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
