<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRole } from "~/composables/useRole";
import { useToast } from "~/composables/useToast";
import { getRoleLabel } from "~~/shared/constants/roles";
import { getDepartmentName } from "~~/shared/constants/departments";

const { isDeptHead, departmentId } = useRole();
if (!isDeptHead.value) {
  navigateTo("/");
}

const toast = useToast();
const loading = ref(true);
const saving = ref(false);

const roles = ["team_lead", "team_member", "intern"];
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
  let p = rolePermissions.value.find(x => x.role === roleKey);
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
    const data: any = await $fetch("/api/dept-head/permissions");
    
    // Load and normalize role defaults
    rolePermissions.value = data.rolePermissions || [];
    // Load and normalize overrides
    userOverrides.value = data.userOverrides || [];
    // Load users
    users.value = data.users || [];
  } catch (e) {
    toast.add({ title: "Failed to load permissions", color: "error" });
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

onMounted(fetchData);
</script>

<template>
  <AppMain :title="`Permissions — ${getDepartmentName(departmentId || '')}`">
    <div v-if="loading" class="flex items-center justify-center min-h-[50vh]">
      <Icon name="lucide:loader" class="animate-spin size-8 text-neutral-400" />
    </div>

    <div v-else class="max-w-5xl mx-auto space-y-6 text-white font-sans">
      <div class="flex justify-between items-center">
        <p class="text-sm text-neutral-400">Configure access rights and fine-grained overrides for your team.</p>
        <UButton color="primary" variant="solid" :loading="saving" @click="savePermissions" icon="lucide:save">
          Save Changes
        </UButton>
      </div>

      <UTabs :items="tabs" v-model:model-value="activeTab" class="w-full">
        <!-- Role Defaults Tab -->
        <template #roles>
          <div class="mt-6 bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 class="text-base font-bold text-neutral-100 mb-2">Role Defaults</h3>
            <p class="text-xs text-neutral-400 mb-4">Set default permissions for each role. These settings apply to all users unless they have a custom override.</p>
            
            <div class="overflow-x-auto">
              <table class="w-full text-sm text-left border border-slate-800 rounded-xl overflow-hidden">
                <thead class="bg-slate-950 text-neutral-300 uppercase text-xs font-semibold border-b border-slate-800">
                  <tr>
                    <th class="px-4 py-3">Role</th>
                    <th class="px-4 py-3 text-center">View</th>
                    <th class="px-4 py-3 text-center">Upload</th>
                    <th class="px-4 py-3 text-center">Download</th>
                    <th class="px-4 py-3 text-center">Delete</th>
                    <th class="px-4 py-3 text-center">Create Folder</th>
                    <th class="px-4 py-3 text-center">Share</th>
                    <th class="px-4 py-3 text-center">Rename</th>
                    <th class="px-4 py-3 text-center">Metadata</th>
                    <th class="px-4 py-3 text-center">RAG</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-800 bg-slate-900/20">
                  <tr v-for="r in roles" :key="r" class="hover:bg-slate-800/30">
                    <td class="px-4 py-4 font-semibold text-slate-200">{{ getRoleLabel(r as any) }}</td>
                    <td class="px-4 py-4 text-center"><UCheckbox v-model="getRolePerm(r).canView" class="inline-block" /></td>
                    
                    <td class="px-4 py-4 text-center">
                      <UCheckbox v-model="getRolePerm(r).canUpload" class="inline-block" />
                    </td>
                    <td class="px-4 py-4 text-center">
                      <UCheckbox v-model="getRolePerm(r).canDownload" class="inline-block" />
                    </td>
                    <td class="px-4 py-4 text-center">
                      <UCheckbox v-model="getRolePerm(r).canDelete" class="inline-block" />
                    </td>
                    <td class="px-4 py-4 text-center">
                      <UCheckbox v-model="getRolePerm(r).canCreateFolder" class="inline-block" />
                    </td>
                    <td class="px-4 py-4 text-center">
                      <UCheckbox v-model="getRolePerm(r).canShare" class="inline-block" />
                    </td>
                    <td class="px-4 py-4 text-center">
                      <UCheckbox v-model="getRolePerm(r).canRename" class="inline-block" />
                    </td>                    <td class="px-4 py-4 text-center"><UCheckbox v-model="getRolePerm(r).canEditMetadata" class="inline-block" /></td>
                    <td class="px-4 py-4 text-center"><UCheckbox v-model="getRolePerm(r).canUseRag" class="inline-block" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>

        <!-- User Overrides Tab -->
        <template #users>
          <div class="mt-6 bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 class="text-base font-bold text-neutral-100 mb-2">User Permission Overrides</h3>
            <p class="text-xs text-neutral-400 mb-4">Override role permissions for specific users. "Inherit" uses the role-level defaults set above.</p>
            
            <div class="overflow-x-auto">
              <table class="w-full text-sm text-left border border-slate-800 rounded-xl overflow-hidden">
                <thead class="bg-slate-950 text-neutral-300 uppercase text-xs font-semibold border-b border-slate-800">
                  <tr>
                    <th class="px-4 py-3">Member</th>
                    <th class="px-4 py-3">Role</th>
                    <th class="px-4 py-3 text-center">View</th>
                    <th class="px-4 py-3">Upload</th>
                    <th class="px-4 py-3">Download</th>
                    <th class="px-4 py-3">Delete</th>
                    <th class="px-4 py-3">Create Folder</th>
                    <th class="px-4 py-3">Share</th>
                    <th class="px-4 py-3">Rename</th>
                    <th class="px-4 py-3">Metadata</th>
                    <th class="px-4 py-3">RAG</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-800 bg-slate-900/20">
                  <tr v-for="u in users.filter(x => x.role !== 'dept_head')" :key="u.id" class="hover:bg-slate-800/30">
                    <td class="px-4 py-3 flex items-center space-x-2">
                      <UAvatar :src="u.avatar ?? undefined" :alt="u.name" size="sm" />
                      <div>
                        <p class="font-medium text-slate-200">{{ u.name }}</p>
                        <p class="text-[10px] text-slate-400">{{ u.email }}</p>
                      </div>
                    </td>
                    
                    <td class="px-4 py-3 text-xs text-slate-400 font-semibold">{{ getRoleLabel(u.role) }}</td>
                    <td class="px-4 py-3">
                      <select :value="getSelectValue(getUserOverride(u.id).canView)" @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canView', e.target.value)" class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none">
                        <option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option>
                      </select>
                    </td>
                    
                    <td class="px-4 py-3">
                      <select 
                        :value="getSelectValue(getUserOverride(u.id).canUpload)"
                        @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canUpload', e.target.value)"
                        class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                      >
                        <option value="inherit">Inherit</option>
                        <option value="allow">Allow</option>
                        <option value="deny">Deny</option>
                      </select>
                    </td>

                    <td class="px-4 py-3">
                      <select 
                        :value="getSelectValue(getUserOverride(u.id).canDownload)"
                        @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canDownload', e.target.value)"
                        class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                      >
                        <option value="inherit">Inherit</option>
                        <option value="allow">Allow</option>
                        <option value="deny">Deny</option>
                      </select>
                    </td>

                    <td class="px-4 py-3">
                      <select 
                        :value="getSelectValue(getUserOverride(u.id).canDelete)"
                        @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canDelete', e.target.value)"
                        class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                      >
                        <option value="inherit">Inherit</option>
                        <option value="allow">Allow</option>
                        <option value="deny">Deny</option>
                      </select>
                    </td>

                    <td class="px-4 py-3">
                      <select 
                        :value="getSelectValue(getUserOverride(u.id).canCreateFolder)"
                        @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canCreateFolder', e.target.value)"
                        class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                      >
                        <option value="inherit">Inherit</option>
                        <option value="allow">Allow</option>
                        <option value="deny">Deny</option>
                      </select>
                    </td>

                    <td class="px-4 py-3">
                      <select 
                        :value="getSelectValue(getUserOverride(u.id).canShare)"
                        @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canShare', e.target.value)"
                        class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                      >
                        <option value="inherit">Inherit</option>
                        <option value="allow">Allow</option>
                        <option value="deny">Deny</option>
                      </select>
                    </td>

                    <td class="px-4 py-3">
                      <select 
                        :value="getSelectValue(getUserOverride(u.id).canRename)"
                        @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canRename', e.target.value)"
                        class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                      >
                        <option value="inherit">Inherit</option>
                        <option value="allow">Allow</option>
                        <option value="deny">Deny</option>
                      </select>
                    </td>
                    <td class="px-4 py-3">
                      <select :value="getSelectValue(getUserOverride(u.id).canEditMetadata)" @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canEditMetadata', e.target.value)" class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none">
                        <option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option>
                      </select>
                    </td>
                    <td class="px-4 py-3">
                      <select :value="getSelectValue(getUserOverride(u.id).canUseRag)" @change="(e: any) => setSelectValue(getUserOverride(u.id), 'canUseRag', e.target.value)" class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none">
                        <option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option>
                      </select>
                    </td>

                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </UTabs>
    </div>
  </AppMain>
</template>
