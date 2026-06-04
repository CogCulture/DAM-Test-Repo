<script setup lang="ts">
defineProps<{
  file: IFile;
}>();
</script>
<template>
  <div class="flex flex-col items-start justify-start gap-4 h-full p-6">
    <div>
      <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase">
        File Path
      </div>
      <div class="text-neutral-700 dark:text-neutral-200 font-light break-all">
        {{ file?.path }}
      </div>
    </div>
    <div>
      <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase">
        File Size
      </div>
      <div class="text-neutral-700 dark:text-neutral-200 font-light">
        {{ formatBytes(file?.size ?? 0) }}
      </div>
    </div>
    <div>
      <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase">Type</div>
      <div class="text-neutral-700 dark:text-neutral-200 font-light">{{ file?.type }}</div>
    </div>
    <div>
      <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase">
        Content Type
      </div>
      <div class="text-neutral-700 dark:text-neutral-200 font-light">
        {{ file?.contentType }}
      </div>
    </div>
    <div>
      <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase">
        Visibility
      </div>
      <div class="text-neutral-700 dark:text-neutral-200 font-light">
        {{ file?.visibility }}
      </div>
    </div>
    <div>
      <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase">
        Added On
      </div>
      <div class="text-neutral-700 dark:text-neutral-200 font-light">
        {{ file?.createdAt }}
      </div>
    </div>
    <div v-if="file?.updatedAt !== file?.createdAt">
      <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase">
        Modified On
      </div>
      <div class="text-neutral-700 dark:text-neutral-200 font-light">
        {{ file?.updatedAt }}
      </div>
    </div>
  </div>
</template>
