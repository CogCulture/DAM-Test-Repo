<script setup lang="ts">
import { defineShortcuts } from "~/composables/defineShortcuts";
import { useFolder } from "~/composables/useFolder";
import { useFiles } from "~/composables/useFiles";
import { usePreview } from "~/composables/usePreview";
import { useSelected } from "~/composables/useSelected";
import { useRole } from "~/composables/useRole";
import { useFileActions } from "~/composables/useFileActions";
import { useToast } from "~/composables/useToast";
import { isGoogleDriveAsset } from "~/utils/damModal";
import { dispatchDroppedFiles } from "~~/shared/utils/upload-dispatch";
import { useUploadDestination } from "~/composables/useUploadDestination";
import type { DirectoryUploadSelection } from "~~/shared/utils/directory-upload";

const props = defineProps<{
  title?: string;
  endpoint?: string;
  description?: string;
  icon?: string;
  calloutTitle?: string;
  calloutDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  showFavoritePicker?: boolean;
}>();
const route = useRoute();
const router = useRouter();
const { folder } = useFolder();
const activeEndpoint = computed(() => props.endpoint || "root");
const { files, loading, error, onSort, onFilter, refresh } =
  useFiles(activeEndpoint);
const { showPreview } = usePreview();
const { selected, toggleSelected, resetSelected } = useSelected();
const view = useState<string>("view", () => "grid");
const { canUpload, canCreateFolder, canDelete } = useRole();
const { deleteFiles, deleting } = useFileActions();
const toast = useToast();
const storageTarget = useState<"local" | "gdrive">("upload-storage-target", () => "local");
const { activeFolder: activeUploadFolder, selectUploadFolder } = useUploadDestination();

const safeFiles = computed(() => files.value || []);
const isFolderRoute = computed(() => !!route.params.id && (Array.isArray(route.params.id) ? route.params.id.filter(Boolean).length > 0 : true));
const displayTitle = computed(() => props.title || (isFolderRoute.value ? folder.value?.name : null) || "All assets");
const activeFilters = ref(false);
const actionsOpen = ref(false);
const assetControlsPanel = ref<HTMLElement | null>(null);
const restoring = ref(false);
const isTrash = computed(() => props.endpoint === "trash");

const closeActions = () => {
  actionsOpen.value = false;
};
const toggleActions = () => {
  actionsOpen.value = !actionsOpen.value;
};
watch(actionsOpen, async (open) => {
  if (!open) return;
  await nextTick();
  if (assetControlsPanel.value) assetControlsPanel.value.scrollTop = 0;
});
const uploadRef = ref();
const onFilesDropped = async (filesList: File[] | DirectoryUploadSelection) => {
  await nextTick();

  let attempts = 0;
  while (!uploadRef.value && attempts < 20) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    attempts++;
  }

  try {
    const result = await dispatchDroppedFiles(filesList, uploadRef.value);
    if (!result.ok) {
      toast.add({
        title: "Upload not started",
        description: result.message,
        color: "error",
      });
    } else {
      refresh();
    }
  } catch (error: any) {
    toast.add({
      title: "Upload not started",
      description: error?.data?.message || error?.message || "Unable to prepare the selected files.",
      color: "error",
    });
  }
};
const onDropError = (message: string) => {
  toast.add({ title: "Folder could not be selected", description: message, color: "error" });
};
const applyFilters = (value: any) => {
  activeFilters.value = !!value;
  onFilter(value);
  actionsOpen.value = false;
};
const setView = (value: string) => {
  view.value = value;
  actionsOpen.value = false;
};

const restoreSelected = async () => {
  if (!selected.value.length || restoring.value) return;
  restoring.value = true;
  try {
    await $fetch(`/api/files/${route.params.bucket}/restore`, {
      method: "POST",
      body: selected.value,
    });
    toast.add({
      title: "Assets restored",
      description: `${selected.value.length} item(s) returned to the library.`,
      color: "success",
    });
    selected.value = [];
    refresh();
  } catch (err: any) {
    toast.add({
      title: "Restore failed",
      description: err?.data?.message || err?.message || "Please try again.",
      color: "error",
    });
  } finally {
    restoring.value = false;
  }
};
const permanentlyDeleteSelected = async () => {
  if (!selected.value.length || deleting.value) return;
  if (import.meta.client && !window.confirm(`Permanently delete ${selected.value.length} selected item(s)? This cannot be undone.`)) return;
  await deleteFiles([...selected.value]);
  selected.value = [];
  refresh();
};

