<script setup lang="ts">
import { ref, computed } from "vue";

definePageMeta({ layout: "guest" });

export interface DriveItem {
  id: string;
  name: string;
  type: "folder" | "file";
  mimeType?: string;
  size?: number | null;
  createdTime?: string;
}

const router = useRouter();
const searchQ = ref("");
const selectedItems = ref<DriveItem[]>([]);
const submitting = ref(false);

const { data: driveItems, error, pending } = await useFetch<DriveItem[]>("/api/gdrive/list-folders");

const filteredItems = computed(() => {
  if (!driveItems.value) return [];
  if (!searchQ.value.trim()) return driveItems.value;
  return driveItems.value.filter((item) =>
    item.name.toLowerCase().includes(searchQ.value.toLowerCase())
  );
});

const isAllSelected = computed(() => {
  if (!filteredItems.value.length) return false;
  return filteredItems.value.every((item) =>
    selectedItems.value.some((s) => s.id === item.id)
  );
});

const isSomeSelected = computed(() => {
  if (!filteredItems.value.length) return false;
  return (
    !isAllSelected.value &&
    filteredItems.value.some((item) =>
      selectedItems.value.some((s) => s.id === item.id)
    )
  );
});

const isSelected = (id: string) => {
  return selectedItems.value.some((item) => item.id === id);
};

const toggleSelect = (item: DriveItem) => {
  const index = selectedItems.value.findIndex((s) => s.id === item.id);
  if (index > -1) {
    selectedItems.value.splice(index, 1);
  } else {
    selectedItems.value.push(item);
  }
};

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    const currentIds = new Set(filteredItems.value.map((i) => i.id));
    selectedItems.value = selectedItems.value.filter((item) => !currentIds.has(item.id));
  } else {
    const existingIds = new Set(selectedItems.value.map((i) => i.id));
    for (const item of filteredItems.value) {
      if (!existingIds.has(item.id)) {
        selectedItems.value.push(item);
      }
    }
  }
};

const getItemIcon = (item: DriveItem) => {
  if (item.type === "folder") return "lucide:folder";
  const name = item.name.toLowerCase();
  const mime = item.mimeType || "";
  if (mime.includes("image") || /\.(png|jpg|jpeg|gif|webp|svg)$/.test(name)) return "lucide:image";
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "lucide:file-text";
  if (mime.includes("spreadsheet") || /\.(xls|xlsx|csv)$/.test(name)) return "lucide:sheet";
  if (mime.includes("presentation") || /\.(ppt|pptx)$/.test(name)) return "lucide:presentation";
  if (mime.includes("word") || /\.(doc|docx)$/.test(name)) return "lucide:file-type-2";
  if (mime.includes("video") || /\.(mp4|mkv|mov|avi)$/.test(name)) return "lucide:video";
  if (mime.includes("audio") || /\.(mp3|wav|ogg)$/.test(name)) return "lucide:music";
  if (mime.includes("zip") || name.endsWith(".zip")) return "lucide:archive";
  return "lucide:file";
};

