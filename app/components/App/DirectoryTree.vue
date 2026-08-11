<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { useAside } from "~/composables/useAside";
import { useRole } from "~/composables/useRole";
import { replaceDirectoryBranch, sortDirectoryChildren } from "~~/shared/utils/folder-upload-target";

const route = useRoute();
const { orgType } = useRole();
const bucketName = computed(() => (route.params.bucket as string) || "org");
const storageLabel = computed(() => orgType.value === "gdrive" ? "Organization Google Drive" : "Local development storage");

// We only show the tree if we have a bucket
const isVisible = computed(() => !!route.params.bucket);

const files = ref<any[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const page = ref(1);
const hasNextPage = ref(false);

const fetchContents = async (reset = false) => {
  if (reset) {
    page.value = 1;
  }

  loading.value = true;
  loadError.value = null;
  try {
    const isGDrive = orgType.value === "gdrive" || (bucketName.value && bucketName.value.startsWith("gdrive_"));
    const url = isGDrive ? `/api/gdrive/list/root` : `/api/files/list/${bucketName.value}/root`;
    const data = await $fetch<any>(url, {
      query: {
        page: page.value,
        sortBy: 'name',
        order: 'asc',
        t: Date.now(),
      },
      timeout: 30000,
    });
    if (data && data.data) {
      if (reset) {
        files.value = replaceDirectoryBranch(files.value, data.data, true);
      } else {
        files.value = sortDirectoryChildren([...files.value, ...data.data]);
      }
      hasNextPage.value = !!data.nextPage;
    }
  } catch (err: any) {
    console.error("Error fetching root directory contents:", err);
    loadError.value = err?.data?.message || err?.message || "Directory could not be loaded.";
  } finally {
    loading.value = false;
  }
};

const loadMore = () => {
  page.value++;
  fetchContents();
};

const refreshTrigger = useState("files-refresh-trigger", () => 0);

watch(refreshTrigger, () => {
  fetchContents(true);
});

watch(bucketName, (newVal, oldVal) => {
  if (newVal && newVal !== oldVal) {
    fetchContents(true);
  }
});

onMounted(() => {
  fetchContents(true);
});
const { aside } = useAside();
const sidebarRef = ref<HTMLElement | null>(null);
const sidebarWidth = useState<number>("dam-sidebar-width", () => 272);
const libraryHeight = useState<number>("dam-sidebar-library-height", () => 342);
const storageHeight = useState<number>("dam-sidebar-storage-height", () => 60);
const libraryOpen = useState<boolean>("dam-sidebar-library-open", () => true);
const foldersOpen = useState<boolean>("dam-sidebar-folders-open", () => true);
const storageOpen = useState<boolean>("dam-sidebar-storage-open", () => true);
const SIDEBAR_PREFERENCES_KEY = "dam-sidebar-preferences";
const clampSidebarWidth = (value: number) => Math.min(440, Math.max(232, value));
type SidebarSegment = "library" | "storage";
const resizingSegment = ref<SidebarSegment | null>(null);
const segmentResizeStart = reactive({ y: 0, height: 0 });
const clampLibraryHeight = (value: number) => {
  const availableHeight = sidebarRef.value?.clientHeight || 760;
  return Math.min(Math.max(150, availableHeight - 220), Math.max(96, value));
};
const clampStorageHeight = (value: number) => Math.min(160, Math.max(56, value));

const stopSidebarResize = () => {
  if (!import.meta.client) return;
  document.removeEventListener("pointermove", resizeSidebar);
  document.removeEventListener("pointerup", stopSidebarResize);
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
};
const resizeSidebar = (event: PointerEvent) => {
  sidebarWidth.value = clampSidebarWidth(event.clientX);
};
const startSidebarResize = (event: PointerEvent) => {
  event.preventDefault();
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  document.addEventListener("pointermove", resizeSidebar);
  document.addEventListener("pointerup", stopSidebarResize);
};
const resetSidebarWidth = () => {
  sidebarWidth.value = 272;
};

const resizeSegment = (event: PointerEvent) => {
  const delta = event.clientY - segmentResizeStart.y;
  if (resizingSegment.value === "library") {
    libraryHeight.value = clampLibraryHeight(segmentResizeStart.height + delta);
  } else if (resizingSegment.value === "storage") {
    storageHeight.value = clampStorageHeight(segmentResizeStart.height - delta);
  }
};
const stopSegmentResize = () => {
  if (!import.meta.client) return;
  resizingSegment.value = null;
  document.removeEventListener("pointermove", resizeSegment);
  document.removeEventListener("pointerup", stopSegmentResize);
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
};
const startSegmentResize = (segment: SidebarSegment, event: PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
  resizingSegment.value = segment;
  segmentResizeStart.y = event.clientY;
  segmentResizeStart.height = segment === "library" ? libraryHeight.value : storageHeight.value;
  document.body.style.cursor = "row-resize";
  document.body.style.userSelect = "none";
  document.addEventListener("pointermove", resizeSegment);
  document.addEventListener("pointerup", stopSegmentResize);
};
const resetSegmentHeight = (segment: SidebarSegment) => {
  if (segment === "library") {
    libraryHeight.value = 342;
  } else {
    storageHeight.value = 60;
  }
};

onMounted(() => {
  const stored = localStorage.getItem(SIDEBAR_PREFERENCES_KEY);
  if (!stored) return;
  try {
    const preferences = JSON.parse(stored);
    sidebarWidth.value = clampSidebarWidth(Number(preferences.width) || 272);
    libraryHeight.value = clampLibraryHeight(Number(preferences.libraryHeight) || 342);
    storageHeight.value = clampStorageHeight(Number(preferences.storageHeight) || 60);
    libraryOpen.value = preferences.libraryOpen ?? true;
    foldersOpen.value = preferences.foldersOpen ?? true;
    storageOpen.value = preferences.storageOpen ?? true;
  } catch {
    localStorage.removeItem(SIDEBAR_PREFERENCES_KEY);
  }
});

const persistSidebarPreferences = useDebounceFn(() => {
  if (!import.meta.client) return;
  localStorage.setItem(SIDEBAR_PREFERENCES_KEY, JSON.stringify({
    width: sidebarWidth.value,
    libraryHeight: libraryHeight.value,
    storageHeight: storageHeight.value,
    libraryOpen: libraryOpen.value,
    foldersOpen: foldersOpen.value,
    storageOpen: storageOpen.value,
  }));
}, 120);

watch([sidebarWidth, libraryHeight, storageHeight, libraryOpen, foldersOpen, storageOpen], persistSidebarPreferences);

onBeforeUnmount(() => {
  stopSidebarResize();
  stopSegmentResize();
});
const libraryLinks = computed(() => [
  { label: "All assets", icon: "lucide:layout-grid", to: `/${bucketName.value}` },
  { label: "Recent", icon: "lucide:clock-3", to: `/${bucketName.value}/recent` },
  { label: "Favorites", icon: "lucide:star", to: `/${bucketName.value}/favorites` },
  { label: "Shared", icon: "lucide:users", to: `/${bucketName.value}/shared` },
  { label: "Published", icon: "lucide:globe-2", to: `/${bucketName.value}/published` },
  { label: "Trash", icon: "lucide:trash-2", to: `/${bucketName.value}/trash` },
]);
const isLibraryLinkActive = (to: string) => route.path === to;
</script>

<template>
  <aside
    v-if="isVisible"
    ref="sidebarRef"
    :class="[
      'dam-glass dam-workspace-sidebar fixed bottom-0 left-0 top-0 z-10 hidden flex-col border-r border-[var(--dam-line)] pb-8 shadow-[var(--dam-shadow-soft)] sm:flex',
      aside ? 'pt-48' : 'pt-36'
    ]"
    :style="{ width: `${sidebarWidth}px` }"
  >
    <section
      class="flex shrink-0 flex-col overflow-hidden border-b border-[var(--dam-line)] p-3"
      :style="libraryOpen ? { height: `${libraryHeight}px` } : undefined"
    >
      <button type="button" :class="['flex w-full items-center justify-between rounded-lg px-2 py-1 text-left hover:bg-[var(--dam-panel-raised)]', libraryOpen && 'mb-2']" aria-controls="dam-library-section" :aria-expanded="libraryOpen" @click="libraryOpen = !libraryOpen">
        <span class="dam-kicker">Library</span>
        <span class="flex items-center gap-1.5 text-primary-500"><UIcon name="lucide:library-big" class="size-3.5" /><UIcon :name="libraryOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="size-3.5" /></span>
      </button>
      <nav v-show="libraryOpen" id="dam-library-section" class="grid min-h-0 grow grid-cols-1 content-start gap-1 overflow-y-auto pr-1">
        <NuxtLink
          v-for="link in libraryLinks"
          :key="link.label"
          :to="link.to"
          :class="[
            'group flex min-w-0 items-center gap-3 rounded-xl border px-2.5 py-2.5 text-left text-sm font-medium transition duration-200 hover:translate-x-0.5 hover:border-[var(--dam-line)] hover:bg-[var(--dam-panel-raised)] hover:text-[var(--dam-ink)]',
            isLibraryLinkActive(link.to)
              ? 'border-primary-500/35 bg-primary-500/10 text-primary-500'
              : 'border-transparent text-[var(--dam-muted)]',
          ]"
          :aria-current="isLibraryLinkActive(link.to) ? 'page' : undefined"
        >
          <span :class="['flex size-7 shrink-0 items-center justify-center rounded-lg transition', isLibraryLinkActive(link.to) ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'bg-[var(--dam-panel-raised)] text-[var(--dam-muted)] group-hover:text-primary-500']"><UIcon :name="link.icon" class="size-3.5" /></span>
          <span class="truncate">{{ link.label }}</span>
        </NuxtLink>
      </nav>
    </section>

    <button
      v-if="libraryOpen"
      type="button"
      :class="[
        'group relative h-2 shrink-0 cursor-row-resize touch-none border-0 bg-transparent',
        resizingSegment === 'library' && 'bg-primary-500/10',
      ]"
      aria-label="Resize Library and Folders sections"
      title="Drag to resize Library - Double-click to reset"
      @pointerdown="startSegmentResize('library', $event)"
      @dblclick="resetSegmentHeight('library')"
    >
      <span :class="['absolute inset-x-3 top-1/2 h-px -translate-y-1/2 transition-colors', resizingSegment === 'library' ? 'bg-primary-500' : 'bg-transparent group-hover:bg-primary-500 group-focus-visible:bg-primary-500']" />
      <span class="absolute left-1/2 top-1/2 flex h-3.5 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-[var(--dam-panel-solid)] opacity-0 shadow-sm transition group-hover:border-primary-500/40 group-hover:opacity-100 group-focus-visible:opacity-100">
        <UIcon name="lucide:grip-horizontal" class="size-3 text-primary-500" />
      </span>
    </button>

    <section :class="['flex min-h-0 flex-col overflow-hidden', foldersOpen ? 'grow' : 'shrink-0']">
      <div class="flex items-center justify-between border-b border-[var(--dam-line)] px-3 py-3">
        <button type="button" class="flex min-w-0 grow items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-[var(--dam-panel-raised)]" aria-controls="dam-folders-section" :aria-expanded="foldersOpen" @click="foldersOpen = !foldersOpen">
          <UIcon :name="foldersOpen ? 'lucide:chevron-down' : 'lucide:chevron-right'" class="size-3.5 shrink-0 text-[var(--dam-muted)]" />
          <span><span class="dam-kicker block">Folders</span><span class="mt-1 block text-xs text-[var(--dam-muted)]">Browse your workspace</span></span>
        </button>
        <NewFile compact size="xs" parentId="root" @click.stop />
      </div>

      <div v-show="foldersOpen" id="dam-folders-section" class="min-h-0 grow overflow-y-auto p-2">
        <AppDirectoryNode
          v-for="file in files"
          :key="file.id"
          :file="file"
          :bucket-name="bucketName"
          :level="0"
        />
        <div v-if="loading" class="flex justify-center py-4">
          <UIcon name="lucide:loader-2" class="size-4 animate-spin text-[var(--dam-muted)]" />
        </div>
        <div v-else-if="loadError" class="space-y-2 px-2 py-4 text-center">
          <p class="text-xs text-red-500">{{ loadError }}</p>
          <UButton size="2xs" variant="soft" icon="lucide:refresh-cw" label="Retry" @click="fetchContents(true)" />
        </div>
        <div v-else-if="hasNextPage" class="px-4 py-2">
          <UButton variant="ghost" size="2xs" color="neutral" class="w-full justify-center text-xs font-medium" @click="loadMore">Load more...</UButton>
        </div>
        <div v-else-if="files.length === 0" class="rounded-xl border border-dashed border-[var(--dam-line)] px-3 py-6 text-center">
          <UIcon name="lucide:folder-open" class="mx-auto mb-2 size-5 text-[var(--dam-muted)]" />
          <div class="text-xs text-[var(--dam-muted)]">No folders yet</div>
        </div>
      </div>
    </section>

    <button
      v-if="storageOpen"
      type="button"
      :class="[
        'group relative h-2 shrink-0 cursor-row-resize touch-none border-0 bg-transparent',
        resizingSegment === 'storage' && 'bg-primary-500/10',
      ]"
      aria-label="Resize Folders and Storage sections"
      title="Drag to resize Storage - Double-click to reset"
      @pointerdown="startSegmentResize('storage', $event)"
      @dblclick="resetSegmentHeight('storage')"
    >
      <span :class="['absolute inset-x-3 top-1/2 h-px -translate-y-1/2 transition-colors', resizingSegment === 'storage' ? 'bg-primary-500' : 'bg-transparent group-hover:bg-primary-500 group-focus-visible:bg-primary-500']" />
      <span class="absolute left-1/2 top-1/2 flex h-3.5 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-[var(--dam-panel-solid)] opacity-0 shadow-sm transition group-hover:border-primary-500/40 group-hover:opacity-100 group-focus-visible:opacity-100">
        <UIcon name="lucide:grip-horizontal" class="size-3 text-primary-500" />
      </span>
    </button>

    <section
      class="shrink-0 overflow-y-auto px-3 py-1.5"
      :style="storageOpen ? { height: `${storageHeight}px` } : undefined"
    >
      <div class="h-full min-h-11 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] shadow-[var(--dam-shadow-soft)]">
        <button type="button" class="flex h-full w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-[var(--dam-panel-hover)]" aria-controls="dam-storage-section" :aria-expanded="storageOpen" @click="storageOpen = !storageOpen">
          <span class="relative flex size-2"><span class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-50" /><span class="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>
          <span class="min-w-0 grow">
            <span class="block truncate text-xs font-semibold text-[var(--dam-ink)]">Storage ready</span>
            <span v-show="storageOpen" id="dam-storage-section" class="mt-0.5 block truncate text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--dam-muted)]">{{ storageLabel }}</span>
          </span>
          <UIcon :name="storageOpen ? 'lucide:chevron-down' : 'lucide:chevron-right'" class="size-3.5 text-[var(--dam-muted)]" />
        </button>
      </div>
    </section>
    <button
      type="button"
      class="group absolute bottom-0 right-0 top-0 w-2 cursor-col-resize touch-none border-0 bg-transparent"
      aria-label="Resize sidebar"
      title="Drag to resize - Double-click to reset"
      @pointerdown="startSidebarResize"
      @dblclick="resetSidebarWidth"
    >
      <span class="absolute bottom-0 right-0 top-0 w-px bg-transparent transition-colors group-hover:bg-primary-500 group-focus-visible:bg-primary-500" />
    </button>
  </aside>
</template>
