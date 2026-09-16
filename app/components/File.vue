<script setup lang="ts">
import { formatTimeAgo } from "@vueuse/core";
import { formatBytes } from "~/utils/helper";
const { file, dir, selected, allowDeletedSelection = false } = defineProps<{
  file: IFile;
  dir: "row" | "col";
  selected: boolean;
  allowDeletedSelection?: boolean;
}>();
const emit = defineEmits(["select", "open", "delete"]);
const summary = computed(() => {
  let text = file.type;
  if (file.size) text += " / " + formatBytes(file.size as number);
  if (file.dimensions) text += " / " + file.dimensions;
  return text;
});
</script>
<template>
  <FileMenu
    :file="file"
    open-mode="emit"
    @open="emit('open', file.id)"
    @delete="emit('delete')"
  >
    <div
      :class="[
        'dam-asset-card group relative flex w-full cursor-pointer overflow-hidden rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel)] transition duration-300 hover:-translate-y-1 hover:border-primary-500/55 hover:shadow-[var(--dam-shadow)]',
        selected && 'border-primary-500 ring-1 ring-primary-500',
        dir === 'row' ? 'flex-row' : 'flex-col',
      ]"
      @click.stop="(!file.deletedAt || allowDeletedSelection) && emit('select', file.id)"
      @dblclick="!file.deletedAt && emit('open', file.id)"
    >
      <div
        :class="[
          'dam-asset-media relative overflow-hidden',
          dir === 'row' ? 'aspect-auto min-h-32 w-48 shrink-0' : 'aspect-[16/10] min-h-[250px] w-full',
          selected ? 'bg-primary-100 dark:bg-primary-950' : 'bg-neutral-100 dark:bg-[#0b0c0e]',
        ]"
      >
        <Thumbnail :file="file" :layout="dir" />
        <span
          v-if="file.duplicateOfId"
          class="pointer-events-none absolute left-2 top-2 z-[4] rounded-full bg-amber-500/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow"
          title="This asset reuses the content of an existing file"
        >
          Duplicate
        </span>
        <div class="pointer-events-none absolute inset-x-3 bottom-3 z-[3] rounded-xl bg-slate-950/80 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-sm">
          <span class="block truncate" :title="file.name">{{ file.name || "Untitled asset" }}</span>
        </div>
        <div class="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3 opacity-0 transition-opacity group-hover:opacity-100">
          <span class="bg-black/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white rounded-md backdrop-blur">{{ file.type }}</span>
          <span class="flex size-8 items-center justify-center rounded-lg bg-black/75 text-white backdrop-blur"><Icon name="lucide:mouse-pointer-click" class="size-4" /></span>
        </div>
      </div>
      <div
        :class="[
          'flex min-w-0 grow items-center gap-3 border-t border-[var(--dam-line)] p-4',
          selected ? 'bg-primary-500 text-white' : 'bg-[var(--dam-panel)] text-[var(--dam-ink)]',
        ]"
      >
        <div class="min-w-0 grow">
          <div class="line-clamp-1 break-all text-sm font-bold tracking-[-0.01em]" :title="file.name">{{ file.name || "Untitled asset" }}</div>
          <div class="mt-1 line-clamp-1 break-all text-[11px] font-semibold uppercase tracking-[0.08em] opacity-60">{{ summary }}</div>
          <div v-if="file.deletedAt" class="mt-1 text-right text-[10px] uppercase opacity-70">{{ formatTimeAgo(new Date(file.deletedAt)) }}</div>
        </div>
        <template v-if="!file.deletedAt">
          <Icon v-if="file.isFavorite" name="lucide:star" class="size-4 shrink-0 fill-amber-400 text-amber-500" aria-label="Favorite" />
          <Icon v-if="file.sharedCount" name="lucide:users" class="mr-1 min-w-4 opacity-70" />
          <VisibilityIcon :visibility="file.visibility" />
        </template>
      </div>
    </div>
  </FileMenu>
</template>
