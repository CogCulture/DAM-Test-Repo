<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useRoute } from "vue-router";
import { useRole } from "~/composables/useRole";
import { useToast } from "~/composables/useToast";
import { getRoleLabel } from "~~/shared/constants/roles";
import { getDepartmentName } from "~~/shared/constants/departments";

const { isAdmin, isDeptHead, departmentId: userDepartmentId } = useRole();
if (!isAdmin.value && !isDeptHead.value) {
  navigateTo("/");
}

const route = useRoute();
const toast = useToast();
const loading = ref(true);
const saving = ref(false);

const selectedDepartmentId = ref<string | null>((route.query.departmentId as string) || userDepartmentId.value || null);
const departments = ref<any[]>([]);

const roles = ["team_lead", "team_member", "guest"];
const rolePermissions = ref<any[]>([]);
const userOverrides = ref<any[]>([]);
const users = ref<any[]>([]);

const activeTab = ref(0);
const tabs = [
  { label: "Role Defaults", slot: "roles" },
  { label: "User Overrides", slot: "users" }
];

// Helper to resolve or initialize a permission object for a role
const getRolePerm = (roleKey: string) => {
  let p = rolePermissions.value.find(x => x.role === roleKey || (roleKey === "guest" && x.role === "intern"));
  if (p && roleKey === "guest" && p.role === "intern") {
    p.role = "guest";
  }
  if (!p) {
    p = {
      role: roleKey,
      canView: true,
      canUpload: true,
      canDownload: true,
      canDelete: false,
      canCreateFolder: false,
      canShare: false,
      canRename: false,
      canEditMetadata: false,
      canUseRag: false,
      maxCount: null
    };
    rolePermissions.value.push(p);
  }
  return p;
};

// Helper to resolve or initialize a permission override for a user
const getUserOverride = (userId: string) => {
  let o = userOverrides.value.find(x => x.userId === userId);
  if (!o) {
    o = {
      userId,
      canView: null,
      canUpload: null,
      canDownload: null,
      canDelete: null,
      canCreateFolder: null,
      canShare: null,
      canRename: null,
      canEditMetadata: null,
      canUseRag: null
    };
    userOverrides.value.push(o);
  }
  return o;
};

const fetchData = async () => {
  loading.value = true;
  try {
    const url = selectedDepartmentId.value
      ? `/api/dept-head/permissions?departmentId=${encodeURIComponent(selectedDepartmentId.value)}`
      : "/api/dept-head/permissions";

    const data: any = await $fetch(url);
    
    // Load and normalize role defaults
    rolePermissions.value = data.rolePermissions || [];
    // Load and normalize overrides
    userOverrides.value = data.userOverrides || [];
    // Load users
    users.value = data.users || [];
    departments.value = data.departments || [];

    if (data.targetDepartmentId) {
      selectedDepartmentId.value = data.targetDepartmentId;
    }
  } catch (e: any) {
    const isServerError = e?.statusCode === 500 || e?.status === 500 || e?.data?.statusCode === 500;
    const msg = isServerError ? "Unable to load permissions at this time." : (e?.data?.message || "Failed to load permissions");
    toast.add({ title: msg, color: "error" });
  } finally {
    loading.value = false;
  }
};

const savePermissions = async () => {
  saving.value = true;
  try {
    await $fetch("/api/dept-head/permissions", {
      method: "PUT",
      body: {
        departmentId: selectedDepartmentId.value,
        rolePermissions: rolePermissions.value,
        userOverrides: userOverrides.value
      }
    });
    toast.add({ title: "Permissions saved successfully", color: "success" });
    await fetchData();
  } catch (e: any) {
    toast.add({ title: e?.data?.message || "Failed to save permissions", color: "error" });
  } finally {
    saving.value = false;
  }
};

// Selection helper values
const getSelectValue = (val: boolean | null) => {
  if (val === null) return "inherit";
  return val ? "allow" : "deny";
};

const setSelectValue = (overrideObj: any, key: string, selectVal: string) => {
  if (selectVal === "inherit") {
    overrideObj[key] = null;
  } else {
    overrideObj[key] = selectVal === "allow";
  }
};

