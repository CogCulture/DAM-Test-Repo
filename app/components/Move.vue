<script setup lang="ts">
import { ref, watch } from "vue";
import { damModalUi } from "~/utils/damModal";
import { useMove } from "~/composables/useMove";

const {
  isMoveOpen,
  moveTargetFile,
  moveLoading,
  moveError,
  closeMove,
  executeMove,
} = useMove();

const selectedFolder = ref<{ id: string; name: string; path?: string } | null>(null);

watch(isMoveOpen, (open) => {
  if (!open) {
    selectedFolder.value = null;
  }
});

const onSelect = (folder: { id: string; name: string; path?: string }) => {
  selectedFolder.value = folder;
};

const onMove = () => {
  if (selectedFolder.value) {
    executeMove(selectedFolder.value);
  }
};
</script>

<template>
  <UModal
    v-model:open="isMoveOpen"
    :title="`Move ${moveTargetFile?.type === 'folder' ? 'Folder' : 'File'}`"
    :description="`Choose a destination folder for &quot;${moveTargetFile?.name || 'item'}&quot;`"
    :ui="damModalUi"
  >
    <template #body>
      <UAlert
        v-if="moveError"
        title="Error"
        :description="moveError"
        color="error"
        variant="soft"
        icon="lucide:alert-circle"
        class="mb-4"
      />

      <div v-if="moveTargetFile" class="space-y-4">
        <!-- Current Asset Pill -->
        <div class="flex items-center gap-2 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] px-3 py-2 text-xs">
          <UIcon
            :name="moveTargetFile.type === 'folder' ? 'lucide:folder' : 'lucide:file'"
            class="size-4 shrink-0 text-[#ff5733]"
          />
          <span class="truncate font-semibold text-[var(--dam-ink)]">{{ moveTargetFile.name }}</span>
          <span class="ml-auto text-[10px] uppercase font-bold text-[var(--dam-muted)]">{{ moveTargetFile.type }}</span>
        </div>

        <UFormField label="Select Destination Folder">
          <FolderPicker :current-file="moveTargetFile" @select="onSelect" />
        </UFormField>

        <!-- Destination summary preview -->
        <div
          v-if="selectedFolder"
          class="flex items-center gap-2.5 rounded-xl border border-primary-500/30 bg-primary-500/10 p-3 text-xs text-primary-600 dark:text-primary-300"
        >
          <UIcon name="lucide:corner-down-right" class="size-4 shrink-0" />
          <div class="min-w-0 flex-1 truncate">
            Moving to <span class="font-bold">{{ selectedFolder.name }}</span>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          @click="closeMove"
        >
          Cancel
        </UButton>
        <UButton
          color="primary"
          variant="solid"
          icon="lucide:folder-input"
          :loading="moveLoading"
          :disabled="!selectedFolder || moveLoading"
          @click="onMove"
        >
          Move Here
        </UButton>
      </div>
    </template>
  </UModal>
</template>
