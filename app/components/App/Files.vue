<script setup lang="ts">
const props = defineProps<{
  title?: string;
  endpoint?: string;
}>();
const route = useRoute();
const router = useRouter();
const { folder } = useFolder();
const { files, isEnd, loadMore, loading, onSort, onFilter, refresh } = useFiles(
  props.endpoint
);
const { opened, limit } = usePreview();
const { selected, toggleSelected } = useSelected();
const view = useState<string>("view", () => "grid");
const { canUpload, canCreateFolder, canShare, canDelete } = useRole();

const showNomenclatureModal = ref(false);
const droppedFiles = ref<File[]>([]);
const onFilesDropped = (filesList: File[]) => {
  droppedFiles.value = filesList;
  showNomenclatureModal.value = true;
};

watch(files, () => {
  if (files.value && files.value.length >= 0) {
    limit.value = 0;
  }
});
const onOpen = (file: IFile, index: number) => {
  if (file.type === "folder") {
    router.push(`/${route.params.bucket}/${file.id}`);
  } else {
    opened.value = index;
  }
};
defineShortcuts({
  meta_a: () => {
    if (selected.value.length === files.value.length) {
      selected.value = [];
    } else {
      selected.value = files.value.map((file) => file.id);
    }
  },
});
</script>
<template>
  <Title v-if="title">{{ title }}</Title>
  <Title v-else-if="folder">{{ folder.name }}</Title>
  <Title v-else>{{ route.params.bucket }}</Title>
  <FilePreview v-if="files" :files="files" />
  <Share
    v-if="selected.length > 0 && canShare"
    :files="files.filter((file) => selected.includes(file.id))"
  />
  <AppMain :title="title">
    <template #actions>
      <Upload v-if="!endpoint && canUpload" type="folder" @success="refresh" />
      <NewFile v-if="!endpoint && canCreateFolder" />
      <div class="ml-auto flex flex-wrap items-end gap-4">
        <SortFiles v-if="!endpoint" @update="onSort" />
        <Filter v-if="!endpoint" @update="onFilter" class="ml-auto" />
        <ToggleButton v-model="view" />
      </div>
    </template>
    <DropFiles v-if="!endpoint && canUpload" @dropped="onFilesDropped" class="mb-6" />
    <NomenclatureUploadModal
      v-slot="modal"
      v-model:open="showNomenclatureModal"
      :files="droppedFiles"
      :folder="folder"
      @success="refresh"
    />
    <AppView :name="view" v-slot="{ dir }" :loading="loading">
      <File
        v-for="(file, index) in files"
        :key="index"
        :dir="dir"
        :file="file"
        @select="toggleSelected"
        @open="onOpen(file, index)"
        @delete="refresh"
        :selected="selected.includes(file.id)"
      />
    </AppView>
    <div
      v-if="!loading && files.length === 0"
      class="flex flex-col items-center justify-center min-h-[50vh] border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black rounded-lg p-8 opacity-50"
    >
      <Icon name="lucide:hard-drive" class="size-16 *:stroke-[1px]" />
      <div class="text-lg">No files found</div>
    </div>
    <UButton
      v-if="!isEnd && !loading"
      @click="loadMore"
      class="mx-auto max-w-48"
    >
      Load more
    </UButton>
  </AppMain>
</template>
