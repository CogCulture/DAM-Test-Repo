<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { defineShortcuts } from "~/composables/defineShortcuts";
import { useBucket } from "~/composables/useBucket";

const route = useRoute();
const { bucket } = useBucket();

interface SearchResult {
  id: string;
  name: string;
  path: string;
  type: string;
  contentType: string;
  bucketName: string;
  preview?: string;
  deletedAt?: string;
  size?: number;
  createdAt?: string;
  score?: number;
  snippet?: string;
  source: "keyword" | "semantic";
}

const open = ref(false);
const searchTerm = ref("");
const results = ref<SearchResult[]>([]);
const loading = ref(false);
const hoveredFile = ref<SearchResult | null>(null);
const activeFilter = ref<"all" | "folder" | "file" | "semantic" | "keyword">("all");
const inputRef = ref<HTMLInputElement | null>(null);

const bucketName = computed(() => (route.params.bucket as string) || bucket.value?.name || "org");

const folderCount = computed(
  () => results.value.filter((r) => r.type === "folder" || r.contentType === "folder").length
);
const fileCount = computed(
  () => results.value.filter((r) => r.type !== "folder" && r.contentType !== "folder").length
);
const semanticCount = computed(
  () => results.value.filter((r) => r.source === "semantic").length
);
const keywordCount = computed(
  () => results.value.filter((r) => r.source === "keyword").length
);

const filteredResults = computed(() => {
  if (activeFilter.value === "all") return results.value;
  if (activeFilter.value === "folder")
    return results.value.filter((r) => r.type === "folder" || r.contentType === "folder");
  if (activeFilter.value === "file")
    return results.value.filter((r) => r.type !== "folder" && r.contentType !== "folder");
  return results.value.filter((r) => r.source === activeFilter.value);
});

const doSearch = useDebounceFn(async (q: string) => {
  if (!q || !q.trim()) {
    results.value = [];
    hoveredFile.value = null;
    return;
  }
  loading.value = true;
  try {
    const data = await $fetch<SearchResult[]>("/api/search/smart", {
      query: { q, bucket: bucketName.value },
    });
    results.value = data || [];
    hoveredFile.value = results.value[0] || null;
  } catch (e) {
    results.value = [];
  } finally {
    loading.value = false;
  }
}, 300);

watch(searchTerm, (val) => doSearch(val));

watch(open, (val) => {
  if (val) {
    nextTick(() => inputRef.value?.focus());
  } else {
    searchTerm.value = "";
    results.value = [];
    hoveredFile.value = null;
    activeFilter.value = "all";
  }
});

defineShortcuts({
  meta_k: () => {
    open.value = !open.value;
  },
  escape: () => {
    if (open.value) open.value = false;
  },
});

const getPreviewUrlLocal = (file: SearchResult) => {
  if (!file.preview) return null;
  const deletedAt = file.deletedAt;
  return (
    "/preview/" +
    file.preview
      .split("/")
      .map((s: string) => encodeURIComponent(s))
      .join("/") +
    (deletedAt ? `?trashed=${new Date(deletedAt).toISOString()}` : "")
  );
};

const getFileUrl = (file: SearchResult, inline = false) => {
  return `/api/files/${file.bucketName}/download/${file.id}${inline ? "?inline=true" : ""}`;
};

const isImage = (ct: string) =>
  ct?.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "avif"].some((e) => ct?.includes(e));
const isVideo = (ct: string) => ct?.startsWith("video/");
const isPdf = (ct: string) => ct === "application/pdf";
const isOffice = (ct: string) =>
  [
    "wordprocessingml",
    "spreadsheetml",
    "presentationml",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
  ].some((t) => ct?.includes(t));

