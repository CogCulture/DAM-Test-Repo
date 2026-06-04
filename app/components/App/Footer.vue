<script setup lang="ts">
const route = useRoute();
const { files, refresh } = useFiles();
const { selected, resetSelected } = useSelected();
const { deleteFiles, deleting, downloadFile } = useFileActions();
const { openShare } = useShare();
const { openMove } = useMove();
const selectedFiles = computed(() =>
  selected.value.map((id) => files.value.find((file) => file.id === id)!)
);
watch(deleting, (value) => {
  if (!value) {
    resetSelected();
    refresh();
  }
});
</script>
<template>
  <footer
    v-if="route?.params?.bucket"
    class="px-4 sm:px-18 bg-white dark:bg-neutral-950 fixed bottom-0 left-0 right-0 z-10 border-t border-neutral-200 dark:border-neutral-700/50"
  >
    <div
      class="flex flex-wrap items-center border-b border-neutral-200 dark:border-neutral-700/50 gap-1 p-1"
      v-if="selected.length"
    >
      <div class="w-full sm:w-auto flex items-center gap-4">
        <label class="font-medium px-4 text-sm">{{
          selected.length + " selected"
        }}</label>
        <UButton
          trailingIcon="lucide:x"
          @click="resetSelected"
          class="sm:hidden ml-auto"
        />
      </div>
      <UButton
        icon="lucide:users"
        label="Share"
        @click="openShare(selectedFiles)"
      />
      <UButton
        v-if="selected.length === 1"
        icon="lucide:folder-input"
        label="Move to"
        @click="openMove(selectedFiles[0])"
      />
      <UButton
        v-if="selected.length === 1"
        icon="lucide:download"
        label="Download"
        :to="downloadFile(route.params.bucket as string, selected[0] as string)"
        target="_blank"
      />
      <UButton
        :loading="deleting"
        icon="lucide:trash"
        :label="route.path.endsWith('/trash') ? 'Delete Permanently' : 'Delete'"
        @click="deleteFiles(selected)"
      />
      <UButton
        trailingIcon="lucide:x"
        @click="resetSelected"
        class="hidden sm:flex ml-auto"
      />
    </div>
  </footer>
</template>
