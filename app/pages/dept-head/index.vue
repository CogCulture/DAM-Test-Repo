<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useRole } from "~/composables/useRole";
import { useToast } from "~/composables/useToast";
import { getDepartmentName } from "~~/shared/constants/departments";
import { getRoleLabel } from "~~/shared/constants/roles";

const { isAdmin, isDeptHead, departmentId: userDepartmentId } = useRole();

const toast = useToast();
const loading = ref(true);
const selectedDepartmentId = ref<string | null>(userDepartmentId.value || null);
const departments = ref<any[]>([]);

const stats = ref({
  pendingRequests: 0,
  deptUsers: 0
});
const users = ref<any[]>([]);
const folderRequests = ref<any[]>([]);
const promotingId = ref<string | null>(null);

const fetchDashboardData = async () => {
  loading.value = true;
  try {
    const url = selectedDepartmentId.value
      ? `/api/dept-head/permissions?departmentId=${encodeURIComponent(selectedDepartmentId.value)}`
      : "/api/dept-head/permissions";

    const [permsData, reqsData]: [any, any] = await Promise.all([
      $fetch(url),
      $fetch("/api/folder-requests")
    ]);
    
    users.value = permsData.users || [];
    folderRequests.value = reqsData || [];
    departments.value = permsData.departments || [];
    
    if (permsData.targetDepartmentId) {
      selectedDepartmentId.value = permsData.targetDepartmentId;
    }
    
    // Filter pending requests for current department
    const currentDept = selectedDepartmentId.value;
    const pendingReqs = folderRequests.value.filter(
      r => r.status === "pending" && (!currentDept || r.departmentId === currentDept)
    );
    
    stats.value = {
      pendingRequests: pendingReqs.length,
      deptUsers: users.value.length
    };
  } catch (e: any) {
    toast.add({ title: e?.data?.message || "Failed to load dashboard data", color: "error" });
  } finally {
    loading.value = false;
  }
};

const promoteToLead = async (userId: string) => {
  promotingId.value = userId;
  try {
    await $fetch("/api/dept-head/team-leads", {
      method: "POST",
      body: { userId }
    });
    toast.add({ title: "User promoted to Team Lead", color: "success" });
    await fetchDashboardData();
  } catch (e: any) {
    toast.add({ title: e?.data?.message || "Failed to promote user.", color: "error" });
  } finally {
    promotingId.value = null;
  }
};

watch(selectedDepartmentId, () => {
  fetchDashboardData();
});

onMounted(() => {
  if (import.meta.client && !isAdmin.value && !isDeptHead.value) {
    navigateTo("/");
    return;
  }
  fetchDashboardData();
});
</script>