watch(() => route.path, () => {
  selected.value = [];
});
watch(
  () => route.params.id,
  (idParam) => {
    const routeFolderId = Array.isArray(idParam) ? idParam.join("/") : "";
    if (!routeFolderId) {
      selectUploadFolder({
        id: "root",
        name: "Organization root",
        path: "Organization root",
        parentId: null,
        type: "folder",
      });
      return;
    }
    if (activeUploadFolder.value?.id !== routeFolderId) {
      selectUploadFolder({
        id: routeFolderId,
        name: folder.value?.name || "Selected folder",
        path: folder.value?.path || routeFolderId,
        parentId: folder.value?.parentId || null,
        type: "folder",
      });
    }
  },
  { immediate: true },
);

const isFolderItem = (item: any) => {
  if (!item) return false;
  if (typeof item === "string") {
    const found = safeFiles.value.find((f: any) => f.id === item);
    if (found) return isFolderItem(found);
    return false;
  }
  return (
    item.type === "folder" ||
    item.contentType === "folder" ||
    item.type === "directory" ||
    (!item.contentType && !item.size && item.name && !item.name.includes("."))
  );
};

const folderItems = computed(() => safeFiles.value.filter((f) => isFolderItem(f)));
const fileItems = computed(() => safeFiles.value.filter((f) => !isFolderItem(f)));
const activeTypeTab = ref<"all" | "folders" | "files">("all");

const sortedSafeFiles = computed(() => {
  return [...safeFiles.value].sort((a: any, b: any) => {
    const aIsFolder = isFolderItem(a);
    const bIsFolder = isFolderItem(b);
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return (a?.name || "").localeCompare(b?.name || "", undefined, { sensitivity: "base" });
  });
});

const displayFiles = computed(() => {
  if (activeTypeTab.value === "folders") {
    return sortedSafeFiles.value.filter(isFolderItem);
  }
  if (activeTypeTab.value === "files") {
    return sortedSafeFiles.value.filter((f) => !isFolderItem(f));
  }
  return sortedSafeFiles.value;
});

const onOpen = async (target: any, index = 0) => {
  const item = typeof target === "string" ? safeFiles.value.find((f: any) => f.id === target) || { id: target, type: "folder" } : target;
  if (!item) return;
  const bucket = (route.params.bucket as string) || "org";
  if (isFolderItem(item)) {
    resetSelected();
    await navigateTo(`/${bucket}/${item.id}`);
    return;
  }
  closeActions();
  const fileIdx = fileItems.value.findIndex((f) => f.id === item.id);
  showPreview(fileItems.value.length ? fileItems.value : safeFiles.value, fileIdx >= 0 ? fileIdx : index);
};

