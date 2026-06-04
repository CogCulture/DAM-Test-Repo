<script setup lang="ts">

import { getDepartmentName } from "~~/shared/constants/departments";
import { getRoleLabel } from "~~/shared/constants/roles";

const { isAdmin, isDeptHead, canApproveUsers } = useRole();
const toast = useToast();

// Redirect non-admins
if (!canApproveUsers.value) {
  navigateTo("/");
}

const { data: pendingUsers, refresh } = await useFetch("/api/admin/users/pending");
const { data: allUsers, refresh: refreshAll } = (isAdmin.value || isDeptHead.value)
  ? await useFetch("/api/admin/users")
  : { data: ref([]), refresh: () => {} };

const actioning = ref<string | null>(null);

const handleAction = async (userId: string, action: "approve" | "reject" | "remove") => {
  actioning.value = userId;
  try {
    await $fetch(`/api/admin/users/${userId}`, {
      method: "POST",
      body: { action },
    });
    let toastTitle = "User approved";
    let toastColor: any = "success";
    if (action === "reject") {
      toastTitle = "User rejected";
      toastColor = "error";
    } else if (action === "remove") {
      toastTitle = "User removed from organization";
      toastColor = "warning";
    }
    toast.add({
      title: toastTitle,
      color: toastColor,
    });
    await refresh();
    await refreshAll();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error", color: "error" });
  } finally {
    actioning.value = null;
  }
};

const tabs = ref([
  { label: "Pending Approval", slot: "pending" },
  ...((isAdmin.value || isDeptHead.value) ? [{ label: isAdmin.value ? "All Users" : "Department Users", slot: "all" }] : []),
]);
const activeTab = ref(0);
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-neutral-900 dark:text-white">User Management</h1>
        <p class="text-neutral-500 text-sm mt-1">Review and approve team member access requests</p>
      </div>
      <UBadge v-if="pendingUsers?.length" color="warning" variant="solid" size="lg">
        {{ pendingUsers.length }} pending
      </UBadge>
    </div>

    <UTabs :items="tabs" v-model:model-value="activeTab" class="w-full">
      <!-- Pending Tab -->
      <template #pending>
        <div class="mt-6 space-y-3">
          <div v-if="!pendingUsers?.length" class="text-center py-16 text-neutral-400">
            <UIcon name="lucide:check-circle" class="text-4xl mb-3 text-green-500" />
            <p>No pending approvals</p>
          </div>
          <div
            v-for="user in pendingUsers"
            :key="user.id"
            class="flex items-center gap-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4"
          >
            <UAvatar :src="user.avatar ?? undefined" :alt="user.name" size="lg" />
            <div class="flex-1 min-w-0">
              <p class="font-medium text-neutral-900 dark:text-white truncate">{{ user.name }}</p>
              <p class="text-sm text-neutral-500 truncate">{{ user.email }}</p>
              <div class="flex gap-2 mt-1">
                <UBadge variant="soft" color="neutral" size="xs">
                  {{ getRoleLabel(user.role as any) }}
                </UBadge>
                <UBadge variant="soft" color="primary" size="xs">
                  {{ getDepartmentName(user.departmentId ?? "") }}
                </UBadge>
              </div>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <UButton
                size="sm"
                color="success"
                variant="solid"
                :loading="actioning === user.id"
                icon="lucide:check"
                @click="handleAction(user.id, 'approve')"
              >
                Approve
              </UButton>
              <UButton
                size="sm"
                color="error"
                variant="outline"
                :loading="actioning === user.id"
                icon="lucide:x"
                @click="handleAction(user.id, 'reject')"
              >
                Reject
              </UButton>
            </div>
          </div>
        </div>
      </template>

      <!-- All Users Tab (Founder only) -->
      <template #all>
        <div class="mt-6 space-y-3">
          <div
            v-for="user in allUsers"
            :key="user.id"
            class="flex items-center gap-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4"
          >
            <UAvatar :src="user.avatar ?? undefined" :alt="user.name" size="lg" />
            <div class="flex-1 min-w-0">
              <p class="font-medium text-neutral-900 dark:text-white truncate">{{ user.name }}</p>
              <p class="text-sm text-neutral-500 truncate">{{ user.email }}</p>
              <div class="flex gap-2 mt-1">
                <UBadge variant="soft" color="neutral" size="xs">
                  {{ getRoleLabel(user.role as any) }}
                </UBadge>
                <UBadge variant="soft" color="primary" size="xs">
                  {{ getDepartmentName(user.departmentId ?? "") }}
                </UBadge>
                <UBadge
                  :color="user.approvalStatus === 'active' ? 'success' : user.approvalStatus === 'pending' ? 'warning' : 'error'"
                  variant="soft"
                  size="xs"
                >
                  {{ user.approvalStatus }}
                </UBadge>
              </div>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <UButton
                v-if="user.approvalStatus === 'pending'"
                size="sm"
                color="success"
                variant="solid"
                :loading="actioning === user.id"
                icon="lucide:check"
                @click="handleAction(user.id, 'approve')"
              >
                Approve
              </UButton>
              <UButton
                v-if="user.approvalStatus === 'pending'"
                size="sm"
                color="error"
                variant="outline"
                :loading="actioning === user.id"
                icon="lucide:x"
                @click="handleAction(user.id, 'reject')"
              >
                Reject
              </UButton>
              <UButton
                v-if="user.role !== 'admin'"
                size="sm"
                color="error"
                variant="subtle"
                :loading="actioning === user.id"
                icon="lucide:user-minus"
                @click="handleAction(user.id, 'remove')"
              >
                Remove
              </UButton>
            </div>
          </div>
        </div>
      </template>
    </UTabs>
  </div>
</template>
