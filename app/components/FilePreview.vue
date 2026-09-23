<script setup lang="ts">
import { usePreview } from "~/composables/usePreview";
import * as Vue from 'vue'
import * as VueDemi from 'vue-demi'
import { defineAsyncComponent, ref, watch } from 'vue'
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

const textContent = ref('');
const loadingText = ref(false);

const getFileUrl = (f: IFile, inline = false) => {
  if (isGoogleDriveAsset(f)) {
    return `/api/gdrive/download/${encodeURIComponent(f.id)}${inline ? '?inline=true' : ''}`;
  }
  return `/api/files/${encodeURIComponent(f.bucketName)}/download/${encodeURIComponent(f.id)}${inline ? '?inline=true' : ''}`;
}

const isTextFile = (f: IFile | null) => {
  if (!f) return false;
  const contentType = (f.contentType || '').toLowerCase();
  const name = (f.name || '').toLowerCase();
  const ext = name.split('.').pop() || '';
  const codeExts = new Set(['py', 'js', 'ts', 'jsx', 'tsx', 'vue', 'html', 'htm', 'css', 'txt', 'md', 'markdown', 'json', 'xml', 'yaml', 'yml', 'sh', 'sql', 'php', 'go', 'java', 'cpp', 'c', 'rs', 'rb', 'csv', 'env', 'toml', 'ini', 'log']);
  return contentType.startsWith('text/') || contentType === 'application/json' || contentType === 'application/javascript' || contentType === 'application/typescript' || contentType.endsWith('+json') || codeExts.has(ext);
}

const isOfficeFile = (f: IFile | null) => {
  if (!f) return false;
  const contentType = (f.contentType || '').toLowerCase();
  const name = (f.name || '').toLowerCase();
  const ext = name.split('.').pop() || '';
  const officeExts = new Set(['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt']);
  return officeExts.has(ext) || [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ].includes(contentType);
}

const getOfficeComponent = (f: IFile | null) => {
  if (!f) return null;
  const contentType = (f.contentType || '').toLowerCase();
  const name = (f.name || '').toLowerCase();
  if (name.endsWith('.docx') || name.endsWith('.doc') || contentType.includes('word') || contentType.includes('wordprocessingml')) return VueOfficeDocx;
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || contentType.includes('excel') || contentType.includes('spreadsheet')) return VueOfficeExcel;
  if (name.endsWith('.pptx') || name.endsWith('.ppt') || contentType.includes('powerpoint') || contentType.includes('presentation')) return VueOfficePptx;
  return null;
}

// Watch active preview file to load text content for markdown and code files
watch(
  () => file.value,
  async (newFile) => {
    if (newFile && isTextFile(newFile)) {
      loadingText.value = true;
      try {
        const res = await fetch(getFileUrl(newFile, true));
        if (res.ok) {
          textContent.value = await res.text();
        } else {
          textContent.value = `Failed to load preview for ${newFile.name}`;
        }
      } catch (err: any) {
        textContent.value = `Error loading text content: ${err?.message || err}`;
      } finally {
        loadingText.value = false;
      }
    } else {
      textContent.value = '';
    }
  },
  { immediate: true }
);
</script>

<template>
  <UModal
    v-if="opened >= 0"
    v-model:open="open"
    :ui="{
      overlay: 'fixed inset-0 z-[10000] bg-slate-950/75 backdrop-blur-sm',
      content: 'z-[10001] !h-[90dvh] !max-h-[90dvh] !w-[92vw] !max-w-[min(92rem,92vw)] overflow-hidden rounded-2xl border border-[var(--dam-line-strong)] bg-[var(--dam-panel-solid)] shadow-2xl ring-0',
    }"
  >
    <template #content>
      <div class="flex h-full w-full flex-col overflow-hidden lg:flex-row">
        <div class="relative flex min-h-0 grow items-center justify-center overflow-hidden bg-neutral-100 dark:bg-neutral-950">
          <Transition name="fade" mode="out-in">
            <div
              v-if="file"
              :key="opened"
              :class="[
                'absolute inset-0 w-full h-full',
                file?.type === 'folder' ? 'flex justify-center items-center max-w-96 max-h-96 m-auto' : 'block'
              ]"
            >
              <!-- PDF Viewer -->
              <iframe
                v-if="file.contentType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')"
                :src="getFileUrl(file, true)"
                class="w-full h-full border-none"
              ></iframe>

              <!-- Markdown & Text Content Viewer -->
              <div
                v-else-if="isTextFile(file)"
                class="h-full w-full overflow-auto bg-slate-50 p-6 font-mono text-xs text-slate-800 dark:bg-slate-950 dark:text-slate-200"
              >
                <div v-if="loadingText" class="flex h-full w-full flex-col items-center justify-center gap-2">
                  <Icon name="lucide:loader-2" class="size-8 animate-spin text-blue-500" />
                  <span>Loading text preview...</span>
                </div>
                <pre v-else class="whitespace-pre-wrap font-mono leading-relaxed">{{ textContent }}</pre>
              </div>

              <!-- Office Documents Viewer (Word, Excel, PowerPoint) -->
              <ClientOnly v-else-if="isOfficeFile(file)">
                <component
                  :is="getOfficeComponent(file)"
                  :src="getFileUrl(file, true)"
                  class="w-full h-full"
                  style="height: 100%;"
                />
              </ClientOnly>

              <!-- Fallback Viewer -->
              <div v-else class="w-full h-full flex justify-center items-center">
                <Thumbnail :file="file!" layout="col" />
              </div>
            </div>
          </Transition>
        </div>
        <div
          class="z-10 flex h-[min(38dvh,22rem)] w-full shrink-0 flex-col border-t border-neutral-200/70 bg-white dark:bg-neutral-900 lg:h-full lg:w-96 lg:border-l lg:border-t-0"
        >
          <div
            class="h-16 min-h-16 border-b border-neutral-200/70 bg-white dark:bg-neutral-800 dark:border-neutral-700 w-full flex justify-between items-center px-4 gap-4"
          >
            <h4 class="truncate font-semibold text-neutral-800 dark:text-neutral-200" :title="file?.name">{{ file?.name }}</h4>
            <div class="flex items-center gap-1">
              <UButton
                v-if="file"
                :to="getFileUrl(file, true)"
                target="_blank"
                icon="lucide:external-link"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Open in new tab"
                title="Open in new tab"
                class="rounded-xl"
              />
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
