<script setup lang="ts">
import { isGoogleDriveAsset } from "~/utils/damModal";
import { fileIcon } from "~~/shared/utils/helper";
const { file, layout } = defineProps<{
  file: IFile;
  layout: "row" | "col";
}>();

const mediaFailed = ref(false);
const normalizedType = computed(() => (file.contentType || file.type || "").toLowerCase());
const isGDrive = computed(() => isGoogleDriveAsset(file));
const inlineUrl = computed(() => isGDrive.value
  ? `/api/gdrive/download/${encodeURIComponent(file.id)}?inline=true`
  : `/api/files/${encodeURIComponent(file.bucketName)}/download/${encodeURIComponent(file.id)}?inline=true`);
const imageUrl = computed(() => !isGDrive.value && file.preview ? getPreviewUrl(file.preview, file.deletedAt) : inlineUrl.value);
const isImage = computed(() => file.type === "image" || normalizedType.value.startsWith("image/"));
const isVideo = computed(() => file.type === "video" || normalizedType.value.startsWith("video/"));
const isPdf = computed(() => file.type === "pdf" || normalizedType.value === "application/pdf");
const isArchive = computed(() => file.type === "archive" || normalizedType.value.includes("zip") || file.name.toLowerCase().endsWith(".zip"));
const isDriveShortcut = computed(() => file.assetMetadata?.source === "google-drive-link");
const archiveEntries = computed<string[]>(() => {
  const entries = file.assetMetadata?.archiveEntries;
  return Array.isArray(entries) ? entries.slice(0, layout === "row" ? 2 : 5) : [];
});
const archiveEntryCount = computed(() => Number(file.assetMetadata?.archiveEntryCount || archiveEntries.value.length));

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

  <img
    v-else-if="isImage && !mediaFailed"
    :src="imageUrl"
    :alt="`Preview of ${file.name}`"
    class="absolute inset-0 h-full w-full bg-neutral-100 object-cover transition-transform duration-150 group-hover:scale-[1.01] dark:bg-[#0b0c0e]"
    loading="lazy"
    decoding="async"
    @error="mediaFailed = true"
  />

  <video
    v-else-if="isVideo && !mediaFailed"
    :src="inlineUrl"
    class="absolute inset-0 h-full w-full object-cover bg-black pointer-events-none"
    muted
    preload="metadata"
    @error="mediaFailed = true"
  />

  <iframe
    v-else-if="isPdf && !mediaFailed"
    :src="`${inlineUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0`"
    :title="`Preview of ${file.name}`"
    class="absolute inset-0 h-full w-full border-0 bg-white pointer-events-none"
    loading="lazy"
  />

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

  <div v-else class="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-2 p-3">
    <Icon :name="fileIcon(file.contentType || file.type)" :class="layout === 'col' ? 'size-24' : 'size-12'" />
    <span v-if="mediaFailed" class="text-center text-[10px] text-neutral-500">Preview unavailable</span>
  </div>
</template>
