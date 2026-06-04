<script setup lang="ts">
import { ref } from "vue";
import { useDropZone } from "@vueuse/core";

const emit = defineEmits(["dropped"]);

const dropZoneRef = ref<HTMLDivElement>();
const fileInputRef = ref<HTMLInputElement>();

function onDrop(files: File[] | null) {
  if (files && files.length > 0) {
    emit("dropped", files);
  }
}

const { isOverDropZone } = useDropZone(dropZoneRef, {
  onDrop,
  multiple: true,
  preventDefaultForUnhandled: false,
});

const handleClick = () => {
  fileInputRef.value?.click();
};

const handleFileSelect = (event: Event) => {
  const files = (event.target as HTMLInputElement).files;
  if (files && files.length > 0) {
    emit("dropped", Array.from(files));
    // Reset file input so same file can be selected again
    (event.target as HTMLInputElement).value = "";
  }
};
</script>

<template>
  <div
    ref="dropZoneRef"
    @click="handleClick"
    :class="[
      'w-full py-8 px-6 rounded-2xl flex flex-col gap-3 items-center justify-center border-2 border-dashed transition-all duration-300 cursor-pointer select-none',
      isOverDropZone
        ? 'border-primary-500 bg-primary-50/30 dark:bg-primary-950/10 ring-4 ring-primary-500/10 scale-[0.99]'
        : 'border-neutral-200 dark:border-neutral-800 hover:border-primary-500/50 hover:bg-neutral-50/50 dark:hover:bg-neutral-900/30',
    ]"
  >
    <input
      ref="fileInputRef"
      type="file"
      multiple
      class="hidden"
      @change="handleFileSelect"
    />
    
    <div
      :class="[
        'p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900 text-neutral-500 border border-neutral-100 dark:border-neutral-800/80 transition-all duration-300 shadow-sm',
        isOverDropZone && 'scale-110 bg-primary-500 text-white border-primary-500 shadow-lg shadow-primary-500/10',
      ]"
    >
      <Icon name="lucide:upload-cloud" class="size-7" />
    </div>

    <div class="text-center space-y-1">
      <p class="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
        Drag & Drop Files Here
      </p>
      <p class="text-xs text-neutral-400 dark:text-neutral-500">
        or click to browse from your device
      </p>
    </div>
  </div>
</template>
