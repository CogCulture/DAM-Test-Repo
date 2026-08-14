<script setup lang="ts">
import { useFile } from "~/composables/useFile";
const { file, loading } = useFile();
</script>
<template>
  <Title v-if="file">{{ file.name }}</Title>
  <AppMain v-if="file" :title="file.name">
    <div class="flex flex-row h-screen">
      <div class="h-full w-full flex justify-center items-center">
        <div
          :class="[
            'relative w-full h-full',
            file?.type === 'folder' && 'size-96',
          ]"
        >
          <Thumbnail v-if="file" :file="file!" layout="col" />
        </div>
      </div>
      <div
        class="min-w-96 w-96 border-l border-neutral-200/70 h-screen bg-white dark:bg-neutral-900 flex flex-col"
      >
        <div class="grow w-full overflow-auto">
          <FileInfo :file="file" />
        </div>
      </div>
    </div>
  </AppMain>
</template>
