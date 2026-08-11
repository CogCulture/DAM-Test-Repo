<script setup lang="ts">
import { ref, onMounted } from "vue";

const { isAdmin } = useRole();
if (!isAdmin.value) {
  navigateTo("/");
}

const { fetch: fetchSession } = useUserSession();

const toast = useToast();
const loading = ref(false);
const saving = ref(false);
const savingGDrive = ref(false);

// Feature flags from Super Admin
const features = ref({
  nomenclature: true,
  hierarchy: true,
  userPermissions: true,
  templateFolders: true,
});
const orgType = ref<"s3" | "gdrive">("s3");

// GDrive governance rules (only relevant when orgType === 'gdrive')
const gdriveRules = ref({
  enforceNomenclature: false,
  enforceHierarchy: false,
  allowInterDeptVisibility: true,
});

// Form state
const orgName = ref("");
const departments = ref<{ id: string; name: string; parentId: string | null }[]>([]);
const permissions = ref<{
  id?: string;
  departmentId?: string;
  role: string;
  maxCount: number | null;
  canView: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canDelete: boolean;
  canCreateFolder: boolean;
  canApproveUsers: boolean;
  canEditNomenclature: boolean;
  canShare: boolean;
  canRename: boolean;
  canEditMetadata: boolean;
  canUseRag: boolean;
}[]>([]);

// Selection for permissions override
const selectedDeptId = ref<string>("global");

const customRoles = ref<string[]>([]);
const newRoleName = ref("");

// Fetch settings
const fetchSettings = async () => {
  loading.value = true;
  try {
    const data: any = await $fetch("/api/organizations/settings");
    orgName.value = data.name;
    departments.value = data.departments;
    permissions.value = data.permissions;
    features.value = data.features ?? features.value;
    orgType.value = data.orgType ?? "s3";
    if (data.gdriveRules) {
      gdriveRules.value = {
        enforceNomenclature: !!data.gdriveRules.enforceNomenclature,
        enforceHierarchy: !!data.gdriveRules.enforceHierarchy,
        allowInterDeptVisibility: data.gdriveRules.allowInterDeptVisibility !== false,
      };
    }

    // Extract custom roles
    const defaults = ["admin", "dept_head", "team_lead", "team_member", "intern"];
    const foundCustom = data.permissions
      .map((p: any) => p.role)
      .filter((r: string) => !defaults.includes(r));
    customRoles.value = Array.from(new Set(foundCustom)) as string[];
  } catch (e: any) {
    toast.add({ title: "Failed to load settings", color: "error" });
  } finally {
    loading.value = false;
  }
};

onMounted(fetchSettings);

// Department hierarchy management
const newDeptName = ref("");
const newDeptParentId = ref<string | null>(null);

const addDepartment = () => {
  if (!newDeptName.value.trim()) return;
  const id = `dept_${Date.now()}`;
  departments.value.push({
    id,
    name: newDeptName.value.trim(),
    parentId: newDeptParentId.value || null,
  });
  newDeptName.value = "";
  newDeptParentId.value = null;
};

const deleteDepartment = (id: string) => {
  // Remove department and orphan child nodes or link them to root
  departments.value = departments.value.filter((d) => d.id !== id).map((d) => {
    if (d.parentId === id) {
      return { ...d, parentId: null };
    }
    return d;
  });
  // Switch selectedDeptId back to global if deleted
  if (selectedDeptId.value === id) {
    selectedDeptId.value = "global";
  }
};