const formatSize = (bytes?: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const submitRequest = async () => {
  if (!selectedItems.value.length) return;
  submitting.value = true;

  try {
    await $fetch("/api/gdrive/select-folder", {
      method: "POST",
      body: {
        items: selectedItems.value.map((i) => ({
          id: i.id,
          name: i.name,
          type: i.type,
        })),
      },
    });
    router.push("/gdrive/pending");
  } catch (err) {
    console.error("Failed to submit Drive selection:", err);
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 px-4 py-8">
    <div class="w-full max-w-xl">
      <Logo class="mx-auto mb-8" />

      <div class="bg-neutral-900/80 backdrop-blur-md border border-neutral-800 rounded-3xl p-8 shadow-2xl space-y-6">
        <div class="text-center">
          <h1 class="text-2xl font-bold text-white">Import Google Drive Contents</h1>
          <p class="text-neutral-400 text-sm mt-2">
            Select one, multiple, or all files and folders to move into the DAM workspace.
          </p>
        </div>

        <UAlert
          v-if="error"
          title="Connection Error"
          description="Failed to load items from your Google Drive. Please try signing in again."
          color="error"
          variant="soft"
          icon="lucide:alert-circle"
        />

        <div class="space-y-4">
          <!-- Search & Select All Bar -->
          <div class="flex items-center gap-3">
            <UInput
              v-model="searchQ"
              icon="lucide:search"
              placeholder="Search files & folders..."
              class="grow"
              size="md"
            />
            <UButton
              color="neutral"
              variant="outline"
              size="md"
              :icon="isAllSelected ? 'lucide:check-square' : isSomeSelected ? 'lucide:minus-square' : 'lucide:square'"
              :disabled="!filteredItems.length"
              @click="toggleSelectAll"
            >
              {{ isAllSelected ? "Deselect All" : "Select All" }}
            </UButton>
          </div>

          <!-- Selection status bar -->
          <div v-if="selectedItems.length > 0" class="flex items-center justify-between px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs font-semibold text-indigo-300">
            <span class="flex items-center gap-2">
              <UIcon name="lucide:check-circle-2" class="size-4 text-indigo-400" />
              {{ selectedItems.length }} item{{ selectedItems.length === 1 ? '' : 's' }} selected
            </span>
            <button type="button" class="text-neutral-400 hover:text-white transition" @click="selectedItems = []">
              Clear All
            </button>
          </div>

          <!-- Items list -->
          <div class="border border-neutral-800 rounded-2xl bg-neutral-950 max-h-72 overflow-y-auto divide-y divide-neutral-900 custom-scrollbar">
            <div v-if="pending" class="p-8 flex justify-center items-center">
              <UIcon name="lucide:loader-2" class="w-6 h-6 animate-spin text-primary-500" />
            </div>

            <div
              v-else-if="filteredItems.length === 0"
              class="p-8 text-center text-neutral-500 text-sm italic"
            >
              No files or folders found.
            </div>

            <div
              v-for="item in filteredItems"
              :key="item.id"
              @click="toggleSelect(item)"
              :class="[
                'flex items-center gap-3.5 p-3.5 cursor-pointer transition-all duration-150 select-none',
                isSelected(item.id)
                  ? 'bg-primary-500/15 border-l-4 border-primary-500 text-white'
                  : 'hover:bg-neutral-900/60 text-neutral-400 hover:text-neutral-200'
              ]"
            >
              <!-- Checkbox -->
              <div
                :class="[
                  'size-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
                  isSelected(item.id)
                    ? 'bg-primary-500 border-primary-500 text-white'
                    : 'border-neutral-700 bg-neutral-900'
                ]"
              >
                <UIcon v-if="isSelected(item.id)" name="lucide:check" class="size-3.5 stroke-[3]" />
              </div>

              <!-- Item type icon -->
              <UIcon
                :name="getItemIcon(item)"
                class="text-xl shrink-0"
                :class="item.type === 'folder' ? 'text-amber-400' : isSelected(item.id) ? 'text-primary-400' : 'text-neutral-500'"
              />

              <!-- Name & Details -->
              <div class="grow min-w-0 truncate">
                <div class="flex items-center gap-2">
                  <p class="font-medium text-sm truncate">{{ item.name }}</p>
                  <span
                    class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0"
                    :class="item.type === 'folder' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'"
                  >
                    {{ item.type }}
                  </span>
                </div>
                <p class="text-[11px] text-neutral-500 font-mono truncate mt-0.5">
                  ID: {{ item.id }} <span v-if="item.size">· {{ formatSize(item.size) }}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="flex gap-4 pt-2">
          <UButton
            variant="ghost"
            color="neutral"
            class="flex-1 justify-center"
            @click="router.push('/auth/signin')"
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            class="flex-1 justify-center"
            :disabled="!selectedItems.length"
            :loading="submitting"
            icon="lucide:upload-cloud"
            @click="submitRequest"
          >
            {{ selectedItems.length > 0 ? `Move ${selectedItems.length} Item${selectedItems.length === 1 ? '' : 's'} to DAM` : 'Select Items to Move' }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #262626;
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #404040;
}
</style>
