<script setup lang="ts">
import { ref } from "vue";
import { chooseDirectory, type DirectoryUploadSelection } from "~~/shared/utils/directory-upload";
import { getUploadDirectoryPaths } from "~~/shared/utils/folder-upload-target";

const emit = defineEmits<{
  dropped: [File[] | DirectoryUploadSelection];
  error: [string];
}>();

const dropZoneRef = ref<HTMLDivElement>();
const fileInputRef = ref<HTMLInputElement>();
const folderInputRef = ref<HTMLInputElement>();
const isOverDropZone = ref(false);

const readEntry = async (entry: any, path: string = ""): Promise<File[]> => {
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file((file: File) => {
        (file as any).customPath = path + file.name;
        resolve([file]);
      });
    });
  } else if (entry.isDirectory) {
    const dirReader = entry.createReader();
    const entries = await new Promise<any[]>((resolve) => {
      // Some browsers require multiple readEntries calls to get all files
      const results: any[] = [];
      const read = () => {
        dirReader.readEntries((res: any[]) => {
          if (res.length === 0) resolve(results);
          else {
            results.push(...res);
            read();
          }
        });
      };
      read();
    });
    let files: File[] = [];
    for (const subEntry of entries) {
      const subFiles = await readEntry(subEntry, path + entry.name + "/");
      files = files.concat(subFiles);
    }
    return files;
  }
  return [];
};

const onDrop = async (e: DragEvent) => {
  e.preventDefault();
  isOverDropZone.value = false;
  if (!e.dataTransfer) return;

  const items = e.dataTransfer.items;
  let allFiles: File[] = [];
  let hasDirectory = false;

  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          if (entry.isDirectory) hasDirectory = true;
          const files = await readEntry(entry);
          allFiles = allFiles.concat(files);
        } else {
          const file = item.getAsFile();
          if (file) allFiles.push(file);
        }
      }
    }
  } else {
    allFiles = Array.from(e.dataTransfer.files);
  }

  if (allFiles.length === 0) return;

  if (hasDirectory) {
    // Build full directory manifest from customPath so folder tree gets created
    const selection: DirectoryUploadSelection = {
      files: allFiles,
      directories: getUploadDirectoryPaths(
        allFiles.map((f) => (f as any).customPath || f.webkitRelativePath || f.name)
      ),
    };
    emit("dropped", selection);
  } else {
    emit("dropped", allFiles);
  }
};


const onDragOver = (e: DragEvent) => {
  e.preventDefault();
  isOverDropZone.value = true;
};

const onDragLeave = (e: DragEvent) => {
  e.preventDefault();
  isOverDropZone.value = false;
};

const handleFileClick = () => {
  fileInputRef.value?.click();
};

const handleFolderClick = async () => {
  const pickerWindow = window as typeof window & {
    showDirectoryPicker?: () => Promise<any>;
  };
  if (!pickerWindow.showDirectoryPicker) {
    folderInputRef.value?.click();
    return;
  }

  try {
    const selection = await chooseDirectory({
      showDirectoryPicker: pickerWindow.showDirectoryPicker.bind(pickerWindow),
    });
    if (selection) emit("dropped", selection);
  } catch (error: any) {
    emit("error", error?.message || "The folder could not be read.");
  }
};

const handleFileSelect = (event: Event) => {
  const files = (event.target as HTMLInputElement).files;
  if (files && files.length > 0) {
    const selectedFiles = Array.from(files);
    if (event.target === folderInputRef.value) {
      emit("dropped", {
        files: selectedFiles,
        directories: getUploadDirectoryPaths(selectedFiles.map(file => file.webkitRelativePath || file.name)),
      });
    } else {
      emit("dropped", selectedFiles);
    }
    (event.target as HTMLInputElement).value = "";
  }
};
</script>

<template>
  <div
    ref="dropZoneRef"
    @dragover="onDragOver"
    @dragenter="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    :class="[
      'dam-dropzone group relative flex min-h-40 w-full select-none flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-dashed px-5 py-8 transition-all duration-300',
      isOverDropZone
        ? 'scale-[0.995] border-primary-500 bg-primary-500/10 ring-4 ring-primary-500/10'
        : 'border-[var(--dam-line)] bg-[var(--dam-panel)]/75 hover:border-primary-500/60 hover:bg-primary-500/[0.04]',
    ]"
  >
    <input
      ref="fileInputRef"
      type="file"
      multiple
      class="hidden"
      @change="handleFileSelect"
    />
    <input
      ref="folderInputRef"
      type="file"
      webkitdirectory
      multiple
      class="hidden"
      @change="handleFileSelect"
    />
    
    <div
      :class="[
        'relative z-10 flex size-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] text-[var(--dam-muted)] shadow-[var(--dam-shadow-soft)] transition-all duration-300 group-hover:-translate-y-1 group-hover:text-primary-500',
        isOverDropZone && 'scale-110 bg-primary-500 text-white border-primary-500 shadow-lg shadow-primary-500/10',
      ]"
    >
      <Icon name="lucide:upload-cloud" class="size-7" />
    </div>

    <div class="relative z-10 text-center">
      <p class="text-sm font-semibold text-[var(--dam-ink)]">
        Drag &amp; drop files or folders
      </p>
      <p class="mt-1 text-xs text-[var(--dam-muted)]">
        or browse from your device · ZIP archives supported
      </p>
    </div>
    <div class="relative z-10 flex flex-wrap items-center justify-center gap-2" @click.stop>
      <button
        type="button"
        class="dam-kicker rounded-full border border-primary-500/25 bg-primary-500/10 px-3 py-1 text-primary-500 transition-colors hover:bg-primary-500/20"
        @click="handleFileClick"
      >
        Upload files
      </button>
      <button
        type="button"
        class="dam-kicker rounded-full border border-primary-500 bg-primary-500 px-3 py-1 text-white transition-colors hover:bg-primary-600"
        @click="handleFolderClick"
      >
        Upload folder
      </button>
    </div>
  </div>
</template>
