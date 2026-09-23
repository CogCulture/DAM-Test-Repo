<script setup lang="ts">
import { useFile } from "~/composables/useFile";
import * as Vue from 'vue';
import * as VueDemi from 'vue-demi';
import { defineAsyncComponent, ref, watch } from 'vue';
import { isGoogleDriveAsset } from '~/utils/damModal';

type OfficeGlobal = 'vue-office-docx' | 'vue-office-excel' | 'vue-office-pptx';
const vendorLoads = new Map<string, Promise<unknown>>();

const loadOfficeComponent = (globalName: OfficeGlobal, src: string) => {
  return defineAsyncComponent(async () => {
    const browser = window as typeof window & Record<string, any>;
    browser.Vue = Vue;
    browser.VueDemi = VueDemi;

    if (!browser[globalName]) {
      let load = vendorLoads.get(src);
      if (!load) {
        load = new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = src;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error(`Unable to load ${globalName}`));
          document.head.appendChild(script);
        });
        vendorLoads.set(src, load);
      }
      await load;
    }

    const component = browser[globalName];
    if (!component) throw new Error(`Preview component ${globalName} did not initialize`);
    return component;
  });
};

const VueOfficeDocx = loadOfficeComponent('vue-office-docx', '/vendor/vue-office/docx.js');
const VueOfficeExcel = loadOfficeComponent('vue-office-excel', '/vendor/vue-office/excel.js');
const VueOfficePptx = loadOfficeComponent('vue-office-pptx', '/vendor/vue-office/pptx.js');

useHead({
  link: [
    { rel: 'stylesheet', href: '/vendor/vue-office/docx.css' },
    { rel: 'stylesheet', href: '/vendor/vue-office/excel.css' },
  ],
});

const { file, loading } = useFile();
const route = useRoute();

const textContent = ref('');
const loadingText = ref(false);

const getFileUrl = (f: IFile, inline = false) => {
  if (isGoogleDriveAsset(f)) {
    return `/api/gdrive/download/${encodeURIComponent(f.id)}${inline ? '?inline=true' : ''}`;
  }
  const bucket = route.params.bucket || f.bucketName || 'org';
  return `/api/files/${encodeURIComponent(String(bucket))}/download/${encodeURIComponent(f.id)}${inline ? '?inline=true' : ''}`;
};

const isTextFile = (f: IFile | null) => {
  if (!f) return false;
  const contentType = (f.contentType || '').toLowerCase();
  const name = (f.name || '').toLowerCase();
  const ext = name.split('.').pop() || '';
  const codeExts = new Set(['py', 'js', 'ts', 'jsx', 'tsx', 'vue', 'html', 'htm', 'css', 'txt', 'md', 'markdown', 'json', 'xml', 'yaml', 'yml', 'sh', 'sql', 'php', 'go', 'java', 'cpp', 'c', 'rs', 'rb', 'csv', 'env', 'toml', 'ini', 'log']);
  return contentType.startsWith('text/') || contentType === 'application/json' || contentType === 'application/javascript' || contentType === 'application/typescript' || contentType.endsWith('+json') || codeExts.has(ext);
};

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
};

const getOfficeComponent = (f: IFile | null) => {
  if (!f) return null;
  const contentType = (f.contentType || '').toLowerCase();
  const name = (f.name || '').toLowerCase();
  if (name.endsWith('.docx') || name.endsWith('.doc') || contentType.includes('word') || contentType.includes('wordprocessingml')) return VueOfficeDocx;
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || contentType.includes('excel') || contentType.includes('spreadsheet')) return VueOfficeExcel;
  if (name.endsWith('.pptx') || name.endsWith('.ppt') || contentType.includes('powerpoint') || contentType.includes('presentation')) return VueOfficePptx;
  return null;
};

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
  <Title v-if="file">{{ file.name }}</Title>
  <AppMain v-if="file" :title="file.name">
    <div class="flex flex-col lg:flex-row h-[calc(100vh-8rem)] w-full overflow-hidden rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] shadow-xl">
      <div class="relative flex min-h-0 grow items-center justify-center overflow-hidden bg-neutral-100 dark:bg-neutral-950">
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
          <Thumbnail :file="file" layout="col" />
        </div>
      </div>
      <div class="min-w-80 w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-[var(--dam-line)] bg-[var(--dam-panel-solid)] flex flex-col overflow-y-auto">
        <FileInfo :file="file" />
      </div>
    </div>
  </AppMain>
</template>
