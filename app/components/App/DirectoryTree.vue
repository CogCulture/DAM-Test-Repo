<script setup lang="ts">
const route = useRoute();
const bucketName = computed(() => (route.params.bucket as string) || "org");

// We only show the tree if we have a bucket
const isVisible = computed(() => !!route.params.bucket);

const files = ref<any[]>([]);
const loading = ref(false);
const page = ref(1);
const hasNextPage = ref(false);

const fetchContents = async (reset = false) => {
  if (reset) {
    page.value = 1;
    files.value = [];
  }
  if (!bucketName.value) return;
  
  loading.value = true;
  try {
    const isGDrive = bucketName.value && bucketName.value.startsWith("gdrive_");
    const url = isGDrive ? `/api/gdrive/list/root` : `/api/files/list/${bucketName.value}/root`;
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
    console.error("Error fetching root directory contents:", err);
  } finally {
    loading.value = false;
  }
};

const loadMore = () => {
  page.value++;
  fetchContents();
};

const refreshTrigger = useState("files-refresh-trigger", () => 0);

watch(refreshTrigger, () => {
  fetchContents(true);
});

watch(bucketName, (newVal, oldVal) => {
  if (newVal && newVal !== oldVal) {
    fetchContents(true);
  }
});

onMounted(() => {
  fetchContents(true);
});
const { aside } = useAside();
</script>

<template>
  <div
    v-if="isVisible"
    :class="[
      'w-64 border-r border-neutral-100 dark:border-neutral-700/50 h-screen pb-12 fixed top-0 bottom-0 left-0 z-8 bg-white dark:bg-neutral-950 flex flex-col transition-all duration-200 ease-in-out',
      aside ? 'pt-36' : 'pt-20'
    ]"
  >
    <div class="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 font-semibold text-sm text-neutral-800 dark:text-neutral-200">
      Directory
    </div>
    <div class="grow overflow-y-auto p-2">
      <AppDirectoryNode 
        v-for="file in files"
        :key="file.id"
        :file="file"
        :bucket-name="bucketName"
        :level="0" 
      />
      
      <div v-if="loading" class="py-4 flex justify-center">
        <UIcon name="lucide:loader-2" class="w-4 h-4 animate-spin text-neutral-400" />
      </div>
      <div v-else-if="hasNextPage" class="py-2 px-4">
        <UButton 
          variant="ghost" 
          size="2xs" 
          color="neutral" 
          class="w-full text-xs font-medium justify-center"
          @click="loadMore"
        >
          Load more...
        </UButton>
      </div>
      <div v-else-if="files.length === 0" class="py-4 text-center">
        <div class="text-xs text-neutral-400 italic">
          Empty folder
        </div>
      </div>
    </div>
  </div>
</template>