const getRolePermissionsForSelected = (role: string) => {
  // Try to find existing permission for selectedDeptId and role
  let p = permissions.value.find((perm) => perm.role === role && (perm.departmentId || "global") === selectedDeptId.value);
  if (!p) {
    // If it's a department override and doesn't exist, we can initialize it with the global permission values
    const globalP = permissions.value.find((perm) => perm.role === role && (perm.departmentId || "global") === "global");
    p = {
      role,
      departmentId: selectedDeptId.value,
      maxCount: null,
      canView: globalP ? globalP.canView : true,
      canUpload: globalP ? globalP.canUpload : true,
      canDownload: globalP ? globalP.canDownload : true,
      canDelete: globalP ? globalP.canDelete : false,
      canCreateFolder: globalP ? globalP.canCreateFolder : false,
      canApproveUsers: globalP ? globalP.canApproveUsers : false,
      canEditNomenclature: globalP ? globalP.canEditNomenclature : false,
      canShare: globalP ? globalP.canShare : false,
      canRename: globalP ? globalP.canRename : false,
      canEditMetadata: globalP ? globalP.canEditMetadata : false,
      canUseRag: globalP ? globalP.canUseRag : false,
    };
    permissions.value.push(p);
  }
  return p;
};

const addCustomRole = () => {
  const roleName = newRoleName.value.trim();
  if (!roleName) return;
  const defaults = ["admin", "dept_head", "team_lead", "team_member", "intern"];
  if (defaults.includes(roleName.toLowerCase())) {
    toast.add({ title: "Cannot add default role names", color: "error" });
    return;
  }
  if (customRoles.value.includes(roleName)) {
    toast.add({ title: "Role already exists", color: "error" });
    return;
  }

  customRoles.value.push(roleName);

  // Pre-populate global configuration for this role
  permissions.value.push({
    role: roleName,
    departmentId: "global",
    maxCount: null,
    canView: true,
    canUpload: true,
    canDownload: true,
    canDelete: false,
    canCreateFolder: false,
    canApproveUsers: false,
    canEditNomenclature: false,
    canShare: false,
    canRename: false,
    canEditMetadata: false,
    canUseRag: false,
  });

  newRoleName.value = "";
  toast.add({ title: `Role "${roleName}" added. Save to persist.`, color: "success" });
};

const deleteCustomRole = (roleName: string) => {
  customRoles.value = customRoles.value.filter((r) => r !== roleName);
  permissions.value = permissions.value.filter((p) => p.role !== roleName);
  toast.add({ title: `Role "${roleName}" deleted. Save to persist.`, color: "success" });
};

const allAvailableRoles = computed(() => {
  return ["dept_head", "team_lead", "team_member", "intern", ...customRoles.value];
});

const saveSettings = async () => {
  saving.value = true;
  try {
    // Clean up empty or unnecessary overrides before saving if desired, or keep them.
    // Let's filter or clean up permissions if needed.
    await $fetch("/api/organizations/settings", {
      method: "PUT",
      body: {
        name: orgName.value,
        departments: departments.value,
        permissions: permissions.value,
      },
    });
    toast.add({ title: "Settings saved successfully", color: "success" });
    const refreshTrigger = useState("files-refresh-trigger", () => 0);
    refreshTrigger.value++;
    try {
      await $fetch("/api/auth/refresh", { method: "POST" });
      await fetchSession();
    } catch (sessionErr) {
      console.error("Failed to refresh admin session:", sessionErr);
    }
    await fetchSettings();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error saving settings", color: "error" });
  } finally {
    saving.value = false;
  }
};

const saveGDriveRules = async () => {
  savingGDrive.value = true;
  try {
    await $fetch("/api/organizations/gdrive-rules", {
      method: "PUT",
      body: gdriveRules.value,
    });
    toast.add({ title: "Google Drive governance rules saved", color: "success" });
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error saving GDrive rules", color: "error" });
  } finally {
    savingGDrive.value = false;
  }
};

const roleLabelMap: Record<string, string> = {
  dept_head: "Department Head",
  team_lead: "Team Lead",
  team_member: "Team Member",
  intern: "Intern",
};
</script>

