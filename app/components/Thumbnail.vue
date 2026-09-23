<script setup lang="ts">
import * as Vue from "vue";
import * as VueDemi from "vue-demi";
import { defineAsyncComponent, ref, computed, onMounted } from "vue";
import { isGoogleDriveAsset } from "~/utils/damModal";
import { fileIcon } from "~~/shared/utils/helper";

const { file, layout } = defineProps<{
  file: IFile;
  layout: "row" | "col";
}>();

const mediaFailed = ref(false);
const textSnippet = ref("");
const loadingText = ref(false);

const normalizedType = computed(() => (file.contentType || file.type || "").toLowerCase());
const isGDrive = computed(() => isGoogleDriveAsset(file));
const inlineUrl = computed(() => isGDrive.value
  ? `/api/gdrive/download/${encodeURIComponent(file.id)}?inline=true`
  : `/api/files/${encodeURIComponent(file.bucketName)}/download/${encodeURIComponent(file.id)}?inline=true`);
const imageUrl = computed(() => !isGDrive.value && file.preview ? getPreviewUrl(file.preview, file.deletedAt) : inlineUrl.value);

const isImage = computed(() => file.type === "image" || normalizedType.value.startsWith("image/"));
const isVideo = computed(() => file.type === "video" || normalizedType.value.startsWith("video/"));
const isPdf = computed(() => file.type === "pdf" || normalizedType.value === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

const isMarkdown = computed(() => {
  const name = file.name.toLowerCase();
  return name.endsWith(".md") || name.endsWith(".markdown");
});

const isTextDoc = computed(() => {
  const name = file.name.toLowerCase();
  return (
    isMarkdown.value ||
    name.endsWith(".txt") ||
    name.endsWith(".html") ||
    name.endsWith(".htm") ||
    name.endsWith(".json") ||
    name.endsWith(".csv") ||
    name.endsWith(".log") ||
    name.endsWith(".xml") ||
    name.endsWith(".yaml") ||
    name.endsWith(".yml") ||
    normalizedType.value.startsWith("text/")
  );
});

const isOfficeDoc = computed(() => {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".pptx") ||
    name.endsWith(".ppt") ||
    normalizedType.value.includes("officedocument") ||
    normalizedType.value.includes("msword") ||
    normalizedType.value.includes("ms-excel") ||
    normalizedType.value.includes("ms-powerpoint")
  );
});

const isArchive = computed(() => file.type === "archive" || normalizedType.value.includes("zip") || file.name.toLowerCase().endsWith(".zip"));
const isDriveShortcut = computed(() => file.assetMetadata?.source === "google-drive-link");

const archiveEntries = computed<string[]>(() => {
  const entries = file.assetMetadata?.archiveEntries;
  return Array.isArray(entries) ? entries.slice(0, layout === "row" ? 2 : 5) : [];
});
const archiveEntryCount = computed(() => Number(file.assetMetadata?.archiveEntryCount || archiveEntries.value.length));

const officeType = computed(() => {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx") || name.endsWith(".doc") || normalizedType.value.includes("word")) return "word";
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || normalizedType.value.includes("excel") || normalizedType.value.includes("spreadsheet")) return "excel";
  if (name.endsWith(".pptx") || name.endsWith(".ppt") || normalizedType.value.includes("powerpoint") || normalizedType.value.includes("presentation")) return "powerpoint";
  return "word";
});

const officeTypeLabel = computed(() => {
  if (officeType.value === "word") return "Word Document";
  if (officeType.value === "excel") return "Excel Spreadsheet";
  if (officeType.value === "powerpoint") return "PowerPoint Presentation";
  return "Document";
});

// Dynamic Office Component Loader for Excel & Word real live previews
const vendorLoads = new Map<string, Promise<unknown>>();
const loadOfficeComponent = (globalName: "vue-office-docx" | "vue-office-excel" | "vue-office-pptx", src: string) => {
  return defineAsyncComponent(async () => {
    const browser = window as typeof window & Record<string, any>;
    browser.Vue = Vue;
    browser.VueDemi = VueDemi;

    if (!browser[globalName]) {
      let load = vendorLoads.get(src);
      if (!load) {
        load = new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = src;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error(`Unable to load ${globalName}`));
          document.head.appendChild(script);
        });
        vendorLoads.set(src, load);
      }
      await load;
    }

    const component = browser[globalName];
    if (!component) throw new Error(`Preview component ${globalName} did not initialize`);
    return component;
  });
};

const VueOfficeDocx = loadOfficeComponent("vue-office-docx", "/vendor/vue-office/docx.js");
const VueOfficeExcel = loadOfficeComponent("vue-office-excel", "/vendor/vue-office/excel.js");
const VueOfficePptx = loadOfficeComponent("vue-office-pptx", "/vendor/vue-office/pptx.js");

useHead({
  link: [
    { rel: "stylesheet", href: "/vendor/vue-office/docx.css" },
    { rel: "stylesheet", href: "/vendor/vue-office/excel.css" },
  ],
});

