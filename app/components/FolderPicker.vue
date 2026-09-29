<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRole } from "~/composables/useRole";
import { isGoogleDriveAsset } from "~/utils/damModal";

const props = withDefaults(
  defineProps<{
    currentFile?: any;
    modelValue?: any;
  }>(),
  {
    currentFile: null,
    modelValue: null,
  }
);

const emit = defineEmits<{
  (e: "select", folder: { id: string; name: string; path?: string }): void;
  (e: "update:modelValue", folderId: string): void;
}>();

const route = useRoute();
const { orgType, isAdmin } = useRole();
const bucket = computed(() => (route.params.bucket as string) || "org");

const isGDrive = computed(() => {
  if (isGoogleDriveAsset(props.currentFile)) {
    return true;
  }
  if (
    props.currentFile?.storage === "local" ||
    props.currentFile?.storage === "s3" ||
    (props.currentFile?.bucketName && props.currentFile.bucketName !== "gdrive")
  ) {
    return false;
  }
  const routeBucket = (route.params.bucket as string) || "";
  if (routeBucket.startsWith("gdrive_")) {
    return true;
  }
  if (routeBucket && !routeBucket.startsWith("gdrive_")) {
    return false;
  }
  return orgType.value === "gdrive";
});

interface FolderItem {
  id: string;
  name: string;
  path: string;
  parentId?: string | null;
  children?: FolderItem[];
  type?: string;
}

const folders = ref<FolderItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const selectedFolderId = ref<string | null>(null);
const searchQuery = ref("");

const rootItem = computed<FolderItem>(() => ({
  id: "root",
  name: isGDrive.value ? "Organization Root (My Drive)" : "All Assets (Root)",
  path: "/",
  parentId: null,
}));