const getFileIconName = (file: SearchResult) => {
  if (file.type === "folder" || file.contentType === "folder") return "lucide:folder";
  const ct = file.contentType || file.type;
  if (ct?.startsWith("image/")) return "lucide:image";
  if (ct?.startsWith("video/")) return "lucide:video";
  if (ct?.startsWith("audio/")) return "lucide:music";
  if (ct === "application/pdf") return "lucide:file-text";
  if (ct?.includes("wordprocessingml") || ct === "application/msword")
    return "vscode-icons:file-type-word";
  if (ct?.includes("spreadsheetml") || ct === "application/vnd.ms-excel")
    return "vscode-icons:file-type-excel";
  if (ct?.includes("presentationml") || ct === "application/vnd.ms-powerpoint")
    return "vscode-icons:file-type-powerpoint";
  if (ct === "text/markdown") return "lucide:file-code-2";
  return "lucide:file";
};

const getScoreColor = (score?: number) => {
  if (!score) return "text-neutral-400";
  if (score > 0.85) return "text-emerald-500";
  if (score > 0.7) return "text-amber-500";
  return "text-orange-400";
};

const navigateToFile = (file: SearchResult) => {
  open.value = false;
  const currentBucket = (route.params.bucket as string) || bucket.value?.name || file.bucketName || "org";
  const to =
    file.type === "folder" || file.contentType === "folder"
      ? `/${currentBucket}/${file.id}`
      : `/${currentBucket}/file/${file.id}`;
  navigateTo(to);
};

const formatBytes = (bytes?: number) => {
  if (!bytes) return "—";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

const formatDate = (d?: string) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};
</script>

