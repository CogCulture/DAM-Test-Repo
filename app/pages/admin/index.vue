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

const { data: orgSettings } = await useFetch("/api/organizations/settings");

const actioning = ref<string | null>(null);

const editingUser = ref<any>(null);
const editForm = ref({ role: "", departmentId: "" });
const savingEdit = ref(false);

const openEditModal = (user: any) => {
  editingUser.value = user;
  editForm.value = {
    role: user.role || "team_member",
    departmentId: user.departmentId || "",
  };
};

const saveUserEdit = async () => {
  if (!editingUser.value) return;
  savingEdit.value = true;
  try {
    await $fetch(`/api/admin/users/${editingUser.value.id}`, {
      method: "PUT",
      body: editForm.value,
    });
    toast.add({ title: "User updated successfully", color: "success" });
    editingUser.value = null;
    await refreshAll();
  } catch (e: any) {
    toast.add({ title: e?.data?.message || "Failed to update user", color: "error" });
  } finally {
    savingEdit.value = false;
  }
};

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
              <UButton
                v-if="user.role !== 'admin'"
                size="sm"
                color="primary"
                variant="soft"
                icon="lucide:pencil"
                @click="openEditModal(user)"
              >
                Edit
              </UButton>
            </div>
          </div>
        </div>
      </template>
    </UTabs>

    <!-- Edit User Modal -->
    <UModal v-model="editingUser">
      <div v-if="editingUser" class="p-6 space-y-6">
        <h3 class="text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
          <Icon name="lucide:user-cog" class="text-primary size-5" />
          Edit User: {{ editingUser.name }}
        </h3>

        <div class="space-y-4">
          <UFormField label="Department">
            <select
              v-model="editForm.departmentId"
              class="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">None (Global)</option>
              <option v-for="dept in orgSettings?.departments || []" :key="dept.id" :value="dept.id">
                {{ dept.name }}
              </option>
            </select>
          </UFormField>

          <UFormField label="Role">
            <select
              v-model="editForm.role"
              class="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="admin">Admin</option>
              <option value="dept_head">Department Head</option>
              <option value="team_lead">Team Lead</option>
              <option value="team_member">Team Member</option>
              <option value="intern">Intern</option>
              <template v-if="orgSettings?.permissions">
                <option v-for="role in [...new Set(orgSettings.permissions.map((p: any) => p.role).filter((r: any) => !['admin', 'dept_head', 'team_lead', 'team_member', 'intern'].includes(r)))]" :key="role" :value="role">
                  {{ role }}
                </option>
              </template>
            </select>
          </UFormField>
        </div>

        <div class="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <UButton color="neutral" variant="ghost" @click="editingUser = null">
            Cancel
          </UButton>
          <UButton color="primary" variant="solid" :loading="savingEdit" @click="saveUserEdit">
            Save Changes
          </UButton>
        </div>
      </div>
    </UModal>

  </div>
</template>
