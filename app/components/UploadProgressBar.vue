<script setup lang="ts">
import { computed } from "vue";
import { useUploadProgress } from "~/composables/useUploadProgress";

const {
  isUploading,
  showWidget,
  minimized,
  uploadPhase,
  items,
  currentDestination,
  totalFiles,
  completedFiles,
  overallProgress,
  completeUpload,
  dismissUpload,
  toggleMinimized,
} = useUploadProgress();

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileIcon = (filename: string) => {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext || "")) return "lucide:image";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext || "")) return "lucide:video";
  if (["pdf"].includes(ext || "")) return "lucide:file-text";
  if (["doc", "docx"].includes(ext || "")) return "lucide:file-type-doc";
  if (["xls", "xlsx", "csv"].includes(ext || "")) return "lucide:sheet";
  if (["zip", "rar", "tar", "gz"].includes(ext || "")) return "lucide:archive";
  return "lucide:file";
};

const statusText = computed(() => {
  if (uploadPhase.value === "complete") {
    return totalFiles.value === 1 ? "Upload complete" : `${completedFiles.value} files uploaded`;
  }
  if (uploadPhase.value === "error") {
    return "Upload encountered an error";
  }
  if (uploadPhase.value === "syncing") {
    return "Finalizing & syncing...";
  }
  if (totalFiles.value === 1) {
    return `Uploading ${items.value[0]?.name || "file"}...`;
  }
  return `Uploading ${completedFiles.value}/${totalFiles.value} files (${overallProgress.value}%)`;
});
</script>

<template>
  <Teleport to="body">
    <!-- Slim Top Progress Line under Header -->
    <div
      v-if="isUploading && overallProgress > 0"
      class="fixed top-[4.5rem] inset-x-0 z-[60] h-1 bg-transparent pointer-events-none"
    >
      <div
        class="h-full bg-gradient-to-r from-[#ff5733] via-orange-400 to-amber-300 shadow-[0_0_12px_rgba(255,87,51,0.7)] transition-all duration-300 ease-out"
        :style="{ width: `${overallProgress}%` }"
      />
    </div>

    <!-- Floating Bottom-Right Upload Progress Card -->
    <Transition name="upload-slide">
      <aside
        v-if="showWidget"
        aria-label="Upload progress"
        class="fixed bottom-6 right-6 z-[9990] w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] text-[var(--dam-ink)] shadow-[0_12px_40px_rgba(0,0,0,0.25)] backdrop-blur-xl transition-all duration-300"
      >
        <!-- Card Header -->
        <div class="flex items-center justify-between border-b border-[var(--dam-line)] px-4 py-3 bg-[var(--dam-panel-raised)]">
          <div class="flex items-center gap-2.5 min-w-0">
            <!-- Icon Indicator -->
            <div
              class="flex size-7 shrink-0 items-center justify-center rounded-xl transition-colors"
              :class="
                uploadPhase === 'complete'
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : uploadPhase === 'error'
                  ? 'bg-red-500/15 text-red-500'
                  : 'bg-[#ff5733]/15 text-[#ff5733]'
              "
            >
              <Icon
                v-if="uploadPhase === 'complete'"
                name="lucide:check-circle-2"
                class="size-4 animate-scale"
              />
              <Icon
                v-else-if="uploadPhase === 'error'"
                name="lucide:alert-circle"
                class="size-4"
              />
              <Icon
                v-else
                name="lucide:cloud-upload"
                class="size-4 animate-pulse"
              />
            </div>

            <!-- Title & Status -->
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-bold leading-tight text-[var(--dam-ink)]">
                {{ statusText }}
              </p>
              <p class="truncate text-[10px] text-[var(--dam-muted)]">
                {{ currentDestination || 'DAM Storage' }}
              </p>
            </div>
          </div>

          <!-- Controls -->
          <div class="flex items-center gap-1 shrink-0">
            <!-- Percentage Badge -->
            <span
              v-if="uploadPhase !== 'complete' && uploadPhase !== 'error'"
              class="font-mono text-xs font-bold text-[#ff5733] px-1.5"
            >
              {{ overallProgress }}%
            </span>

            <button
              type="button"
              class="rounded-lg p-1 text-[var(--dam-muted)] hover:bg-[var(--dam-panel-hover)] hover:text-[var(--dam-ink)] transition"
              @click="toggleMinimized"
              :title="minimized ? 'Expand' : 'Collapse'"
            >
              <Icon :name="minimized ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="size-4" />
            </button>

            <button
              type="button"
              class="rounded-lg p-1 text-[var(--dam-muted)] hover:bg-[var(--dam-panel-hover)] hover:text-[var(--dam-ink)] transition"
              @click="dismissUpload"
              title="Close"
            >
              <Icon name="lucide:x" class="size-4" />
            </button>
          </div>
        </div>

        <!-- Main Progress Bar -->
        <div class="px-4 pt-3 pb-2">
          <div class="relative h-2 w-full overflow-hidden rounded-full bg-[var(--dam-line)]">
            <div
              class="h-full rounded-full transition-all duration-300 ease-out"
              :class="
                uploadPhase === 'complete'
                  ? 'bg-emerald-500'
                  : uploadPhase === 'error'
                  ? 'bg-red-500'
                  : 'bg-gradient-to-r from-[#ff5733] via-orange-500 to-amber-400'
              "
              :style="{ width: `${overallProgress}%` }"
            />
          </div>
        </div>

        <!-- Expanded Itemized Files List -->
        <div v-show="!minimized" class="max-h-56 divide-y divide-[var(--dam-line)] overflow-y-auto px-4 pb-3">
          <div
            v-for="item in items"
            :key="item.id"
            class="flex items-center justify-between gap-3 py-2 text-xs"
          >
            <!-- File info -->
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <Icon :name="getFileIcon(item.name)" class="size-4 shrink-0 text-[var(--dam-muted)]" />
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium text-[var(--dam-ink)]" :title="item.name">
                  {{ item.name }}
                </p>
                <p v-if="item.size" class="text-[10px] text-[var(--dam-muted)] font-mono">
                  {{ formatBytes(item.size) }}
                </p>
              </div>
            </div>

            <!-- Item Status / Percentage -->
            <div class="flex items-center gap-2 shrink-0">
              <span
                v-if="item.status === 'uploading'"
                class="font-mono text-[11px] font-semibold text-[#ff5733]"
              >
                {{ item.progress }}%
              </span>
              <span
                v-else-if="item.status === 'syncing'"
                class="text-[10px] font-medium text-amber-500 animate-pulse"
              >
                Syncing
              </span>
              <Icon
                v-else-if="item.status === 'complete'"
                name="lucide:check"
                class="size-4 text-emerald-500 font-bold"
              />
              <Icon
                v-else-if="item.status === 'error'"
                name="lucide:x"
                class="size-4 text-red-500"
                :title="item.error || 'Failed'"
              />
            </div>
          </div>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.upload-slide-enter-active,
.upload-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.upload-slide-enter-from,
.upload-slide-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.96);
}

@keyframes scale {
  0% { transform: scale(0.8); }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); }
}
.animate-scale {
  animation: scale 0.3s ease-out;
}
</style>
