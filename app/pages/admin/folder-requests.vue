<script setup lang="ts">
import { useRole } from "~/composables/useRole";
import { useToast } from "~/composables/useToast";
import { getDepartmentName } from "~~/shared/constants/departments";
import { getRoleLabel } from "~~/shared/constants/roles";

const { canEditNomenclature } = useRole();
const toast = useToast();

if (!canEditNomenclature.value) {
  navigateTo("/");
}

const { data: requests, refresh } = await useFetch("/api/folder-requests");
const actioning = ref<string | null>(null);
const reviewNotes = reactive<Record<string, string>>({});

const pendingRequests = computed(() =>
  (requests.value as any[])?.filter((r) => r.status === "pending") ?? []
);
const reviewedRequests = computed(() =>
  (requests.value as any[])?.filter((r) => r.status !== "pending") ?? []
);

const handleReview = async (id: string, action: "approve" | "reject") => {
  actioning.value = id;
  try {
    await $fetch(`/api/folder-requests/${id}`, {
      method: "POST",
      body: { action, reviewNote: reviewNotes[id]?.trim() || undefined },
    });
    toast.add({
      title: action === "approve" ? "Folder created" : "Request rejected",
      color: action === "approve" ? "success" : "neutral",
    });
    refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error", color: "error" });
  } finally {
    actioning.value = null;
  }
};

const getDestinationPath = (req: any) => {
  let parentPath = "";
  if (req.parentId === "root") {
    parentPath = req.bucketName;
  } else if (req.parentId.startsWith("dept_")) {
    const deptId = req.parentId.substring(5);
    parentPath = `${req.bucketName}/${deptId}`;
  } else {
    parentPath = req.parentPath || req.parentId;
  }
  return `${parentPath}/${req.folderName}`;
};

const statusColor = (status: string) => {
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  return "warning";
};
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-neutral-900 dark:text-white">Folder Requests</h1>
        <p class="text-neutral-500 text-sm mt-1">Review folder creation requests from team leads</p>
      </div>
      <UBadge v-if="pendingRequests.length" color="warning" variant="solid" size="lg">
        {{ pendingRequests.length }} pending
      </UBadge>
    </div>

    <!-- Pending -->
    <div v-if="pendingRequests.length" class="space-y-3">
      <h2 class="text-sm font-medium text-neutral-400 uppercase tracking-wide">Awaiting Review</h2>
      <div
        v-for="req in pendingRequests"
        :key="req.id"
        class="flex items-center gap-4 bg-white dark:bg-neutral-900 border border-amber-500/20 rounded-2xl p-4"
      >
        <div class="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
          <UIcon name="lucide:folder-plus" class="text-amber-400" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-medium text-neutral-900 dark:text-white">{{ req.folderName }}</p>
          <p class="text-sm text-neutral-500">
            Requested by {{ req.requesterName || 'user' }} · {{ getDepartmentName(req.departmentId) }}
          </p>
          <p class="text-xs text-neutral-400 mt-1">
            Destination: {{ getDestinationPath(req) }}
          </p>
        </div>
        <UInput
          v-model="reviewNotes[req.id]"
          placeholder="Optional review note"
          class="w-52"
          :disabled="actioning === req.id"
        />
        <div class="flex gap-2">
          <UButton
            size="sm"
            color="success"
            variant="solid"
            :loading="actioning === req.id"
            icon="lucide:check"
            @click="handleReview(req.id, 'approve')"
          >
            Approve
          </UButton>
          <UButton
            size="sm"
            color="error"
            variant="outline"
            :loading="actioning === req.id"
            icon="lucide:x"
            @click="handleReview(req.id, 'reject')"
          >
            Reject
          </UButton>
        </div>
      </div>
    </div>

    <div v-if="!pendingRequests.length" class="text-center py-10 text-neutral-400">
      <UIcon name="lucide:folder-check" class="text-4xl mb-3 text-green-500" />
      <p>No pending folder requests</p>
    </div>

    <!-- Reviewed history -->
    <div v-if="reviewedRequests.length" class="space-y-3">
      <h2 class="text-sm font-medium text-neutral-400 uppercase tracking-wide">Review History</h2>
      <div
        v-for="req in reviewedRequests"
        :key="req.id"
        class="flex items-center gap-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 opacity-70"
      >
        <div class="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center flex-shrink-0">
          <UIcon name="lucide:folder" class="text-neutral-400" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-medium text-neutral-900 dark:text-white">{{ req.folderName }}</p>
          <p class="text-sm text-neutral-500">
            Requested by {{ req.requesterName || 'user' }} · {{ getDepartmentName(req.departmentId) }}
          </p>
          <p class="text-xs text-neutral-400 mt-1">
            Destination: {{ getDestinationPath(req) }}
          </p>
          <p v-if="req.finalFolderName && req.finalFolderName !== req.folderName" class="text-xs text-primary-500 mt-1">
            Created as: {{ req.finalFolderName }}
          </p>
          <p v-if="req.reviewNote" class="text-xs text-neutral-500 mt-1">
            Review note: {{ req.reviewNote }}
          </p>
        </div>
        <UBadge :color="statusColor(req.status)" variant="soft" size="sm">
          {{ req.status }}
        </UBadge>
      </div>
    </div>
  </div>
</template>
