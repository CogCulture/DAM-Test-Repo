<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getDepartmentName } from "~~/shared/constants/departments";
import { getRoleLabel } from "~~/shared/constants/roles";

const { isDeptHead, departmentId } = useRole();
if (!isDeptHead.value) {
  navigateTo("/");
}

const toast = useToast();
const loading = ref(true);
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
    const [permsData, reqsData]: [any, any] = await Promise.all([
      $fetch("/api/dept-head/permissions"),
      $fetch("/api/folder-requests")
    ]);
    
    users.value = permsData.users || [];
    folderRequests.value = reqsData || [];
    
    // Filter pending requests for current department
    const pendingReqs = folderRequests.value.filter(r => r.status === "pending" && r.departmentId === departmentId.value);
    
    stats.value = {
      pendingRequests: pendingReqs.length,
      deptUsers: users.value.length
    };
  } catch (e) {
    toast.add({ title: "Failed to load dashboard data", color: "error" });
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

onMounted(fetchDashboardData);
</script>

<template>
  <AppMain :title="`Department Governance — ${getDepartmentName(departmentId || '')}`">
    <div v-if="loading" class="flex items-center justify-center min-h-[50vh]">
      <Icon name="lucide:loader" class="animate-spin size-8 text-neutral-400" />
    </div>

    <div v-else class="space-y-8 max-w-5xl">
      <!-- Summary Stats -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 flex items-center justify-between shadow-sm">
          <div class="space-y-1">
            <p class="text-sm text-neutral-500 font-medium">Pending Folder Requests</p>
            <h3 class="text-3xl font-extrabold text-neutral-800 dark:text-white">{{ stats.pendingRequests }}</h3>
          </div>
          <div class="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl">
            <Icon name="lucide:folder-git" class="size-8" />
          </div>
        </div>

        <div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 flex items-center justify-between shadow-sm">
          <div class="space-y-1">
            <p class="text-sm text-neutral-500 font-medium">Department Members</p>
            <h3 class="text-3xl font-extrabold text-neutral-800 dark:text-white">{{ stats.deptUsers }}</h3>
          </div>
          <div class="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 rounded-2xl">
            <Icon name="lucide:users" class="size-8" />
          </div>
        </div>
      </div>

      <!-- Quick Actions / Navigation -->
      <section class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 space-y-4">
        <h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200">Quick Governance Tools</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <NuxtLink 
            to="/admin/nomenclature" 
            class="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800/80 rounded-2xl hover:border-indigo-500/40 hover:bg-indigo-500/5 transition text-center space-y-3"
          >
            <Icon name="lucide:tags" class="text-violet-500 size-8" />
            <div class="text-sm font-bold">Nomenclature Settings</div>
            <p class="text-xs text-neutral-500">Configure file naming rules for uploads</p>
          </NuxtLink>

          <NuxtLink 
            to="/dept-head/permissions" 
            class="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800/80 rounded-2xl hover:border-indigo-500/40 hover:bg-indigo-500/5 transition text-center space-y-3"
          >
            <Icon name="lucide:shield-check" class="text-emerald-500 size-8" />
            <div class="text-sm font-bold">Manage Permissions</div>
            <p class="text-xs text-neutral-500">Set role permissions & user overrides</p>
          </NuxtLink>

          <NuxtLink 
            to="/admin/folder-requests" 
            class="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800/80 rounded-2xl hover:border-indigo-500/40 hover:bg-indigo-500/5 transition text-center space-y-3"
          >
            <Icon name="lucide:folder-open" class="text-amber-500 size-8" />
            <div class="text-sm font-bold">Folder Requests</div>
            <p class="text-xs text-neutral-500">Review pending folder creations</p>
          </NuxtLink>
        </div>
      </section>

      <!-- Department Users & Leads -->
      <section class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 space-y-4">
        <h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200">Department Members</h2>
        
        <div class="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
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
                  <UBadge variant="soft" color="indigo" size="xs">
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
                  <span v-else class="text-xs text-indigo-400 font-semibold flex items-center justify-end gap-1">
                    <Icon name="lucide:check-circle" class="size-4" /> Team Lead
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </AppMain>
</template>