<template>
  <!-- Search Trigger Button -->
  <button
    type="button"
    class="dam-control group relative mx-auto my-2.5 flex h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel)] px-4 text-sm font-semibold transition-all duration-200 hover:border-[#ff5733] hover:shadow-[0_0_22px_rgba(255,87,51,0.25)]"
    @click="open = true"
    id="smart-search-trigger"
  >
    <div class="flex items-center gap-2.5 text-[var(--dam-muted)] group-hover:text-[var(--dam-ink)]">
      <Icon name="lucide:sparkles" class="size-4 text-[#ff5733]" />
      <span>Search assets, transcripts, documents &amp; AI topics...</span>
    </div>
  </button>

  <!-- Full-screen Search Modal -->
  <Teleport to="body">
    <Transition name="search-overlay">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
        id="smart-search-overlay"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/60 backdrop-blur-sm"
          @click="open = false"
        />

        <!-- Dialog -->
        <div
          class="relative z-10 flex h-[min(44rem,calc(100dvh-1rem))] min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f19] text-white shadow-2xl sm:h-[min(44rem,calc(100dvh-2rem))]"
        >
          <!-- Search Input Row -->
          <div
            class="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#0d1220] px-4 py-3 sm:px-5 sm:py-4"
          >
            <div class="relative flex-shrink-0">
              <Icon
                v-if="!loading"
                name="lucide:search"
                class="size-5 text-neutral-400"
              />
              <div
                v-else
                class="size-5 rounded-full border-2 border-primary-400 border-t-transparent animate-spin"
              />
            </div>
            <input
              ref="inputRef"
              v-model="searchTerm"
              type="text"
              placeholder="Search anything - files, content, topics..."
              class="flex-1 bg-transparent text-white text-base outline-none placeholder-neutral-400 caret-primary-400 font-medium"
              id="smart-search-input"
              autocomplete="off"
              spellcheck="false"
            />
            <div class="flex items-center gap-2 flex-shrink-0">
              <UBadge
                label="AI Semantic"
                size="xs"
                color="primary"
                variant="subtle"
              />
              <button
                @click="open = false"
                class="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-neutral-400 hover:text-white"
              >
                <Icon name="lucide:x" class="size-4" />
              </button>
            </div>
          </div>

          <!-- Filter chips -->
          <div
            v-if="results.length > 0"
            class="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/10 bg-[#0d1220]/70 px-4 py-2.5 sm:px-5"
          >
            <button
              v-for="filter in [
                { id: 'all', label: `All (${results.length})` },
                { id: 'folder', label: `Folders (${folderCount})`, icon: 'lucide:folder' },
                { id: 'file', label: `Files (${fileCount})`, icon: 'lucide:file' },
                {
                  id: 'semantic',
                  label: `Semantic (${semanticCount})`,
                  icon: 'lucide:sparkles',
                },
                {
                  id: 'keyword',
                  label: `Keyword (${keywordCount})`,
                  icon: 'lucide:type',
                },
              ]"
              :key="filter.id"
              @click="activeFilter = filter.id as any"
              :class="[
                'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150',
                activeFilter === filter.id
                  ? 'bg-primary-500/25 text-primary-300 border border-primary-400/40 shadow-sm shadow-primary-500/20'
                  : 'text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20',
              ]"
            >
              <Icon v-if="filter.icon" :name="filter.icon" class="size-3" />
              {{ filter.label }}
            </button>
          </div>

          <!-- Main content: Results + Preview -->
          <div class="flex flex-1 min-h-0 overflow-hidden">
            <!-- Left: Results list -->
            <div
              class="flex flex-col"
              :class="
                hoveredFile
                  ? 'hidden md:flex md:w-1/2 md:border-r md:border-white/10'
                  : 'w-full'
              "
              style="transition: width 0.2s ease"
            >
              <!-- Empty / Initial state -->
              <div
                v-if="!searchTerm && results.length === 0"
                class="flex flex-col items-center justify-center py-16 text-neutral-400"
              >
                <div
                  class="size-16 rounded-2xl flex items-center justify-center mb-4"
                  style="background: rgba(99, 102, 241, 0.15)"
                >
                  <Icon
                    name="lucide:sparkles"
                    class="size-8 text-primary-400"
                  />
                </div>
                <p class="text-sm font-semibold text-white">
                  Smart Search powered by AI
                </p>
                <p class="text-xs mt-1 text-neutral-400">
                  Search by keyword or describe what you're looking for
                </p>
                <div class="flex gap-3 mt-6">
                  <div
                    class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-neutral-300 border border-white/10 bg-white/5"
                  >
                    <Icon name="lucide:type" class="size-3 text-neutral-400" />
                    Keyword search
                  </div>
                  <div
                    class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-neutral-300 border border-white/10 bg-white/5"
                  >
                    <Icon
                      name="lucide:sparkles"
                      class="size-3 text-primary-400"
                    />
                    Semantic AI search
                  </div>
                </div>
              </div>

              <!-- No results -->
              <div
                v-else-if="searchTerm && !loading && results.length === 0"
                class="flex flex-col items-center justify-center py-16 text-neutral-400"
              >
                <Icon name="lucide:search-x" class="size-10 mb-3 text-neutral-500" />
                <p class="text-sm font-semibold text-white">No results found</p>
                <p class="text-xs mt-1 text-neutral-400">
                  Try different keywords or wait for more files to be indexed
                </p>
              </div>

              <!-- Results -->
              <div
                v-else
                class="overflow-y-auto flex-1 bg-[#0b0f19]"
                style="scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent"
              >
                <TransitionGroup name="result-list" tag="ul" class="divide-y divide-white/5">
                  <li
                    v-for="(file, idx) in filteredResults"
                    :key="file.id"
                    @mouseenter="hoveredFile = file"
                    @click="navigateToFile(file)"
                    :class="[
                      'flex items-start gap-3 px-5 py-3.5 cursor-pointer transition-all duration-150 group',
                      hoveredFile?.id === file.id
                        ? 'bg-primary-500/15 border-l-2 border-l-primary-400'
                        : 'hover:bg-white/5',
                    ]"
                    :id="`search-result-${idx}`"
                  >
                    <!-- File Icon -->
                    <div
                      class="size-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 border border-white/10"
                      style="background: rgba(255, 255, 255, 0.08)"
                    >
                      <Icon
                        :name="getFileIconName(file)"
                        class="size-5 text-neutral-200"
                      />
                    </div>

                    <!-- Content -->
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span
                          class="text-sm font-semibold text-white truncate group-hover:text-primary-300 transition-colors"
                        >
                          {{ file.name }}
                        </span>
                        <!-- Source / Type badge -->
                        <span
                          v-if="file.type === 'folder' || file.contentType === 'folder'"
                          class="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style="
                            background: rgba(245, 158, 11, 0.2);
                            color: #fcd34d;
                            border: 1px solid rgba(245, 158, 11, 0.4);
                          "
                        >
                          <Icon name="lucide:folder" class="size-2.5" />
                          Folder
                        </span>
                        <span
                          v-else-if="file.source === 'semantic'"
                          class="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style="
                            background: rgba(99, 102, 241, 0.25);
                            color: #a5b4fc;
                            border: 1px solid rgba(99, 102, 241, 0.4);
                          "
                        >
                          <Icon name="lucide:sparkles" class="size-2.5" />
                          AI
                        </span>
                        <span
                          v-else
                          class="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style="
                            background: rgba(255, 255, 255, 0.1);
                            color: #d4d4d4;
                            border: 1px solid rgba(255, 255, 255, 0.15);
                          "
                        >
                          Word Match
                        </span>

                      </div>

                      <!-- Snippet -->
                      <p
                        v-if="file.snippet"
                        class="text-xs text-neutral-200 mt-2 line-clamp-2 leading-relaxed"
                        style="
                          background: rgba(255, 255, 255, 0.05);
                          border-left: 2px solid #818cf8;
                          padding: 6px 10px;
                          border-radius: 0 6px 6px 0;
                        "
                      >
                        {{ file.snippet }}
                      </p>
                    </div>

                    <!-- Arrow hint on hover -->
                    <Icon
                      name="lucide:arrow-right"
                      class="size-4 text-neutral-500 group-hover:text-white flex-shrink-0 mt-2 transition-colors"
                    />
                  </li>
                </TransitionGroup>
              </div>
            </div>

            <!-- Right: Preview Pane -->
            <Transition name="preview-slide">
              <div
                v-if="hoveredFile"
                class="flex w-full flex-col overflow-hidden md:w-1/2 bg-[#060911]"
                id="smart-search-preview"
              >
                <!-- Preview header -->
                <div
                  class="flex min-h-12 flex-shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3 bg-[#0d1220]"
                >
                  <button
                    type="button"
                    class="rounded-lg p-1.5 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white md:hidden"
                    aria-label="Back to search results"
                    @click="hoveredFile = null"
                  >
                    <Icon name="lucide:arrow-left" class="size-4" />
                  </button>
                  <Icon
                    :name="getFileIconName(hoveredFile)"
                    class="size-4 text-neutral-300"
                  />
                  <span class="min-w-0 flex-1 break-words text-sm font-semibold leading-5 text-white">
                    {{ hoveredFile.name }}
                  </span>
                  <button
                    @click="navigateToFile(hoveredFile)"
                    class="flex items-center gap-1 text-xs font-semibold text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    Open
                    <Icon name="lucide:external-link" class="size-3" />
                  </button>
                </div>

                <!-- Preview content -->
                <div class="flex-1 overflow-hidden relative bg-[#060911]">
                  <Transition name="fade" mode="out-in">
                    <div :key="hoveredFile.id" class="absolute inset-0">
                      <!-- Folder preview card -->
                      <div
                        v-if="hoveredFile.type === 'folder' || hoveredFile.contentType === 'folder'"
                        class="flex h-full w-full flex-col items-center justify-center p-6 text-center bg-[#060911]"
                      >
                        <div class="size-20 rounded-2xl flex items-center justify-center mb-4 bg-amber-500/15 border border-amber-500/30 shadow-lg shadow-amber-500/10">
                          <Icon name="lucide:folder" class="size-10 text-amber-400" />
                        </div>
                        <h3 class="text-base font-bold text-white max-w-md break-words">{{ hoveredFile.name }}</h3>
                        <p class="text-xs text-neutral-300 mt-1.5 max-w-sm break-all font-mono">{{ hoveredFile.path || '/' }}</p>
                        <button
                          @click="navigateToFile(hoveredFile)"
                          class="mt-6 flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-lg hover:shadow-amber-500/20 cursor-pointer"
                        >
                          <Icon name="lucide:folder-open" class="size-4" />
                          Open Folder
                        </button>
                      </div>
                      <!-- PDF inline -->
                      <iframe
                        v-else-if="isPdf(hoveredFile.contentType)"
                        :src="getFileUrl(hoveredFile, true)"
                        class="w-full h-full border-none"
                      />
                      <!-- Image -->
                      <div
                        v-else-if="isImage(hoveredFile.contentType)"
                        class="w-full h-full flex items-center justify-center p-4 bg-[#060911]"
                      >
                        <img
                          :src="
                            getPreviewUrlLocal(hoveredFile) ||
                            getFileUrl(hoveredFile, true)
                          "
                          class="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                          alt="preview"
                        />
                      </div>
                      <!-- Video -->
                      <video
                        v-else-if="isVideo(hoveredFile.contentType)"
                        :src="getFileUrl(hoveredFile, true)"
                        class="w-full h-full object-contain bg-[#060911]"
                        controls
                        muted
                        autoplay
                        loop
                      />
                      <!-- Snippet preview for indexed docs -->
                      <div
                        v-else-if="hoveredFile.snippet"
                        class="w-full h-full overflow-auto p-5 bg-[#060911]"
                      >
                        <div
                          class="rounded-xl p-4"
                          style="
                            background: rgba(99, 102, 241, 0.12);
                            border: 1px solid rgba(99, 102, 241, 0.3);
                          "
                        >
                          <div class="flex items-center gap-2 mb-3">
                            <Icon
                              name="lucide:sparkles"
                              class="size-4 text-primary-400"
                            />
                            <span class="text-xs font-bold text-primary-300 uppercase tracking-wide">
                              AI Summary
                            </span>
                          </div>
                          <p
                            class="text-sm text-neutral-100 leading-relaxed whitespace-pre-wrap font-normal"
                          >
                            {{ hoveredFile.snippet }}
                          </p>
                        </div>

                        <!-- File metadata below -->
                        <div class="mt-4 space-y-2">
                          <div
                            v-for="item in [
                              {
                                label: 'Type',
                                value: hoveredFile.contentType || hoveredFile.type,
                                icon: 'lucide:file',
                              },
                              {
                                label: 'Size',
                                value: formatBytes(hoveredFile.size),
                                icon: 'lucide:hard-drive',
                              },
                              {
                                label: 'Modified',
                                value: formatDate(hoveredFile.createdAt),
                                icon: 'lucide:calendar',
                              },
                              {
                                label: 'Path',
                                value: hoveredFile.path,
                                icon: 'lucide:folder-open',
                              },
                            ]"
                            :key="item.label"
                            class="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-white/5"
                            style="background: rgba(255, 255, 255, 0.04)"
                          >
                            <Icon
                              :name="item.icon"
                              class="size-3.5 text-neutral-400 mt-0.5 flex-shrink-0"
                            />
                            <div class="flex-1 min-w-0">
                              <p class="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
                                {{ item.label }}
                              </p>
                              <p class="mt-0.5 break-words text-xs leading-5 text-white font-medium [overflow-wrap:anywhere]">
                                {{ item.value }}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <!-- Generic fallback -->
                      <div
                        v-else
                        class="flex h-full w-full flex-col items-center justify-start gap-4 overflow-y-auto p-4 sm:p-6 bg-[#060911]"
                      >
                        <div
                          class="size-20 rounded-2xl flex items-center justify-center border border-white/10"
                          style="background: rgba(255, 255, 255, 0.08)"
                        >
                          <Icon
                            :name="getFileIconName(hoveredFile)"
                            class="size-10 text-neutral-200"
                          />
                        </div>
                        <div class="text-center">
                          <p class="text-sm font-semibold text-white">
                            {{ hoveredFile.name }}
                          </p>
                          <p class="text-xs text-neutral-400 mt-1 font-mono">
                            {{ formatBytes(hoveredFile.size) }}
                          </p>
                        </div>
                        <!-- Metadata -->
                        <div class="w-full space-y-2 mt-2">
                          <div
                            v-for="item in [
                              {
                                label: 'Type',
                                value: hoveredFile.contentType || hoveredFile.type,
                                icon: 'lucide:file',
                              },
                              {
                                label: 'Size',
                                value: formatBytes(hoveredFile.size),
                                icon: 'lucide:hard-drive',
                              },
                              {
                                label: 'Modified',
                                value: formatDate(hoveredFile.createdAt),
                                icon: 'lucide:calendar',
                              },
                              {
                                label: 'Path',
                                value: hoveredFile.path,
                                icon: 'lucide:folder-open',
                              },
                            ]"
                            :key="item.label"
                            class="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-white/5"
                            style="background: rgba(255, 255, 255, 0.04)"
                          >
                            <Icon
                              :name="item.icon"
                              class="size-3.5 text-neutral-400 mt-0.5 flex-shrink-0"
                            />
                            <div class="flex-1 min-w-0">
                              <p class="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
                                {{ item.label }}
                              </p>
                              <p class="mt-0.5 break-words text-xs leading-5 text-white font-medium [overflow-wrap:anywhere]">
                                {{ item.value }}
                              </p>
                            </div>
                          </div>
                        </div>
                        <UButton
                          :to="`/${hoveredFile.bucketName}/file/${hoveredFile.id}`"
                          @click="open = false"
                          label="Open File"
                          icon="lucide:external-link"
                          size="sm"
                          variant="subtle"
                        />
                      </div>
                    </div>
                  </Transition>
                </div>
              </div>
            </Transition>
          </div>

          <!-- Footer -->
          <div
            class="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#0d1220] px-4 py-2.5 sm:px-5"
          >
            <div class="hidden items-center gap-4 text-[11px] text-neutral-400 font-medium sm:flex">
              <span class="flex items-center gap-1.5">
                <UKbd size="xs">Up/Down</UKbd> Navigate
              </span>
              <span class="flex items-center gap-1.5">
                <UKbd size="xs">Enter</UKbd> Open
              </span>
              <span class="flex items-center gap-1.5">
                <UKbd size="xs">Esc</UKbd> Close
              </span>
            </div>
            <div class="ml-auto flex items-center gap-1.5 whitespace-nowrap text-[11px] text-neutral-400 font-medium">
              <Icon name="lucide:sparkles" class="size-3 text-primary-400" />
              Powered by Pinecone AI
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Overlay entrance */
.search-overlay-enter-active,
.search-overlay-leave-active {
  transition: opacity 0.15s ease;
}
.search-overlay-enter-from,
.search-overlay-leave-to {
  opacity: 0;
}
.search-overlay-enter-active .relative,
.search-overlay-leave-active .relative {
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.search-overlay-enter-from .relative {
  transform: scale(0.97) translateY(-8px);
  opacity: 0;
}
.search-overlay-leave-to .relative {
  transform: scale(0.97) translateY(-8px);
  opacity: 0;
}

/* Preview panel slide */
.preview-slide-enter-active,
.preview-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.preview-slide-enter-from,
.preview-slide-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

/* File content fade */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Result list transition */
.result-list-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.result-list-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.result-list-leave-active {
  display: none;
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 4px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}
</style>
