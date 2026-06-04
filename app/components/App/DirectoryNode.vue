<script setup lang="ts">
import { ref, watch } from 'vue';
import { fileIcon } from '~~/shared/utils/helper';

const props = defineProps<{
  file: any;
  bucketName: string;
  level: number;
}>();

const route = useRoute();
const open = ref(false);
const files = ref<any[]>([]);
const loading = ref(false);
const page = ref(1);
const hasNextPage = ref(false);

const isFolder = computed(() => props.file.type === 'folder');

const fetchContents = async (reset = false) => {
  if (reset) {
    page.value = 1;
    files.value = [];
  }
  loading.value = true;
  try {
    const isGDrive = props.bucketName && props.bucketName.startsWith("gdrive_");
    const url = isGDrive ? `/api/gdrive/list/${props.file.id}` : `/api/files/list/${props.bucketName}/${props.file.id}`;
    const data = await $fetch<any>(url, {
      query: {
        page: page.value,
        sortBy: 'name',
        order: 'asc',
      }
    });
    if (data && data.data) {
      files.value.push(...data.data);
      hasNextPage.value = !!data.nextPage;
    }
  } catch (err) {
    console.error("Error fetching directory contents:", err);
  } finally {
    loading.value = false;
  }
};

const toggleOpen = () => {
  if (!isFolder.value) return;
  open.value = !open.value;
  if (open.value && files.value.length === 0) {
    fetchContents(true);
  }
};

const loadMore = () => {
  page.value++;
  fetchContents();
};

const refreshTrigger = useState("files-refresh-trigger", () => 0);

watch(refreshTrigger, () => {
  if (open.value) {
    fetchContents(true);
  }
});

</script>

<template>
  <div class="flex flex-col w-full">
    <!-- Node row -->
    <div 
      class="flex items-center gap-2 py-1 px-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md cursor-pointer transition-colors"
      :style="{ paddingLeft: `${(level * 12) + 4}px` }"
    >
      <!-- Caret for folder -->
      <div 
        v-if="isFolder" 
        class="shrink-0 flex items-center justify-center w-5 h-5 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
        @click.stop="toggleOpen"
      >
        <UIcon 
          name="lucide:chevron-right" 
          class="w-3.5 h-3.5 text-neutral-400 transition-transform duration-200"
          :class="{ 'rotate-90': open }" 
        />
      </div>
      <div v-else class="w-5 shrink-0"></div>
      
      <!-- Icon -->
      <UIcon 
        :name="fileIcon(file.contentType || file.type)" 
        class="w-4 h-4 shrink-0 text-neutral-500" 
      />
      
      <!-- Label -->
      <NuxtLink 
        :to="isFolder ? `/${bucketName}/${file.id}` : `/${bucketName}/file/${file.id}`"
        class="text-[13px] font-medium text-neutral-700 dark:text-neutral-300 truncate grow"
        :class="{ 'text-primary-500': route.params.id === file.id }"
      >
        {{ file.name }}
      </NuxtLink>
    </div>

    <!-- Recursive children if folder -->
    <template v-if="open && isFolder">
      <AppDirectoryNode 
        v-for="childFile in files"
        :key="childFile.id"
        :file="childFile"
        :bucket-name="bucketName"
        :level="level + 1"
      />

      <!-- Loading / Load More -->
      <div v-if="loading" class="py-2 text-center">
        <UIcon name="lucide:loader-2" class="w-4 h-4 animate-spin text-neutral-400" />
      </div>
      <div v-else-if="hasNextPage" class="py-1">
        <UButton 
          variant="ghost" 
          size="2xs" 
          color="neutral" 
          class="w-full text-[11px] font-medium justify-start"
          :style="{ paddingLeft: `${((level + 1) * 12) + 32}px` }"
          @click="loadMore"
        >
          Load more...
        </UButton>
      </div>
      <div v-else-if="files.length === 0" class="py-1">
        <div 
          class="text-[11px] text-neutral-400 italic"
          :style="{ paddingLeft: `${((level + 1) * 12) + 32}px` }"
        >
          Empty folder
        </div>
      </div>
    </template>
  </div>
</template>
