<script setup lang="ts">
const route = useRoute();
const open = ref(false);
const searchTerm = ref("");

defineShortcuts({
  meta_k: () => {
    open.value = !open.value;
  },
});
const { data: files, status } = await useFetch(
  `/api/files/${route.params?.bucket}/search`,
  {
    query: {
      q: searchTerm,
    },
    watch: [searchTerm],
    key: "command-palette-files",
    transform: (
      data: { id: string; name: string; path: string; type: string; contentType?: string }[]
    ) => {
      return (
        data?.map((file) => ({
          id: file.id,
          label: getFolderPath(file.path) + "/",
          suffix: file.name,
          icon: fileIcon(file.contentType || file.type),
          to:
            file.type === "folder"
              ? `/${route.params.bucket}/${file.id}`
              : `/${route.params.bucket}/file/${file.id}`,
        })) || []
      );
    },
    lazy: true,
  }
);

const groups = computed(() => [
  {
    id: "Files",
    label: searchTerm.value
      ? `files matching “${searchTerm.value}”...`
      : "files",
    items: files.value || [],
  },
]);
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ side: 'bottom', align: 'center' }"
    :ui="{
      content: 'w-md sm:w-xl md:w-2xl lg:w-3xl max-w-full -translate-y-12!',
    }"
  >
    <UButton
      label="Search"
      icon="lucide:search"
      variant="outline"
      class="sm:grow my-2 mx-auto max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl cursor-text"
    >
      <template #trailing> <UKbd class="ml-auto">⌘+K</UKbd></template>
    </UButton>
    <template #content>
      <UCommandPalette
        placeholder="Search"
        v-model:search-term="searchTerm"
        :loading="status === 'pending'"
        :groups="groups"
        class="flex-1"
      />
    </template>
  </UPopover>
</template>