watch(selectedDepartmentId, () => {
  fetchData();
});

onMounted(fetchData);
</script>

<template>
  <AppMain :title="`Permissions — ${getDepartmentName(selectedDepartmentId || '')}`">
    <div v-if="loading && !departments.length" class="flex items-center justify-center min-h-[50vh]">
      <UIcon name="lucide:loader-2" class="animate-spin text-3xl text-neutral-400" />
    </div>

    <div v-else class="max-w-5xl mx-auto space-y-6">
      <!-- Header Actions & Admin Selector -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm">
        <div>
          <h2 class="text-lg font-semibold text-neutral-900 dark:text-white">Department Access Rights</h2>
          <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Configure role defaults and granular user overrides.</p>
        </div>

        <div class="flex items-center gap-3">
          <div v-if="isAdmin && departments.length > 0" class="flex items-center gap-2">
            <select
              v-model="selectedDepartmentId"
              class="bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option v-for="dept in departments" :key="dept.id" :value="dept.id">
                {{ dept.name }} ({{ dept.code }})
              </option>
            </select>
          </div>

          <UButton color="primary" variant="solid" :loading="saving" @click="savePermissions" icon="lucide:save">
            Save Changes
          </UButton>
        </div>
      </div>

      <UTabs :items="tabs" v-model:model-value="activeTab" class="w-full">
        <!-- Role Defaults Tab -->
        <template #roles>
          <div class="mt-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 space-y-4 shadow-sm">
            <h3 class="text-base font-bold text-neutral-900 dark:text-neutral-100 mb-1">Role Defaults</h3>
            <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-4">Set default permissions for each role. These settings apply to all department users unless overridden.</p>
            
            <div class="overflow-x-auto">
              <table class="w-full text-sm text-left border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                <thead class="bg-neutral-100 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 uppercase text-xs font-semibold border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th class="px-4 py-3">Role</th>
                    <th class="px-4 py-3 text-center">View</th>
                    <th class="px-4 py-3 text-center">Upload</th>
                    <th class="px-4 py-3 text-center">Download</th>
                    <th class="px-4 py-3 text-center">Delete</th>
                    <th class="px-4 py-3 text-center">Folder</th>
                    <th class="px-4 py-3 text-center">Share</th>
                    <th class="px-4 py-3 text-center">Rename</th>
                    <th class="px-4 py-3 text-center">Metadata</th>
                    <th class="px-4 py-3 text-center">RAG AI</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-neutral-200 dark:divide-neutral-800 bg-white dark:bg-neutral-900/40">
                  <tr v-for="r in roles" :key="r" class="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                    <td class="px-4 py-4 font-semibold text-neutral-900 dark:text-neutral-200">{{ getRoleLabel(r as any) }}</td>
                    <td class="px-4 py-4 text-center"><UCheckbox v-model="getRolePerm(r).canView" class="inline-block" /></td>
                    <td class="px-4 py-4 text-center"><UCheckbox v-model="getRolePerm(r).canUpload" class="inline-block" /></td>
                    <td class="px-4 py-4 text-center"><UCheckbox v-model="getRolePerm(r).canDownload" class="inline-block" /></td>
                    <td class="px-4 py-4 text-center"><UCheckbox v-model="getRolePerm(r).canDelete" class="inline-block" /></td>
                    <td class="px-4 py-4 text-center"><UCheckbox v-model="getRolePerm(r).canCreateFolder" class="inline-block" /></td>
                    <td class="px-4 py-4 text-center"><UCheckbox v-model="getRolePerm(r).canShare" class="inline-block" /></td>
                    <td class="px-4 py-4 text-center"><UCheckbox v-model="getRolePerm(r).canRename" class="inline-block" /></td>
                    <td class="px-4 py-4 text-center"><UCheckbox v-model="getRolePerm(r).canEditMetadata" class="inline-block" /></td>
                    <td class="px-4 py-4 text-center"><UCheckbox v-model="getRolePerm(r).canUseRag" class="inline-block" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>

        <!-- User Overrides Tab -->
        <template #users>
          <div class="mt-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 space-y-4 shadow-sm">
            <h3 class="text-base font-bold text-neutral-900 dark:text-neutral-100 mb-1">User Permission Overrides</h3>
            <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-4">Override role permissions for specific users. "Inherit" uses the role-level defaults set above.</p>
            
            <div v-if="users.length > 0" class="overflow-x-auto">
              <table class="w-full text-sm text-left border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                <thead class="bg-neutral-100 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 uppercase text-xs font-semibold border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th class="px-4 py-3">Member</th>
                    <th class="px-4 py-3">Role</th>
                    <th class="px-4 py-3 text-center">View</th>
                    <th class="px-4 py-3">Upload</th>
                    <th class="px-4 py-3">Download</th>
                    <th class="px-4 py-3">Delete</th>
                    <th class="px-4 py-3">Folder</th>
                    <th class="px-4 py-3">Share</th>
                    <th class="px-4 py-3">Rename</th>
                    <th class="px-4 py-3">Metadata</th>
                    <th class="px-4 py-3">RAG AI</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-neutral-200 dark:divide-neutral-800 bg-white dark:bg-neutral-900/40">
                  <tr v-for="u in users.filter(x => x.role !== 'dept_head')" :key="u.id" class="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                    <td class="px-4 py-3 flex items-center space-x-2">
                      <UAvatar :src="u.avatar ?? undefined" :alt="u.name" size="sm" />
                      <div>
                        <p class="font-medium text-neutral-900 dark:text-neutral-200">{{ u.name }}</p>
                        <p class="text-[10px] text-neutral-500">{{ u.email }}</p>
                      </div>
                    </td>
                    
                    <td class="px-4 py-3 text-xs text-neutral-500 font-semibold">{{ getRoleLabel(u.role) }}</td>
                    
                    <td class="px-3 py-3">
                      <select :value="getSelectValue(getUserOverride(u.id).canView)" @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canView', e.target.value)" class="bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-900 dark:text-white focus:outline-none">
                        <option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option>
                      </select>
                    </td>

                    <td class="px-3 py-3">
                      <select :value="getSelectValue(getUserOverride(u.id).canUpload)" @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canUpload', e.target.value)" class="bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-900 dark:text-white focus:outline-none">
                        <option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option>
                      </select>
                    </td>

                    <td class="px-3 py-3">
                      <select :value="getSelectValue(getUserOverride(u.id).canDownload)" @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canDownload', e.target.value)" class="bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-900 dark:text-white focus:outline-none">
                        <option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option>
                      </select>
                    </td>

                    <td class="px-3 py-3">
                      <select :value="getSelectValue(getUserOverride(u.id).canDelete)" @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canDelete', e.target.value)" class="bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-900 dark:text-white focus:outline-none">
                        <option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option>
                      </select>
                    </td>

                    <td class="px-3 py-3">
                      <select :value="getSelectValue(getUserOverride(u.id).canCreateFolder)" @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canCreateFolder', e.target.value)" class="bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-900 dark:text-white focus:outline-none">
                        <option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option>
                      </select>
                    </td>

                    <td class="px-3 py-3">
                      <select :value="getSelectValue(getUserOverride(u.id).canShare)" @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canShare', e.target.value)" class="bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-900 dark:text-white focus:outline-none">
                        <option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option>
                      </select>
                    </td>

                    <td class="px-3 py-3">
                      <select :value="getSelectValue(getUserOverride(u.id).canRename)" @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canRename', e.target.value)" class="bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-900 dark:text-white focus:outline-none">
                        <option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option>
                      </select>
                    </td>

                    <td class="px-3 py-3">
                      <select :value="getSelectValue(getUserOverride(u.id).canEditMetadata)" @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canEditMetadata', e.target.value)" class="bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-900 dark:text-white focus:outline-none">
                        <option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option>
                      </select>
                    </td>

                    <td class="px-3 py-3">
                      <select :value="getSelectValue(getUserOverride(u.id).canUseRag)" @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canUseRag', e.target.value)" class="bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-900 dark:text-white focus:outline-none">
                        <option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option>
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else class="text-center py-8 text-neutral-400">
              <p>No members found in this department to override.</p>
            </div>
          </div>
        </template>
      </UTabs>
    </div>
  </AppMain>
</template>