const onDblClick = async (target: any, index = 0) => {
  await onOpen(target, index);
};
defineShortcuts({
  meta_a: () => {
    if (selected.value.length === safeFiles.value.length) {
      selected.value = [];
    } else {
      selected.value = safeFiles.value.map((file) => file.id);
    }
  },
});
</script>
<template>
  <div class="dam-files-root w-full">
    <Title v-if="title">{{ title }}</Title>
    <Title v-else-if="isFolderRoute && folder">{{ folder.name }}</Title>
    <Title v-else>All assets</Title>

    <!-- Always mounted upload ref controller -->
    <Upload ref="uploadRef" controller-only @success="refresh" />

    <AppMain :title="displayTitle" :description="description" :icon="icon">
    <!-- Pending User Approvals Banner for Org Admins -->
    <AppPendingApprovals />

    <template #actions>
      <FavoritesPicker v-if="showFavoritePicker" />
      <NewFile v-if="canCreateFolder && !endpoint" size="md" />
      <UButton
        type="button"
        icon="lucide:sliders-horizontal"
        label="Asset actions"
        color="neutral"
        variant="outline"
        class="dam-control h-10 rounded-xl px-3 font-semibold shadow-[var(--dam-shadow-soft)] cursor-pointer"
        :aria-expanded="actionsOpen"
        aria-haspopup="dialog"
        aria-controls="asset-actions-panel"
        data-testid="asset-actions-trigger"
        @click="toggleActions"
      >
        <template #trailing>
          <Icon name="lucide:chevron-down" :class="['size-4 transition-transform', actionsOpen && 'rotate-180']" />
        </template>
      </UButton>
    </template>
    <section
      v-if="endpoint"
      class="library-overview relative overflow-hidden rounded-2xl border border-[var(--dam-line)] p-5 shadow-[var(--dam-shadow-soft)]"
      :data-feature="endpoint"
    >
      <div class="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="max-w-2xl">
          <p class="text-lg font-semibold tracking-[-0.02em] text-[var(--dam-ink)]">{{ calloutTitle }}</p>
          <p class="mt-1 text-sm leading-6 text-[var(--dam-muted)]">{{ calloutDescription }}</p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <span class="rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] px-3 py-2 text-xs font-semibold text-[var(--dam-ink)]">{{ safeFiles.length }} {{ safeFiles.length === 1 ? "asset" : "assets" }}</span>
          <UButton type="button" icon="lucide:refresh-cw" label="Refresh" color="neutral" variant="outline" size="sm" @click="refresh" />
          <UButton :to="`/${route.params.bucket}`" icon="lucide:arrow-left" label="All assets" color="neutral" variant="ghost" size="sm" />
        </div>
      </div>
    </section>

    <div v-if="isTrash && selected.length" class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/25 bg-red-500/5 px-4 py-3">
      <span class="text-sm font-semibold text-[var(--dam-ink)]">{{ selected.length }} selected</span>
      <div class="flex flex-wrap gap-2">
        <UButton type="button" icon="lucide:rotate-ccw" label="Restore" color="primary" variant="solid" size="sm" :loading="restoring" @click="restoreSelected" />
        <UButton type="button" icon="lucide:trash-2" label="Delete permanently" color="error" variant="soft" size="sm" :loading="deleting" @click="permanentlyDeleteSelected" />
      </div>
    </div>

    <div class="flex items-center justify-between gap-4 text-xs text-[var(--dam-muted)] flex-wrap">
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          :class="[
            'cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold transition',
            activeTypeTab === 'all'
              ? 'bg-primary-500 text-white shadow-xs'
              : 'hover:bg-[var(--dam-panel-raised)] text-[var(--dam-muted)] hover:text-[var(--dam-ink)]'
          ]"
          @click="activeTypeTab = 'all'"
        >
          All ({{ safeFiles.length }})
        </button>
        <button
          v-if="folderItems.length > 0"
          type="button"
          :class="[
            'flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition',
            activeTypeTab === 'folders'
              ? 'bg-primary-500 text-white shadow-xs'
              : 'hover:bg-[var(--dam-panel-raised)] text-[var(--dam-muted)] hover:text-[var(--dam-ink)]'
          ]"
          @click="activeTypeTab = 'folders'"
        >
          <Icon name="lucide:folder" class="size-3.5 text-amber-500" />
          Folders ({{ folderItems.length }})
        </button>
        <button
          v-if="fileItems.length > 0"
          type="button"
          :class="[
            'flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition',
            activeTypeTab === 'files'
              ? 'bg-primary-500 text-white shadow-xs'
              : 'hover:bg-[var(--dam-panel-raised)] text-[var(--dam-muted)] hover:text-[var(--dam-ink)]'
          ]"
          @click="activeTypeTab = 'files'"
        >
          <Icon name="lucide:file-text" class="size-3.5 text-blue-500" />
          Files ({{ fileItems.length }})
        </button>
        <span v-if="activeFilters" class="ml-2 font-semibold text-primary-500">Filters applied</span>
      </div>
      <span class="hidden sm:inline">Single-click to select · Double-click to preview/open · Right-click for actions</span>
    </div>
    
    <!-- Upload Drop Zone / Upload Bar -->
    <DropFiles v-if="!endpoint && canUpload" @dropped="onFilesDropped" @error="onDropError" />

    <!-- Assets Grid / List View -->
    <AppView v-if="loading || safeFiles.length > 0" :name="view" v-slot="{ dir }" :loading="loading">
      <File
        v-for="(file, index) in displayFiles"
        :key="file.id || index"
        :dir="dir"
        :file="file"
        :allow-deleted-selection="isTrash"
        @select="toggleSelected"
        @open="onOpen(file, index)"
        @dblclick="onDblClick(file, index)"
        @delete="refresh"
        :selected="selected.includes(file.id)"
      />
    </AppView>

    <div
      v-else-if="!loading && error"
      class="flex min-h-48 flex-col items-center justify-center gap-3 border border-red-300/50 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950/20"
    >
      <Icon name="lucide:triangle-alert" class="size-10 text-red-500" />
      <div>
        <p class="font-medium">Files could not be loaded</p>
        <p class="mt-1 text-sm text-neutral-500">{{ error }}</p>
      </div>
      <UButton
        v-if="error?.toLowerCase().includes('reconnect') || error?.toLowerCase().includes('expired')"
        to="/api/auth/google?gdrive=true"
        external
        size="sm"
        color="primary"
        icon="lucide:log-in"
        label="Reconnect Google Drive"
      />
      <UButton v-else size="sm" variant="soft" icon="lucide:refresh-cw" label="Try again" @click="refresh" />
    </div>

    <div
      v-else-if="!loading && safeFiles.length === 0"
      class="flex min-h-[42vh] flex-col items-center justify-center rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel)] p-8 shadow-sm"
    >
      <Icon :name="icon || 'lucide:folder-open'" class="mb-3 size-12 text-[var(--dam-muted)] *:stroke-[1px]" />
      <div class="text-lg font-medium text-[var(--dam-ink)]">{{ emptyTitle || "This folder is empty" }}</div>
      <div v-if="!endpoint && canCreateFolder" class="mt-4 flex flex-wrap items-center justify-center gap-3">
        <NewFile size="md" />
      </div>
    </div>
  </AppMain>

  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div v-show="actionsOpen" class="fixed inset-0 z-[9998] flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" @click="closeActions" />

        <div
          id="asset-actions-panel"
          ref="assetControlsPanel"
          class="asset-controls-panel relative z-[9999] w-[min(34rem,calc(100vw-2rem))] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] p-5 text-[var(--dam-ink)] shadow-2xl space-y-4"
          role="dialog"
          aria-label="Asset controls"
          data-testid="asset-actions-panel"
          @click.stop
        >
          <!-- Header -->
          <div class="asset-controls-header sticky -top-5 z-10 -mx-5 -mt-5 flex items-center justify-between gap-4 border-b border-[var(--dam-line)] bg-[var(--dam-panel-solid)] px-5 py-4 backdrop-blur-md">
            <div>
              <div class="flex items-center gap-2">
                <Icon name="lucide:sliders-horizontal" class="size-4 text-[#ff5733]" />
                <p class="text-sm font-bold tracking-wider uppercase text-[var(--dam-ink)]">Asset Controls</p>
              </div>
              <p class="mt-0.5 text-xs text-[var(--dam-muted)]">Upload, organize, and customize your workspace view.</p>
            </div>
            <UButton icon="lucide:x" color="neutral" variant="ghost" size="sm" class="rounded-xl hover:bg-[var(--dam-panel-raised)] text-[var(--dam-muted)] hover:text-[var(--dam-ink)]" aria-label="Close asset actions" @click="closeActions" />
          </div>

          <!-- Section 1: Upload & Add Assets -->
          <div v-if="!endpoint && (canUpload || canCreateFolder)" class="asset-controls-section rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] p-4 space-y-3">
            <div class="flex items-center justify-between border-b border-[var(--dam-line)] pb-2">
              <span class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--dam-ink)]">
                <Icon name="lucide:upload-cloud" class="size-3.5 text-[#ff5733]" />
                1. Upload & Create
              </span>
              <NewFile v-if="canCreateFolder" size="xs" />
            </div>
            <Upload v-if="canUpload" @success="refresh" />
          </div>

          <!-- Section 2: Sort By -->
          <div class="asset-controls-section rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] p-3.5 space-y-2 w-full">
            <span class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--dam-ink)]">
              <Icon name="lucide:arrow-up-down" class="size-3.5 text-emerald-400" />
              2. Sort By
            </span>
            <SortFiles @update="onSort" />
          </div>

          <!-- Section 3: Layout View Mode -->
          <div class="asset-controls-section rounded-2xl border border-slate-700/60 bg-slate-800/40 p-3.5 space-y-2">
            <span class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-200">
              <Icon name="lucide:layout-grid" class="size-3.5 text-sky-400" />
              3. View Mode
            </span>
            <ToggleButton :model-value="view" @update:model-value="setView" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  </div>
</template>
