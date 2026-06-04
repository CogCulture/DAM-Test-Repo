<script setup lang="ts">
definePageMeta({ layout: "guest" });

const router = useRouter();
const searchQ = ref("");
const selectedFolder = ref<{ id: string; name: string } | null>(null);
const submitting = ref(false);

const { data: folders, error, pending } = await useFetch<any[]>("/api/gdrive/list-folders");

const filteredFolders = computed(() => {
  if (!folders.value) return [];
  if (!searchQ.value.trim()) return folders.value;
  return folders.value.filter((f) =>
    f.name.toLowerCase().includes(searchQ.value.toLowerCase())
  );
});

const handleSelect = (folder: { id: string; name: string }) => {
  selectedFolder.value = folder;
};

const submitRequest = async () => {
  if (!selectedFolder.value) return;
  submitting.value = true;

  try {
    await $fetch("/api/gdrive/select-folder", {
      method: "POST",
      body: {
        folderId: selectedFolder.value.id,
        folderName: selectedFolder.value.name,
      },
    });
    router.push("/gdrive/pending");
  } catch (err) {
    console.error("Failed to submit folder selection:", err);
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 px-4 py-8">
    <div class="w-full max-w-lg">
      <Logo class="mx-auto mb-8" />

      <div class="bg-neutral-900/80 backdrop-blur-md border border-neutral-800 rounded-3xl p-8 shadow-2xl space-y-6">
        <div class="text-center">
          <h1 class="text-2xl font-bold text-white">Select a Google Drive Folder</h1>
          <p class="text-neutral-400 text-sm mt-2">
            Choose the folder you want to host in the system.
          </p>
        </div>

        <UAlert
          v-if="error"
          title="Connection Error"
          description="Failed to load folders from your Google Drive. Please try signing in again."
          color="error"
          variant="soft"
          icon="lucide:alert-circle"
        />

        <div class="space-y-4">
          <UInput
            v-model="searchQ"
            icon="lucide:search"
            placeholder="Search folders..."
            class="w-full"
            size="md"
          />

          <!-- Folder list -->
          <div class="border border-neutral-800 rounded-2xl bg-neutral-950 max-h-60 overflow-y-auto divide-y divide-neutral-900 custom-scrollbar">
            <div v-if="pending" class="p-8 flex justify-center items-center">
              <UIcon name="lucide:loader-2" class="w-6 h-6 animate-spin text-primary-500" />
            </div>

            <div
              v-else-if="filteredFolders.length === 0"
              class="p-8 text-center text-neutral-500 text-sm italic"
            >
              No folders found.
            </div>

            <div
              v-for="folder in filteredFolders"
              :key="folder.id"
              @click="handleSelect(folder)"
              :class="[
                'flex items-center gap-3 p-4 cursor-pointer transition-all duration-150',
                selectedFolder?.id === folder.id
                  ? 'bg-primary-500/10 border-l-4 border-primary-500 text-white'
                  : 'hover:bg-neutral-900/50 text-neutral-400 hover:text-neutral-200'
              ]"
            >
              <UIcon name="lucide:folder" class="text-xl shrink-0" :class="selectedFolder?.id === folder.id ? 'text-primary-500' : 'text-neutral-500'" />
              <div class="grow truncate">
                <p class="font-medium text-sm truncate">{{ folder.name }}</p>
                <p class="text-[11px] text-neutral-500 font-mono mt-0.5">ID: {{ folder.id }}</p>
              </div>
              <UIcon
                v-if="selectedFolder?.id === folder.id"
                name="lucide:check-circle-2"
                class="text-primary-500 text-lg shrink-0"
              />
            </div>
          </div>
        </div>

        <div class="flex gap-4 pt-2">
          <UButton
            variant="ghost"
            color="neutral"
            class="flex-1 justify-center"
            @click="router.push('/auth/signin')"
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            class="flex-1 justify-center"
            :disabled="!selectedFolder"
            :loading="submitting"
            @click="submitRequest"
          >
            Submit for Approval
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #262626;
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #404040;
}
</style>