// Fetch text preview snippet for markdown and text files
onMounted(async () => {
  if (isTextDoc.value && !isPdf.value) {
    loadingText.value = true;
    try {
      const res = await fetch(inlineUrl.value);
      if (res.ok) {
        const raw = await res.text();
        // Clean up markdown syntax for neat card preview snippet
        textSnippet.value = raw
          .replace(/^#+\s+/gm, "")
          .replace(/[*_`~>]/g, "")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .trim()
          .slice(0, 300);
      }
    } catch {
      mediaFailed.value = true;
    } finally {
      loadingText.value = false;
    }
  }
});

const folderPreviews = computed(() => {
  if (file.type === "folder" && file.preview) {
    try {
      const parsed = JSON.parse(file.preview);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
});
const gridItems = computed(() => {
  const items = Array(4).fill(null);
  folderPreviews.value.slice(0, 4).forEach((preview, index) => {
    items[index] = preview;
  });
  return items;
});
</script>

<template>
  <template v-if="file.type === 'folder' && file.preview">
    <div class="grid grid-cols-2 grid-rows-2 gap-0.5 p-0.5">
      <div
        v-for="(preview, index) in gridItems"
        :key="index"
        class="w-full aspect-square bg-center bg-cover bg-neutral-200 dark:bg-neutral-700"
        :style="preview && { backgroundImage: `url('${getPreviewUrl(preview, file.deletedAt)}')` }"
      >
        <div
          v-if="index === folderPreviews.length - 1 && file.count && file.count > folderPreviews.length"
          :class="[
            'w-full aspect-square flex justify-center items-center font-light bg-black/50 text-white',
            layout === 'col' ? 'text-3xl' : 'text-lg',
          ]"
        >
          +{{ file.count - folderPreviews.length }}
        </div>
      </div>
    </div>
  </template>

  <!-- Image Preview -->
  <img
    v-else-if="isImage && !mediaFailed"
    :src="imageUrl"
    :alt="`Preview of ${file.name}`"
    class="absolute inset-0 h-full w-full bg-neutral-100 object-cover transition-transform duration-150 group-hover:scale-[1.01] dark:bg-[#0b0c0e]"
    loading="lazy"
    decoding="async"
    @error="mediaFailed = true"
  />

  <!-- Video Preview -->
  <video
    v-else-if="isVideo && !mediaFailed"
    :src="inlineUrl"
    class="absolute inset-0 h-full w-full object-cover bg-black pointer-events-none"
    muted
    preload="metadata"
    @error="mediaFailed = true"
  />

  <!-- PDF Preview -->
  <iframe
    v-else-if="isPdf && !mediaFailed"
    :src="`${inlineUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0`"
    :title="`Preview of ${file.name}`"
    class="absolute inset-0 h-full w-full border-0 bg-white pointer-events-none select-none"
    loading="lazy"
    @error="mediaFailed = true"
  />

  <!-- Markdown & Text Document Card Preview -->
  <div
    v-else-if="isTextDoc && !mediaFailed"
    class="absolute inset-0 flex flex-col overflow-hidden bg-slate-50 p-3.5 text-slate-800 dark:bg-slate-900 dark:text-slate-100"
  >
    <div class="mb-2 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
      <div class="flex items-center gap-2 min-w-0">
        <Icon :name="isMarkdown ? 'vscode-icons:file-type-markdown' : 'lucide:file-text'" class="size-5 shrink-0 text-blue-500" />
        <span class="truncate text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {{ isMarkdown ? 'MARKDOWN' : 'TEXT DOCUMENT' }}
        </span>
      </div>
      <span class="rounded bg-slate-200/80 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {{ file.name.split('.').pop()?.toUpperCase() }}
      </span>
    </div>
    <div v-if="textSnippet" class="min-h-0 flex-1 overflow-hidden font-mono text-[10px] leading-relaxed text-slate-600 dark:text-slate-300 opacity-90">
      {{ textSnippet }}
    </div>
    <div v-else class="flex flex-1 flex-col items-center justify-center gap-1.5 text-slate-400">
      <Icon name="lucide:file-text" class="size-6 opacity-40" />
      <span class="text-[10px]">Loading preview...</span>
    </div>
  </div>

  <!-- Excel Live Spreadsheet Real Content Preview -->
  <div
    v-else-if="isOfficeDoc && officeType === 'excel' && !mediaFailed"
    class="absolute inset-0 flex flex-col overflow-hidden bg-slate-900 text-slate-100"
  >
    <div class="z-10 flex items-center justify-between border-b border-emerald-500/20 bg-emerald-950/90 px-2.5 py-1.5 backdrop-blur shrink-0">
      <div class="flex items-center gap-1.5 min-w-0">
        <Icon name="vscode-icons:file-type-excel" class="size-4 shrink-0" />
        <span class="truncate text-[10px] font-bold text-emerald-300">
          {{ file.name }}
        </span>
      </div>
      <span class="text-[9px] font-mono uppercase text-emerald-400 font-bold tracking-wider">EXCEL</span>
    </div>
    <div class="relative min-h-0 flex-1 overflow-hidden pointer-events-none select-none bg-white">
      <ClientOnly>
        <component
          :is="VueOfficeExcel"
          :src="inlineUrl"
          class="w-[140%] h-[140%] scale-[0.71] origin-top-left border-0"
          @error="mediaFailed = true"
        />
      </ClientOnly>
    </div>
  </div>

  <!-- Word Live Document Real Content Preview -->
  <div
    v-else-if="isOfficeDoc && officeType === 'word' && !mediaFailed"
    class="absolute inset-0 flex flex-col overflow-hidden bg-slate-900 text-slate-100"
  >
    <div class="z-10 flex items-center justify-between border-b border-blue-500/20 bg-blue-950/90 px-2.5 py-1.5 backdrop-blur shrink-0">
      <div class="flex items-center gap-1.5 min-w-0">
        <Icon name="vscode-icons:file-type-word" class="size-4 shrink-0" />
        <span class="truncate text-[10px] font-bold text-blue-300">
          {{ file.name }}
        </span>
      </div>
      <span class="text-[9px] font-mono uppercase text-blue-400 font-bold tracking-wider">WORD</span>
    </div>
    <div class="relative min-h-0 flex-1 overflow-hidden pointer-events-none select-none bg-white">
      <ClientOnly>
        <component
          :is="VueOfficeDocx"
          :src="inlineUrl"
          class="w-[140%] h-[140%] scale-[0.71] origin-top-left border-0"
          @error="mediaFailed = true"
        />
      </ClientOnly>
    </div>
  </div>

  <!-- PowerPoint Live Presentation Preview -->
  <div
    v-else-if="isOfficeDoc && officeType === 'powerpoint' && !mediaFailed"
    class="absolute inset-0 flex flex-col overflow-hidden bg-slate-900 text-slate-100"
  >
    <div class="z-10 flex items-center justify-between border-b border-amber-500/20 bg-amber-950/90 px-2.5 py-1.5 backdrop-blur shrink-0">
      <div class="flex items-center gap-1.5 min-w-0">
        <Icon name="vscode-icons:file-type-powerpoint" class="size-4 shrink-0" />
        <span class="truncate text-[10px] font-bold text-amber-300">
          {{ file.name }}
        </span>
      </div>
      <span class="text-[9px] font-mono uppercase text-amber-400 font-bold tracking-wider">PPTX</span>
    </div>
    <div class="relative min-h-0 flex-1 overflow-hidden pointer-events-none select-none bg-white">
      <ClientOnly>
        <component
          :is="VueOfficePptx"
          :src="inlineUrl"
          class="w-[140%] h-[140%] scale-[0.71] origin-top-left border-0"
          @error="mediaFailed = true"
        />
      </ClientOnly>
    </div>
  </div>

  <!-- Archive File Preview -->
  <div
    v-else-if="isArchive"
    class="absolute inset-0 flex flex-col overflow-hidden bg-[#fff3df] p-4 text-[#3c2109] dark:bg-[#24170d] dark:text-[#ffca8b]"
  >
    <div class="mb-2 flex items-center gap-2 border-b border-amber-300/50 pb-2 dark:border-amber-700/50">
      <Icon name="vscode-icons:file-type-zip" :class="layout === 'col' ? 'size-9' : 'size-6'" />
      <div class="min-w-0">
        <p class="text-[10px] font-bold uppercase tracking-wide">ZIP archive</p>
        <p class="truncate text-[10px] opacity-70">{{ archiveEntryCount }} items</p>
      </div>
    </div>
    <ul v-if="archiveEntries.length" class="min-h-0 space-y-1 overflow-hidden text-[10px] leading-tight">
      <li v-for="entry in archiveEntries" :key="entry" class="flex items-center gap-1 truncate">
        <Icon name="lucide:file" class="size-3 shrink-0 opacity-60" />
        <span class="truncate">{{ entry }}</span>
      </li>
    </ul>
    <p v-else class="text-[10px] opacity-65">Archive contents are available after a fresh local upload.</p>
  </div>

  <!-- Google Drive Shortcut Preview -->
  <div
    v-else-if="isDriveShortcut"
    class="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-white via-blue-50 to-emerald-50 p-4 text-slate-900 dark:from-[#12223a] dark:via-[#10253a] dark:to-[#102c2a] dark:text-white"
  >
    <div class="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-lg dark:border-white/10 dark:bg-white/10">
      <Icon name="logos:google-drive" :class="layout === 'col' ? 'size-12' : 'size-8'" />
    </div>
    <div class="text-center">
      <p class="text-xs font-bold">Google Drive shortcut</p>
      <p class="mt-1 text-[10px] opacity-65">Open original in Drive</p>
    </div>
  </div>

  <!-- Fallback File Icon Card -->
  <div v-else class="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-2 p-3">
    <Icon :name="fileIcon(file.contentType || file.type)" :class="layout === 'col' ? 'size-24' : 'size-12'" />
    <span v-if="mediaFailed" class="text-center text-[10px] text-neutral-500">Preview unavailable</span>
  </div>
</template>
