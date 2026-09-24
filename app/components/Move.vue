<script setup lang="ts">
import { ref } from "vue";
import { damModalUi } from "~/utils/damModal";

const props = defineProps<{
  file: any;
  loading: boolean;
  error: string;
}>();

const emit = defineEmits<{
  (e: "submit", payload: { folderId: string; folderName: string }): void;
}>();

const selectedFolder = ref<{ id: string; name: string; path?: string } | null>(null);

const onSelect = (folder: { id: string; name: string; path?: string }) => {
  selectedFolder.value = folder;
};

const onMove = () => {
  if (selectedFolder.value) {
    emit("submit", {
      folderId: selectedFolder.value.id,
      folderName: selectedFolder.value.name,
    });
  }
};
</script>

<template>
  <UModal
    :title="`Move ${file.type === 'folder' ? 'Folder' : 'File'}`"
    :description="`Choose a destination folder for &quot;${file.name}&quot;`"
    :ui="damModalUi"
  >
    <template #body>
      <UAlert
        v-if="error"
        title="Error"
        :description="error"
        color="error"
        variant="soft"
        icon="lucide:alert-circle"
        class="mb-4"
      />

      <div class="space-y-4">
        <!-- Current Asset Pill -->
        <div class="flex items-center gap-2 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] px-3 py-2 text-xs">
          <Icon
            :name="file.type === 'folder' ? 'lucide:folder' : 'lucide:file'"
            class="size-4 shrink-0 text-[#ff5733]"
          />
          <span class="truncate font-semibold text-[var(--dam-ink)]">{{ file.name }}</span>
          <span class="ml-auto text-[10px] uppercase font-bold text-[var(--dam-muted)]">{{ file.type }}</span>
        </div>

        <UFormField label="Select Destination Folder">
          <FolderPicker :current-file="file" @select="onSelect" />
        </UFormField>

        <!-- Destination summary preview -->
        <div
          v-if="selectedFolder"
          class="flex items-center gap-2.5 rounded-xl border border-primary-500/30 bg-primary-500/10 p-3 text-xs text-primary-600 dark:text-primary-300"
        >
          <Icon name="lucide:corner-down-right" class="size-4 shrink-0" />
          <div class="min-w-0 flex-1 truncate">
            Moving to <span class="font-bold">{{ selectedFolder.name }}</span>
            <span v-if="selectedFolder.path" class="text-[10px] opacity-75 block truncate">{{ selectedFolder.path }}</span>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <UButton
          color="primary"
          variant="solid"
          icon="lucide:folder-input"
          :loading="loading"
          :disabled="!selectedFolder || loading"
          @click="onMove"
        >
          Move Here
        </UButton>
      </div>
    </template>
  </UModal>
</template>
