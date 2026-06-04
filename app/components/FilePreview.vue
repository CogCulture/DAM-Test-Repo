<script setup lang="ts">
import VueOfficeDocx from '@vue-office/docx'
import '@vue-office/docx/lib/index.css'
import VueOfficeExcel from '@vue-office/excel'
import '@vue-office/excel/lib/index.css'
import VueOfficePptx from '@vue-office/pptx'

const props = defineProps<{
  files: IFile[];
}>();
const { opened, open, limit, prevPage, nextPage } = usePreview();
const file = computed(() => props.files[opened.value]);
watch(opened, () => {
  limit.value = props.files.length;
});

const getFileUrl = (f: IFile, inline = false) => {
  return `/api/files/${f.bucketName}/download/${f.id}${inline ? '?inline=true' : ''}`;
}

const isOfficeFile = (contentType: string) => {
  if (!contentType) return false;
  return [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ].includes(contentType);
}

const getOfficeComponent = (contentType: string) => {
  if (contentType.includes("wordprocessingml") || contentType === "application/msword") return VueOfficeDocx;
  if (contentType.includes("spreadsheetml") || contentType === "application/vnd.ms-excel") return VueOfficeExcel;
  if (contentType.includes("presentationml") || contentType === "application/vnd.ms-powerpoint") return VueOfficePptx;
  return null;
}
</script>
<template>
  <UModal v-if="opened >= 0" v-model:open="open" fullscreen>
    <template #content>
      <div class="flex flex-row h-screen w-full overflow-hidden">
        <div class="h-full w-full flex justify-center items-center bg-neutral-100 dark:bg-neutral-900 overflow-hidden relative">
          <Transition name="fade" mode="out-in">
            <div
              v-if="file"
              :key="opened"
              :class="[
                'absolute inset-0 w-full h-full',
                file?.type === 'folder' ? 'flex justify-center items-center max-w-96 max-h-96 m-auto' : 'block'
              ]"
            >
              <iframe 
                v-if="file.contentType === 'application/pdf'" 
                :src="getFileUrl(file, true)" 
                class="w-full h-full border-none"
              ></iframe>
              <ClientOnly v-else-if="isOfficeFile(file.contentType)">
                <component 
                  :is="getOfficeComponent(file.contentType)" 
                  :src="getFileUrl(file, true)" 
                  class="w-full h-full"
                  style="height: 100vh;"
                />
              </ClientOnly>
              <div v-else class="w-full h-full flex justify-center items-center">
                <Thumbnail :file="file!" layout="col" />
              </div>
            </div>
          </Transition>
        </div>
        <div
          class="min-w-96 w-96 border-l border-neutral-200/70 h-screen bg-white dark:bg-neutral-800 flex flex-col z-10"
        >
          <div
            class="h-16 min-h-16 border-b border-neutral-200/70 bg-white dark:bg-neutral-800 dark:border-neutral-700 w-full flex justify-between items-center px-4 gap-4"
          >
            <h4 class="truncate font-semibold text-neutral-800 dark:text-neutral-200" :title="file?.name">{{ file?.name }}</h4>
            <UButton icon="lucide:x" color="neutral" variant="ghost" @click="open = false" />
          </div>
          <div class="grow w-full overflow-auto">
            <FileInfo v-if="file" :file="file" />
          </div>
          <div
            class="h-16 min-h-16 border-t border-neutral-200/70 bg-white dark:bg-neutral-800 dark:border-neutral-700 w-full flex justify-start items-center px-4"
          >
            <UButton
              v-if="opened > 0"
              @click="prevPage"
              icon="lucide:chevron-left"
            />
            <span class="grow text-center text-sm dark:text-neutral-300"
              >{{ opened + 1 }} / {{ limit }}</span
            >
            <UButton
              v-if="opened < limit - 1"
              @click="nextPage"
              icon="lucide:chevron-right"
              class="ml-auto"
            />
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
