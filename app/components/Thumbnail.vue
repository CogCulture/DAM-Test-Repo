<script setup lang="ts">
const { file, layout } = defineProps<{
  file: IFile;
  layout: "row" | "col";
}>();
const folderPreviews = computed(() => {
  if (file.type === "folder" && file.preview) {
    try {
      const parsed = JSON.parse(file.preview);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
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
        :style="
          preview && {
            backgroundImage: `url('${getPreviewUrl(preview, file.deletedAt)}')`,
          }
        "
      >
        <!-- Show count indicator only in the last cell if there are more files -->
        <div
          v-if="
            index === folderPreviews.length - 1 &&
            file.count &&
            file.count > folderPreviews.length
          "
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
    v-else-if="file.preview"
    :src="getPreviewUrl(file.preview, file.deletedAt)"
    alt="preview"
    class="absolute inset-0 w-full h-full object-contain"
  />
  <div
    v-else
    class="absolute inset-0 w-full h-full flex justify-center items-center"
  >
    <Icon :name="fileIcon(file.contentType || file.type)" class="size-24" />
  </div>
</template>
