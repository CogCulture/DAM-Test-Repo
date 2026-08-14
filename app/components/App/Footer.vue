<script setup lang="ts">
import { useSelected } from "~/composables/useSelected";
import { useFileActions } from "~/composables/useFileActions";
import { useShare } from "~/composables/useShare";
import { useMove } from "~/composables/useMove";

const route = useRoute();
// Reuse the list owned by <AppFiles>. Calling useFiles() here starts a second
// request and both composable instances append into the same shared state.
const files = useState<IFile[]>("files", () => []);
const refreshTrigger = useState("files-refresh-trigger", () => 0);
const refresh = () => {
  refreshTrigger.value++;
};
const { selected, resetSelected } = useSelected();
const { deleteFiles, deleting, downloadAsset, downloading } = useFileActions();
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
    class="pointer-events-none fixed inset-x-0 bottom-4 z-20 px-4 sm:pl-[18.5rem] sm:pr-6"
  >
    <div
      class="dam-glass pointer-events-auto mx-auto flex max-w-4xl flex-wrap items-center gap-1 rounded-2xl p-2 shadow-[var(--dam-shadow)]"
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
        :loading="downloading"
        @click="downloadAsset(selectedFiles[0])"
      />
      <UButton
        :loading="deleting"
        icon="lucide:trash"
        :label="route.path.endsWith('/trash') ? 'Delete Permanently' : 'Delete'"
        @click="deleteFiles(selectedFiles)"
      />
      <UButton
        trailingIcon="lucide:x"
        @click="resetSelected"
        class="hidden sm:flex ml-auto"
      />
    </div>
  </footer>
</template>
