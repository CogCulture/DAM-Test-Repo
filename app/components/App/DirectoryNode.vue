<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { fileIcon } from '~~/shared/utils/helper';
import { useRole } from '~~/app/composables/useRole';
import { usePreview } from '~/composables/usePreview';
import { useUploadDestination } from '~/composables/useUploadDestination';
import { replaceDirectoryBranch } from '~~/shared/utils/folder-upload-target';
import { loadAllDirectoryPages } from '~~/shared/utils/directory-pagination';

const props = defineProps<{
  file: any;
  bucketName: string;
  level: number;
}>();

const route = useRoute();
const { orgType } = useRole();
const { showPreview } = usePreview();
const { selectUploadFolder } = useUploadDestination();
const openStates = useState<Record<string, boolean>>("directory-node-open-states", () => ({}));
const open = computed({
  get: () => !!openStates.value[props.file.id],
  set: (val: boolean) => {
    openStates.value[props.file.id] = val;
  }
});
const files = ref<any[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

const isFolder = computed(() => props.file.type === 'folder');

const previewFile = () => {
  if (isFolder.value) return;
  const externalUrl = props.file.assetMetadata?.externalUrl;
  const isDriveAsset = props.file.assetMetadata?.source === "google-drive";
  const fileUrl = externalUrl || (isDriveAsset
    ? `/api/gdrive/download/${encodeURIComponent(props.file.id)}?inline=true`
    : `/api/files/${encodeURIComponent(props.bucketName || 'org')}/download/${encodeURIComponent(props.file.id)}?inline=true`);
  if (import.meta.client) {
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
  }
};

const selectFolderForUpload = () => {
  if (!isFolder.value) return;
  selectUploadFolder({
    id: props.file.id,
    name: props.file.name,
    path: props.file.uploadPath || props.file.displayPath || props.file.name,
    parentId: props.file.parentId || null,
    type: "folder",
    departmentId: props.file.departmentId || null,
  });
};

const fetchContents = async () => {
  loading.value = true;
  loadError.value = null;
  try {
    const isGDrive = orgType.value === "gdrive" || (props.bucketName && props.bucketName.startsWith("gdrive_"));
    const url = isGDrive ? `/api/gdrive/list/${props.file.id}` : `/api/files/list/${props.bucketName}/${props.file.id}`;
    const data = await loadAllDirectoryPages<any>((page) => $fetch<any>(url, {
      query: {
        page,
        sortBy: 'name',
        order: 'asc',
        t: Date.now(),
      }
    }));
    files.value = replaceDirectoryBranch(files.value, data, true);
  } catch (err: any) {
    console.error("Error fetching directory contents:", err);
    loadError.value = err?.data?.message || err?.message || "Folder contents could not be loaded.";
  } finally {
    loading.value = false;
  }
};

const toggleOpen = () => {
  if (!isFolder.value) return;
  open.value = !open.value;
  if (open.value && files.value.length === 0) {
    fetchContents();
  }
};

const refreshTrigger = useState("files-refresh-trigger", () => 0);

watch(refreshTrigger, () => {
  if (open.value) {
    fetchContents();
  }
});

onMounted(() => {
  if (open.value && files.value.length === 0) {
    fetchContents();
  }
});

</script>

<template>
  <div class="flex flex-col w-full">
    <!-- Node row -->
    <FileMenu :file="file" @delete="refreshTrigger++" @refresh="refreshTrigger++">
      <div
        class="group flex cursor-pointer items-center gap-2 border border-transparent px-2 py-1.5 transition-colors hover:border-[var(--dam-line)] hover:bg-[var(--dam-panel-raised)]"
        :style="{ paddingLeft: `${(level * 20) + 6}px` }"
        @dblclick.stop.prevent="previewFile"
      >
      <!-- Caret for folder -->
      <div
        v-if="isFolder"
        class="flex size-5 shrink-0 items-center justify-center text-[var(--dam-muted)] transition-colors hover:bg-[var(--dam-line)]"
        @click.stop="toggleOpen"
      >
        <UIcon
          name="lucide:chevron-right"
          class="w-3.5 h-3.5 text-neutral-400 transition-transform duration-200"
          :class="{ 'rotate-90': open }"
        />
      </div>
      <div v-else class="w-5 shrink-0"></div>
      
      <!-- Icon -->
      <UIcon
        :name="fileIcon(file.contentType || file.type)"
        class="size-4 shrink-0 text-[var(--dam-muted)] group-hover:text-primary-500"
      />
      
      <!-- Label -->
      <NuxtLink
        v-if="isFolder"
        :to="`/${bucketName}/${file.id}`"
        class="grow truncate text-[13px] font-medium text-[var(--dam-muted)] transition-colors group-hover:text-[var(--dam-ink)]"
        :class="{ 'text-primary-500': route.params.id === file.id }"
        @click="selectFolderForUpload"
      >
        {{ file.name }}
      </NuxtLink>
      <button
        v-else
        type="button"
        class="grow truncate text-left text-[13px] font-medium text-[var(--dam-muted)] transition-colors group-hover:text-[var(--dam-ink)]"
        :title="`Double-click to open in new tab ${file.name}`"
        @dblclick.stop.prevent="previewFile"
      >
        {{ file.name }}
      </button>
      </div>
    </FileMenu>

    <!-- Recursive children if folder -->
    <div
      v-if="open && isFolder"
      class="directory-branch relative ml-3 border-l border-[var(--dam-line)] bg-[color-mix(in_srgb,var(--dam-panel-raised)_35%,transparent)] py-0.5"
    >
      <AppDirectoryNode
        v-for="childFile in files"
        :key="childFile.id"
        :file="childFile"
        :bucket-name="bucketName"
        :level="level + 1"
      />

      <!-- Loading / error state -->
      <div v-if="loading" class="py-2 text-center">
        <UIcon name="lucide:loader-2" class="w-4 h-4 animate-spin text-neutral-400" />
      </div>
      <div v-else-if="loadError" class="space-y-1 px-2 py-2 text-center">
        <p class="text-[11px] text-red-500">{{ loadError }}</p>
        <UButton
          size="2xs"
          variant="soft"
          icon="lucide:refresh-cw"
          label="Retry"
          @click="fetchContents()"
        />
      </div>
      <div v-else-if="files.length === 0" class="py-1">
        <div
          class="text-[11px] text-neutral-400 italic"
          :style="{ paddingLeft: `${((level + 1) * 20) + 34}px` }"
        >
          Empty folder
        </div>
      </div>
    </div>
  </div>
</template>
