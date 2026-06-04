<script setup lang="ts">
const { isAdmin } = useRole();
const toast = useToast();

if (!isAdmin.value) {
  navigateTo("/");
}

const { data: requests, refresh } = await useFetch<any[]>("/api/admin/gdrive-requests");

const processRequest = async (id: string, action: "approve" | "reject") => {
  try {
    await $fetch(`/api/admin/gdrive-requests/${id}/approve`, {
      method: "POST",
      body: { action },
    });
    toast.add({
      title: `Request successfully ${action}d!`,
      color: action === "approve" ? "success" : "neutral",
    });
    refresh();
  } catch (err: any) {
    toast.add({
      title: err?.data?.message || "Failed to process request.",
      color: "error",
    });
  }
};
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 p-4">
    <div>
      <h1 class="text-2xl font-semibold text-neutral-900 dark:text-white">Google Drive Hosting Requests</h1>
      <p class="text-neutral-500 text-sm mt-1">
        Approve or reject requests from users wishing to host their Google Drive folders.
      </p>
    </div>

    <div v-if="!requests || requests.length === 0" class="flex flex-col items-center justify-center min-h-[30vh] border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 rounded-2xl p-8 opacity-60">
      <UIcon name="lucide:inbox" class="w-12 h-12 text-neutral-400 mb-2" />
      <span class="text-sm font-medium text-neutral-500">No pending Google Drive hosting requests</span>
    </div>

    <div v-else class="space-y-4">
      <UCard
        v-for="req in requests"
        :key="req.id"
        class="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
      >
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-xs bg-primary-500/10 text-primary-500 font-semibold px-2 py-0.5 rounded-full">
                Google Drive
              </span>
              <span class="text-xs text-neutral-400 font-mono">User ID: {{ req.userId }}</span>
            </div>
            <h3 class="text-lg font-bold text-neutral-900 dark:text-white mt-1">
              "{{ req.folderName }}"
            </h3>
            <p class="text-xs text-neutral-500 font-mono">
              Folder ID: {{ req.folderId }}
            </p>
          </div>

          <div class="flex gap-2 shrink-0">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              icon="lucide:x"
              label="Reject"
              @click="processRequest(req.id, 'reject')"
            />
            <UButton
              color="primary"
              variant="solid"
              size="sm"
              icon="lucide:check"
              label="Approve"
              @click="processRequest(req.id, 'approve')"
            />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
