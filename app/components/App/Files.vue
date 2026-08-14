<script setup lang="ts">
import { defineShortcuts } from "~/composables/defineShortcuts";
import { useFolder } from "~/composables/useFolder";
import { useFiles } from "~/composables/useFiles";
import { usePreview } from "~/composables/usePreview";
import { useSelected } from "~/composables/useSelected";
import { useRole } from "~/composables/useRole";
import { useFileActions } from "~/composables/useFileActions";
import { useToast } from "~/composables/useToast";
import { dispatchDroppedFiles } from "~~/shared/utils/upload-dispatch";
import { useUploadDestination } from "~/composables/useUploadDestination";

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
const { files, isEnd, loadMore, loading, error, onSort, onFilter, refresh } =
  useFiles(activeEndpoint);
const { showPreview } = usePreview();
const { selected, toggleSelected } = useSelected();
const view = useState<string>("view", () => "grid");
const { canUpload, canCreateFolder, canDelete } = useRole();
const { deleteFiles, deleting } = useFileActions();
const toast = useToast();
const storageTarget = useState<"local" | "gdrive">("upload-storage-target", () => "local");
const { activeFolder: activeUploadFolder, selectUploadFolder } = useUploadDestination();

const safeFiles = computed(() => files.value || []);
const displayTitle = computed(() => props.title || folder.value?.name || "All assets");
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
const onFilesDropped = async (filesList: File[]) => {
  actionsOpen.value = true;
  await nextTick();

  try {
    const result = await dispatchDroppedFiles(filesList, uploadRef.value);
    if (!result.ok) {
      toast.add({
        title: "Upload not started",
        description: result.message,
        color: "error",
      });
    }
  } catch (error: any) {
    toast.add({
      title: "Upload not started",
      description: error?.data?.message || error?.message || "Unable to prepare the selected files.",
      color: "error",
    });
  }
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
const onOpen = (file: IFile, index: number) => {
  const externalUrl = file.assetMetadata?.externalUrl;
  if (externalUrl && typeof window !== "undefined") {
    window.open(externalUrl, "_blank", "noopener,noreferrer");
  } else if (file.type === "folder") {
    router.push(`/${route.params.bucket}/${file.id}`);
  } else {
    showPreview(safeFiles.value, index);
  }
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
  <Title v-if="title">{{ title }}</Title>
  <Title v-else-if="folder">{{ folder.name }}</Title>
  <Title v-else>{{ route.params.bucket }}</Title>

  <AppMain :title="displayTitle" :description="description" :icon="icon">
    <template #actions>
      <FavoritesPicker v-if="showFavoritePicker" />
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

    <div class="flex items-center justify-between gap-4 text-xs text-[var(--dam-muted)]">
      <span>
        {{ safeFiles.length }} {{ safeFiles.length === 1 ? "asset" : "assets" }} in this view
        <span v-if="activeFilters" class="ml-2 text-primary-500">Filters applied</span>
      </span>
      <span class="hidden sm:inline">Double-click to preview · Right-click for DAM + RAG actions</span>
    </div>
    <DropFiles v-if="!endpoint && canUpload" @dropped="onFilesDropped" />
    <AppView :name="view" v-slot="{ dir }" :loading="loading">
      <File
        v-for="(file, index) in safeFiles"
        :key="index"
        :dir="dir"
        :file="file"
        :allow-deleted-selection="isTrash"
        @select="toggleSelected"
        @open="onOpen(file, index)"
        @delete="refresh"
        :selected="selected.includes(file.id)"
      />
    </AppView>
    <div
      v-if="!loading && error"
      class="flex min-h-48 flex-col items-center justify-center gap-3 border border-red-300/50 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950/20"
    >
      <Icon name="lucide:triangle-alert" class="size-10 text-red-500" />
      <div>
        <p class="font-medium">Files could not be loaded</p>
        <p class="mt-1 text-sm text-neutral-500">{{ error }}</p>
      </div>
      <UButton size="sm" variant="soft" icon="lucide:refresh-cw" label="Try again" @click="refresh" />
    </div>
    <div
      v-else-if="!loading && safeFiles.length === 0"
      class="flex min-h-[42vh] flex-col items-center justify-center border border-[var(--dam-line)] bg-[var(--dam-panel)] p-8"
    >
      <Icon :name="icon || 'lucide:hard-drive'" class="mb-3 size-12 text-[var(--dam-muted)] *:stroke-[1px]" />
      <div class="text-lg font-medium">{{ emptyTitle || "No assets found" }}</div>
      <p class="mt-1 max-w-lg text-center text-sm text-[var(--dam-muted)]">{{ emptyDescription || "Upload a file or adjust your filters to populate this workspace." }}</p>
    </div>
    <UButton
      v-if="!isEnd && !loading"
      @click="loadMore"
      class="mx-auto max-w-48"
    >
      Load more
    </UButton>
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
      <div v-show="actionsOpen" class="fixed inset-0 z-[9998]">
        <div class="fixed inset-0 bg-slate-950/40 backdrop-blur-xs" @click="closeActions" />

        <div
          id="asset-actions-panel"
          ref="assetControlsPanel"
          class="asset-controls-panel fixed top-16 right-4 sm:right-6 z-[9999] w-[min(30rem,calc(100vw-2rem))] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-100 shadow-2xl"
          role="dialog"
          aria-label="Asset controls"
          data-testid="asset-actions-panel"
        >
          <div class="asset-controls-header sticky -top-4 z-10 -mx-4 -mt-4 mb-3 flex items-start justify-between gap-4 border-b border-slate-700 bg-slate-900/95 px-4 py-4 backdrop-blur-md">
            <div>
              <p class="dam-kicker">Asset controls</p>
              <p class="mt-1 text-xs text-slate-400">Upload, create, organize, and change the current view.</p>
            </div>
            <UButton icon="lucide:x" color="neutral" variant="ghost" size="xs" aria-label="Close asset actions" @click="closeActions" />
          </div>

          <div v-if="!endpoint && (canUpload || canCreateFolder)" class="asset-controls-section min-w-0 rounded-xl p-3">
            <p class="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Add assets</p>
            <div class="grid min-w-0 grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Upload ref="uploadRef" v-if="canUpload" @success="refresh" />
              <NewFile v-if="canCreateFolder" />
            </div>
            <GoogleDriveLinkImport v-if="canUpload" @success="refresh" />
          </div>

          <div class="mt-3 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
            <div class="asset-controls-section min-w-0 rounded-xl p-3">
              <p class="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Sort</p>
              <SortFiles @update="onSort" />
            </div>
            <div class="asset-controls-section min-w-0 rounded-xl p-3">
              <p class="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Refine</p>
              <Filter @update="applyFilters" />
            </div>
          </div>

          <div class="asset-controls-section mt-3 rounded-xl p-3">
            <p class="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">View</p>
            <ToggleButton :model-value="view" @update:model-value="setView" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
<style>
.asset-controls-panel {
  isolation: isolate;
  border: 1px solid var(--dam-line-strong, #334155);
  background: var(--dam-panel-solid, #0f172a) !important;
  color: var(--dam-ink, #f8fafc) !important;
  opacity: 1 !important;
  box-shadow: 0 28px 70px rgba(2, 8, 23, 0.38), 0 0 0 1px rgba(255, 255, 255, 0.025);
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.asset-controls-header {
  background: color-mix(in srgb, var(--dam-panel-solid, #0f172a) 96%, transparent);
  backdrop-filter: blur(14px);
}

.asset-controls-section {
  border: 1px solid var(--dam-line, #334155);
  background: var(--dam-panel-raised, #1e293b);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.035);
}

.library-overview {
  --feature-rgb: 53 120 246;
  background:
    radial-gradient(circle at 92% 12%, rgb(var(--feature-rgb) / 0.16), transparent 15rem),
    linear-gradient(135deg, rgb(var(--feature-rgb) / 0.08), transparent 52%),
    var(--dam-panel-solid);
}

.library-overview::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  content: "";
  background: rgb(var(--feature-rgb));
}

.library-overview[data-feature="favorites"] { --feature-rgb: 53 120 246; }
.library-overview[data-feature="shared"] { --feature-rgb: 139 92 246; }
.library-overview[data-feature="published"] { --feature-rgb: 16 185 129; }
.library-overview[data-feature="trash"] { --feature-rgb: 239 68 68; }
</style>