const loadFolders = async () => {
  loading.value = true;
  error.value = null;

  try {
    if (isGDrive.value) {
      try {
        const rootFolders = await $fetch<any[]>("/api/gdrive/upload-folders", {
          query: { parentId: "root" },
        });

        const items: FolderItem[] = (rootFolders || []).map((f) => ({
          id: f.id,
          name: f.name,
          path: f.path || f.name,
          parentId: "root",
        }));

        const childPromises = items.map(async (parent) => {
          try {
            const sub = await $fetch<any[]>("/api/gdrive/upload-folders", {
              query: { parentId: parent.id },
            });
            if (sub && sub.length) {
              parent.children = sub.map((s) => ({
                id: s.id,
                name: s.name,
                path: s.path || `${parent.name} / ${s.name}`,
                parentId: parent.id,
              }));
            }
          } catch {
            // ignore child fetch failures
          }
        });

        await Promise.all(childPromises);
        folders.value = items;
      } catch (gdriveErr: any) {
        console.warn("[FolderPicker] GDrive folder fetch failed, using local DAM folders:", gdriveErr);
        const data = await $fetch<any[]>(`/api/files/${encodeURIComponent(bucket.value)}/folders`);
        folders.value = data || [];
      }
    } else {
      // Fetch local DAM folders
      const data = await $fetch<any[]>(`/api/files/${encodeURIComponent(bucket.value)}/folders`);
      folders.value = data || [];
    }
  } catch (err: any) {
    console.error("[FolderPicker] Failed to load folders:", err);
    error.value = err?.data?.message || err?.message || "Failed to load destination folders.";
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.currentFile,
  () => {
    selectedFolderId.value = null;
    searchQuery.value = "";
    loadFolders();
  }
);

onMounted(() => {
  loadFolders();
});

const isFolderDisabled = (folder: FolderItem): boolean => {
  if (!props.currentFile) return false;
  // Cannot move into self
  if (folder.id === props.currentFile.id) return true;
  return false;
};

const handleSelect = (folder: FolderItem) => {
  if (isFolderDisabled(folder)) return;
  selectedFolderId.value = folder.id;
  emit("select", folder);
  emit("update:modelValue", folder.id);
};

// Flatten folders for searchable display
const flatFolderList = computed(() => {
  const result: FolderItem[] = [];

  // Always include root as first option
  result.push(rootItem.value);

  // Map to build hierarchical paths if flat
  const folderMap = new Map<string, FolderItem>();
  for (const f of folders.value) {
    folderMap.set(f.id, f);
  }

  const getFolderPath = (item: FolderItem): string => {
    if (item.path && item.path.includes("/")) return item.path;
    const parts: string[] = [item.name];
    let curr = item;
    let guard = 0;
    while (curr.parentId && curr.parentId !== "root" && guard < 10) {
      guard++;
      const parent = folderMap.get(curr.parentId);
      if (parent) {
        parts.unshift(parent.name);
        curr = parent;
      } else {
        break;
      }
    }
    return parts.join(" / ");
  };

  const hasNestedChildren = folders.value.some((f) => f.children && f.children.length > 0);

  if (hasNestedChildren) {
    const flatten = (items: FolderItem[], prefix = "") => {
      for (const item of items) {
        const name = item.name || (item as any).label || "Folder";
        const path = item.path || (prefix ? `${prefix} / ${name}` : name);
        result.push({
          ...item,
          name,
          path,
        });
        if (item.children && item.children.length) {
          flatten(item.children, path);
        }
      }
    };
    flatten(folders.value);
  } else {
    for (const item of folders.value) {
      result.push({
        ...item,
        name: item.name || "Folder",
        path: getFolderPath(item),
      });
    }
  }

  if (!searchQuery.value.trim()) return result;
  const q = searchQuery.value.toLowerCase().trim();
  return result.filter(
    (f) =>
      (f.name || "").toLowerCase().includes(q) ||
      (f.path || "").toLowerCase().includes(q)
  );
});
</script>

<template>
  <div class="flex flex-col gap-2 w-full">
    <!-- Search Bar -->
    <div class="relative">
      <UIcon
        name="lucide:search"
        class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--dam-muted)]"
      />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Filter destination folders..."
        class="w-full rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel)] py-2 pl-9 pr-3 text-xs text-[var(--dam-ink)] placeholder-[var(--dam-muted)] focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-8 text-xs text-[var(--dam-muted)] gap-2">
      <UIcon name="lucide:loader-2" class="size-4 animate-spin text-primary-500" />
      <span>Loading folders...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="p-3 text-xs text-red-500 bg-red-500/10 rounded-xl border border-red-500/20 flex items-center justify-between gap-2">
      <span class="truncate">{{ error }}</span>
      <button type="button" class="underline shrink-0 hover:text-red-700 font-semibold" @click="loadFolders">Retry</button>
    </div>

    <!-- Folder List -->
    <div
      v-else
      class="max-h-60 overflow-y-auto divide-y divide-[var(--dam-line)] rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)]"
    >
      <div
        v-for="folder in flatFolderList"
        :key="folder.id"
        :class="[
          'flex items-center justify-between px-3 py-2 text-xs transition cursor-pointer',
          selectedFolderId === folder.id
            ? 'bg-primary-500/15 text-primary-600 dark:text-primary-400 font-semibold'
            : 'hover:bg-[var(--dam-panel-hover)] text-[var(--dam-ink)]',
          isFolderDisabled(folder) && 'opacity-40 cursor-not-allowed pointer-events-none',
        ]"
        @click="handleSelect(folder)"
      >
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <UIcon
            :name="folder.id === 'root' ? (isGDrive ? 'logos:google-drive' : 'lucide:hard-drive') : 'lucide:folder'"
            :class="[
              'size-4 shrink-0',
              folder.id === 'root' ? '' : selectedFolderId === folder.id ? 'text-primary-500' : 'text-amber-500',
            ]"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">{{ folder.name }}</p>
            <p
              v-if="folder.path && folder.id !== 'root' && folder.path !== folder.name"
              class="truncate text-[10px] text-[var(--dam-muted)]"
            >
              {{ folder.path }}
            </p>
          </div>
          <span
            v-if="props.currentFile?.id === folder.id"
            class="ml-2 text-[10px] text-[var(--dam-muted)] font-normal italic shrink-0"
          >
            (Current item)
          </span>
        </div>

        <UIcon
          v-if="selectedFolderId === folder.id"
          name="lucide:check-circle-2"
          class="size-4 shrink-0 text-primary-500"
        />
      </div>

      <div
        v-if="flatFolderList.length === 0"
        class="py-6 text-center text-xs text-[var(--dam-muted)]"
      >
        No folders match your search.
      </div>
    </div>
  </div>
</template>