<template>
  <AppMain title="Organization Settings">
    <div v-if="loading" class="flex items-center justify-center min-h-[50vh]">
      <Icon name="lucide:loader" class="animate-spin size-8 text-neutral-400" />
    </div>

    <div v-else class="space-y-8 max-w-5xl">
      <!-- Org Name -->
      <section class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 space-y-4">
        <h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
          <Icon name="lucide:building" class="text-primary size-5" />
          General Information
        </h2>
        <div class="max-w-md">
          <UFormField label="Organization Name">
            <UInput v-model="orgName" placeholder="Enter organization name" class="w-full" />
          </UFormField>
        </div>
      </section>

      <!-- Departments & Hierarchy -->
      <section class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 space-y-6 relative">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
            <Icon name="lucide:network" class="text-primary size-5" />
            Departments & Hierarchy
          </h2>
          <span v-if="!features.hierarchy" class="flex items-center gap-1.5 text-xs font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
            <Icon name="lucide:lock" class="w-3 h-3" />
            Locked by Super Admin
          </span>
        </div>

        <!-- Locked overlay -->
        <div v-if="!features.hierarchy" class="text-center py-10 text-neutral-500">
          <Icon name="lucide:lock" class="w-10 h-10 mx-auto mb-3 text-neutral-600" />
          <p class="font-medium text-neutral-400">Department management is disabled for this organization</p>
          <p class="text-sm mt-1">Contact your platform administrator to enable this feature.</p>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <!-- Add Department -->
          <div class="space-y-4 bg-neutral-50 dark:bg-neutral-950 p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg">
            <h3 class="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Add Department / Sub-team</h3>
            <div class="space-y-4">
              <UFormField label="Department Name">
                <UInput v-model="newDeptName" placeholder="e.g. Graphic Team" class="w-full" />
              </UFormField>
              
              <UFormField label="Works Under (Parent Department)">
                <select
                  v-model="newDeptParentId"
                  class="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option :value="null">None (Top Level)</option>
                  <option v-for="dept in departments" :key="dept.id" :value="dept.id">
                    {{ dept.name }}
                  </option>
                </select>
              </UFormField>

              <UButton color="primary" variant="solid" @click="addDepartment" icon="lucide:plus">
                Add Team
              </UButton>
            </div>
          </div>

          <!-- Departments List & Hierarchies -->
          <div class="space-y-4">
            <h3 class="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Current Departments</h3>
            <div class="border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-200 dark:divide-neutral-800 max-h-[300px] overflow-y-auto">
              <div v-if="departments.length === 0" class="p-4 text-center text-sm text-neutral-500">
                No departments configured.
              </div>
              <div
                v-for="dept in departments"
                :key="dept.id"
                class="flex items-center justify-between p-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-950 cursor-pointer"
                :class="selectedDeptId === dept.id ? 'bg-primary-50/50 dark:bg-primary-950/20' : ''"
                @click="selectedDeptId = dept.id"
              >
                <div>
                  <span class="font-medium text-neutral-800 dark:text-neutral-200">{{ dept.name }}</span>
                  <span
                    v-if="dept.parentId"
                    class="ml-2 text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-500 px-2 py-0.5 rounded-full"
                  >
                    under {{ departments.find(d => d.id === dept.parentId)?.name || 'Parent' }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span v-if="selectedDeptId === dept.id" class="text-xs text-primary font-medium">Selected</span>
                  <UButton
                    color="error"
                    variant="ghost"
                    icon="lucide:trash"
                    @click.stop="deleteDepartment(dept.id)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Custom Permissions Matrix -->
      <section class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 space-y-4 overflow-hidden">
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-neutral-100 dark:border-neutral-850 pb-4">
          <h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
            <Icon name="lucide:shield-alert" class="text-primary size-5" />
            Role & Capacity Settings
          </h2>
          <!-- Selection dropdown for Global vs Specific Department and Add Custom Role -->
          <div class="flex flex-wrap items-center gap-4">
            <!-- Add Custom Role -->
            <div class="flex items-center gap-2">
              <UInput
                v-model="newRoleName"
                placeholder="New Custom Role Name"
                size="sm"
                class="w-48"
                @keydown.enter="addCustomRole"
              />
              <UButton
                color="primary"
                variant="solid"
                size="sm"
                icon="lucide:plus"
                @click="addCustomRole"
              >
                Add Role
              </UButton>
            </div>
            <!-- Scope selection -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-neutral-500 dark:text-neutral-450 font-medium">Scope:</span>
              <select
                v-model="selectedDeptId"
                class="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="global">Global Defaults (All Departments)</option>
                <option v-for="dept in departments" :key="dept.id" :value="dept.id">
                  Department: {{ dept.name }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <p class="text-xs text-neutral-500 dark:text-neutral-450">
          Showing role configuration and permissions overrides for:
          <strong class="text-neutral-700 dark:text-neutral-300">
            {{ selectedDeptId === 'global' ? 'Global Defaults' : (departments.find(d => d.id === selectedDeptId)?.name || selectedDeptId) }}
          </strong>
        </p>

        <div class="overflow-x-auto w-full">
          <table class="w-full text-sm text-left border border-neutral-200 dark:border-neutral-800">
            <thead class="bg-neutral-50 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 uppercase text-xs font-semibold border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th class="px-4 py-3">Role</th>
                <th class="px-4 py-3 text-center w-28">Max Capacity</th>
                <th class="px-4 py-3 text-center">View</th>
                <th class="px-4 py-3 text-center">Upload</th>
                <th class="px-4 py-3 text-center">Download</th>
                <th class="px-4 py-3 text-center">Delete</th>
                <th class="px-4 py-3 text-center">Create Folder</th>
                <th class="px-4 py-3 text-center">Approve Users</th>
                <th class="px-4 py-3 text-center">Nomenclature</th>
                <th class="px-4 py-3 text-center">Share</th>
                <th class="px-4 py-3 text-center">Rename</th>
                <th class="px-4 py-3 text-center">Metadata</th>
                <th class="px-4 py-3 text-center">RAG</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-200 dark:divide-neutral-800">
              <tr v-for="roleKey in allAvailableRoles" :key="roleKey" class="hover:bg-neutral-50/50 dark:hover:bg-neutral-950/50">
                <td class="px-4 py-3.5 font-medium text-neutral-800 dark:text-neutral-200 flex items-center justify-between gap-2">
                  <span>{{ roleLabelMap[roleKey] || roleKey }}</span>
                  <UButton
                    v-if="!['dept_head', 'team_lead', 'team_member', 'intern'].includes(roleKey)"
                    color="error"
                    variant="ghost"
                    icon="lucide:trash"
                    size="xs"
                    @click="deleteCustomRole(roleKey)"
                  />
                </td>
                <td class="px-4 py-3.5 text-center">
                  <UInput
                    v-model="getRolePermissionsForSelected(roleKey).maxCount"
                    type="number"
                    placeholder="Unlimited"
                    size="sm"
                    class="w-full text-center"
                  />
                </td>
                <td class="px-4 py-3.5 text-center">
                  <UCheckbox v-model="getRolePermissionsForSelected(roleKey).canView" class="inline-block" />
                </td>                <td class="px-4 py-3.5 text-center">
                  <UCheckbox v-model="getRolePermissionsForSelected(roleKey).canUpload" class="inline-block" />
                </td>
                <td class="px-4 py-3.5 text-center">
                  <UCheckbox v-model="getRolePermissionsForSelected(roleKey).canDownload" class="inline-block" />
                </td>
                <td class="px-4 py-3.5 text-center">
                  <UCheckbox v-model="getRolePermissionsForSelected(roleKey).canDelete" class="inline-block" />
                </td>
                <td class="px-4 py-3.5 text-center">
                  <UCheckbox v-model="getRolePermissionsForSelected(roleKey).canCreateFolder" class="inline-block" />
                </td>
                <td class="px-4 py-3.5 text-center">
                  <UCheckbox v-model="getRolePermissionsForSelected(roleKey).canApproveUsers" class="inline-block" />
                </td>
                <td class="px-4 py-3.5 text-center">
                  <UCheckbox v-model="getRolePermissionsForSelected(roleKey).canEditNomenclature" class="inline-block" />
                </td>
                <td class="px-4 py-3.5 text-center">
                  <UCheckbox v-model="getRolePermissionsForSelected(roleKey).canShare" class="inline-block" />
                </td>                <td class="px-4 py-3.5 text-center">
                  <UCheckbox v-model="getRolePermissionsForSelected(roleKey).canRename" class="inline-block" />
                </td>
                <td class="px-4 py-3.5 text-center">
                  <UCheckbox v-model="getRolePermissionsForSelected(roleKey).canEditMetadata" class="inline-block" />
                </td>
                <td class="px-4 py-3.5 text-center">
                  <UCheckbox v-model="getRolePermissionsForSelected(roleKey).canUseRag" class="inline-block" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Save Button -->
      <div class="flex justify-end pt-4">
        <UButton color="primary" variant="solid" size="lg" :loading="saving" @click="saveSettings" icon="lucide:save">
          Save Settings
        </UButton>
      </div>

      <!-- GDrive Governance Section (only shown for GDrive orgs) -->
      <section v-if="orgType === 'gdrive'" class="bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-900/50 rounded-xl p-6 space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
              <Icon name="lucide:hard-drive" class="text-blue-500 size-5" />
              Google Drive Governance
            </h2>
            <p class="text-sm text-neutral-500 mt-1">
              Enforce organization-wide rules on top of your Google Drive storage.
            </p>
          </div>
          <span class="text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
            GDrive Org
          </span>
        </div>

        <div class="space-y-4">
          <!-- Nomenclature Enforcement -->
          <div class="flex items-start justify-between gap-4 p-4 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <Icon name="lucide:text-cursor-input" class="text-violet-400 size-4" />
                <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Enforce Nomenclature</h3>
              </div>
              <p class="text-xs text-neutral-500">
                When enabled, all uploaded files must follow the department's nomenclature template (e.g. <span class="font-mono">Brand_Campaign_Channel</span>). Files with non-conforming names will be rejected.
              </p>
              <p v-if="!features.nomenclature" class="text-xs text-amber-500 mt-1 flex items-center gap-1">
                <Icon name="lucide:lock" class="size-3" /> Nomenclature feature is disabled by Super Admin.
              </p>
            </div>
            <UToggle
              v-model="gdriveRules.enforceNomenclature"
              :disabled="!features.nomenclature"
              color="primary"
            />
          </div>

          <!-- Hierarchy Enforcement -->
          <div class="flex items-start justify-between gap-4 p-4 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <Icon name="lucide:network" class="text-green-400 size-4" />
                <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Enforce Folder Hierarchy</h3>
              </div>
              <p class="text-xs text-neutral-500">
                When enabled, non-admin users cannot create top-level department folders. Only organization admins can create department-level folders at the root. All other users must create folders inside their assigned department.
              </p>
              <p v-if="!features.hierarchy" class="text-xs text-amber-500 mt-1 flex items-center gap-1">
                <Icon name="lucide:lock" class="size-3" /> Hierarchy feature is disabled by Super Admin.
              </p>
            </div>
            <UToggle
              v-model="gdriveRules.enforceHierarchy"
              :disabled="!features.hierarchy"
              color="primary"
            />
          </div>

          <!-- Inter-Department Visibility -->
          <div class="flex items-start justify-between gap-4 p-4 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <Icon name="lucide:eye" class="text-amber-400 size-4" />
                <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Allow Inter-Department Visibility</h3>
              </div>
              <p class="text-xs text-neutral-500">
                When enabled (default), all users can see all department folders at the root. When disabled, users only see their own department's folder, keeping cross-team files private.
              </p>
            </div>
            <UToggle
              v-model="gdriveRules.allowInterDeptVisibility"
              color="primary"
            />
          </div>
        </div>

        <!-- Save GDrive Rules -->
        <div class="flex justify-end pt-2">
          <UButton
            color="primary"
            variant="solid"
            :loading="savingGDrive"
            @click="saveGDriveRules"
            icon="lucide:shield-check"
          >
            Save Governance Rules
          </UButton>
        </div>
      </section>
    </div>
  </AppMain>
</template>
