<script setup lang="ts">
import { usePreview } from "~/composables/usePreview";
import * as Vue from 'vue'
import * as VueDemi from 'vue-demi'
import { defineAsyncComponent } from 'vue'
import { isGoogleDriveAsset } from '~/utils/damModal'

type OfficeGlobal = 'vue-office-docx' | 'vue-office-excel' | 'vue-office-pptx'

const vendorLoads = new Map<string, Promise<unknown>>()

const loadOfficeComponent = (globalName: OfficeGlobal, src: string) => {
  return defineAsyncComponent(async () => {
    const browser = window as typeof window & Record<string, any>
    browser.Vue = Vue
    browser.VueDemi = VueDemi

    if (!browser[globalName]) {
      let load = vendorLoads.get(src)
      if (!load) {
        load = new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = src
          script.async = true
          script.onload = () => resolve()
          script.onerror = () => reject(new Error(`Unable to load ${globalName}`))
          document.head.appendChild(script)
        })
        vendorLoads.set(src, load)
      }
      await load
    }

    const component = browser[globalName]
    if (!component) throw new Error(`Preview component ${globalName} did not initialize`)
    return component
  })
}

const VueOfficeDocx = loadOfficeComponent('vue-office-docx', '/vendor/vue-office/docx.js')
const VueOfficeExcel = loadOfficeComponent('vue-office-excel', '/vendor/vue-office/excel.js')
const VueOfficePptx = loadOfficeComponent('vue-office-pptx', '/vendor/vue-office/pptx.js')

useHead({
  link: [
    { rel: 'stylesheet', href: '/vendor/vue-office/docx.css' },
    { rel: 'stylesheet', href: '/vendor/vue-office/excel.css' },
  ],
})

const { files, opened, open, limit, prevPage, nextPage } = usePreview();
const file = computed(() => files.value[opened.value]);

const getFileUrl = (f: IFile, inline = false) => {
  if (isGoogleDriveAsset(f)) {
    return `/api/gdrive/download/${encodeURIComponent(f.id)}${inline ? '?inline=true' : ''}`;
  }
  return `/api/files/${encodeURIComponent(f.bucketName)}/download/${encodeURIComponent(f.id)}${inline ? '?inline=true' : ''}`;
}

const isTextFile = (f: IFile) => {
  const contentType = (f.contentType || '').toLowerCase();
  return contentType.startsWith('text/') || contentType === 'application/json' || contentType.endsWith('+json');
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
      <div class="flex h-dvh w-full flex-col overflow-hidden lg:flex-row">
        <div class="relative min-h-0 grow flex justify-center items-center bg-white dark:bg-neutral-900 overflow-hidden">
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
              <iframe
                v-else-if="isTextFile(file)"
                :src="getFileUrl(file, true)"
                :title="`Preview of ${file.name}`"
                class="h-full w-full border-none bg-white dark:bg-neutral-950"
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
          class="z-10 flex h-[min(42dvh,24rem)] w-full shrink-0 flex-col border-t border-neutral-200/70 bg-white dark:bg-neutral-800 lg:h-dvh lg:w-96 lg:border-l lg:border-t-0"
        >
          <div
            class="h-16 min-h-16 border-b border-neutral-200/70 bg-white dark:bg-neutral-800 dark:border-neutral-700 w-full flex justify-between items-center px-4 gap-4"
          >
            <h4 class="truncate font-semibold text-neutral-800 dark:text-neutral-200" :title="file?.name">{{ file?.name }}</h4>
            <div class="flex items-center gap-1">
              <FileMenu v-if="file && !file.deletedAt" :file="file" dropdown>
                <UButton
                  icon="lucide:ellipsis"
                  label="Actions"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  class="rounded-xl"
                />
              </FileMenu>
              <UButton icon="lucide:x" color="neutral" variant="ghost" aria-label="Close preview" @click="open = false" />
            </div>
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