<template>
  <AppMain :title="`Department Governance — ${getDepartmentName(selectedDepartmentId || '')}`">
    <div v-if="loading && !users.length" class="flex items-center justify-center min-h-[50vh]">
      <UIcon name="lucide:loader-2" class="animate-spin text-3xl text-neutral-400" />
    </div>

    <div v-else class="max-w-5xl mx-auto space-y-8">
      <!-- Admin Department Selector -->
      <div v-if="isAdmin && departments.length > 0" class="flex items-center justify-between bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm">
        <div class="flex items-center gap-2">
          <UIcon name="lucide:building" class="text-primary-500 text-xl" />
          <span class="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Select Department:</span>
        </div>
        <select
          v-model="selectedDepartmentId"
          class="bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option v-for="dept in departments" :key="dept.id" :value="dept.id">
            {{ dept.name }} ({{ dept.code }})
          </option>
        </select>
      </div>

      <!-- Summary Stats -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 flex items-center justify-between shadow-sm">
          <div class="space-y-1">
            <p class="text-sm text-neutral-500 font-medium">Pending Folder Requests</p>
            <h3 class="text-3xl font-extrabold text-neutral-800 dark:text-white">{{ stats.pendingRequests }}</h3>
          </div>
          <div class="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl">
            <UIcon name="lucide:folder-git-2" class="text-2xl" />
          </div>
        </div>

        <div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 flex items-center justify-between shadow-sm">
          <div class="space-y-1">
            <p class="text-sm text-neutral-500 font-medium">Department Members</p>
            <h3 class="text-3xl font-extrabold text-neutral-800 dark:text-white">{{ stats.deptUsers }}</h3>
          </div>
          <div class="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 rounded-2xl">
            <UIcon name="lucide:users" class="text-2xl" />
          </div>
        </div>
      </div>

      <!-- Quick Actions / Navigation -->
      <section class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 space-y-4">
        <h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200">Quick Governance Tools</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NuxtLink 
            to="/admin/nomenclature" 
            class="flex flex-col items-center justify-center p-6 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800/80 rounded-2xl hover:border-indigo-500/40 hover:bg-indigo-500/5 transition text-center space-y-3"
          >
            <UIcon name="lucide:tags" class="text-violet-500 text-2xl" />
            <div class="text-sm font-bold text-neutral-900 dark:text-white">Nomenclature Settings</div>
            <p class="text-xs text-neutral-500">Configure file naming rules for uploads</p>
          </NuxtLink>

          <NuxtLink 
            to="/admin?tab=folders" 
            class="flex flex-col items-center justify-center p-6 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800/80 rounded-2xl hover:border-indigo-500/40 hover:bg-indigo-500/5 transition text-center space-y-3"
          >
            <UIcon name="lucide:folder-open" class="text-amber-500 text-2xl" />
            <div class="text-sm font-bold text-neutral-900 dark:text-white">Folder Requests</div>
            <p class="text-xs text-neutral-500">Review pending folder creations</p>
          </NuxtLink>
        </div>
      </section>

      <!-- Department Users & Leads -->
      <section class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 space-y-4">
        <h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200">Department Members</h2>
        
        <div v-if="users.length > 0" class="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
          <table class="w-full text-sm text-left">
            <thead class="bg-neutral-50 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 uppercase text-xs font-semibold border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th class="px-4 py-3">Member</th>
                <th class="px-4 py-3">Role</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-200 dark:divide-neutral-800">
              <tr v-for="deptUser in users" :key="deptUser.id" class="hover:bg-neutral-50/50 dark:hover:bg-neutral-950/50">
                <td class="px-4 py-3.5 flex items-center space-x-3">
                  <UAvatar :src="deptUser.avatar ?? undefined" :alt="deptUser.name" size="sm" />
                  <div>
                    <p class="font-medium text-neutral-800 dark:text-neutral-200">{{ deptUser.name }}</p>
                    <p class="text-xs text-neutral-500">{{ deptUser.email }}</p>
                  </div>
                </td>
                <td class="px-4 py-3.5">
                  <UBadge variant="soft" color="primary" size="xs">
                    {{ getRoleLabel(deptUser.role) }}
                  </UBadge>
                </td>
                <td class="px-4 py-3.5 text-right">
                  <UButton
                    v-if="deptUser.role !== 'dept_head' && deptUser.role !== 'team_lead'"
                    color="primary"
                    variant="soft"
                    size="xs"
                    icon="lucide:trending-up"
                    :loading="promotingId === deptUser.id"
                    @click="promoteToLead(deptUser.id)"
                  >
                    Promote to Lead
                  </UButton>
                  <span v-else-if="deptUser.role === 'dept_head'" class="text-xs text-neutral-500 font-semibold italic">
                    Department Head
                  </span>
                  <span v-else class="text-xs text-indigo-400 font-semibold inline-flex items-center justify-end gap-1">
                    <UIcon name="lucide:check-circle" class="text-sm" /> Team Lead
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="text-center py-8 text-neutral-400">
          <p>No members found in this department.</p>
        </div>
      </section>
    </div>
  </AppMain>
</template>
