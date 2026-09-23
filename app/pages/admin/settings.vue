<script setup lang="ts">
import { ref, onMounted, withKeys, withModifiers } from "vue";
import { useRole } from "~/composables/useRole";
import { useToast } from "~/composables/useToast";

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

const handleRoleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addCustomRole();
  }
};

// Fetch settings
const fetchSettings = async () => {
  loading.value = true;
  try {
    const data: any = await $fetch("/api/organizations/settings");
    orgName.value = data.name;
    departments.value = data.departments;
    permissions.value = data.permissions;
    const defaultFeatures = { nomenclature: true, hierarchy: true, userPermissions: true, templateFolders: true };
    let fetchedFeatures = data.features;
    if (typeof fetchedFeatures === "string") {
      try { fetchedFeatures = JSON.parse(fetchedFeatures); } catch { fetchedFeatures = null; }
    }
    features.value = {
      ...defaultFeatures,
      ...(fetchedFeatures || {}),
    };
    orgType.value = data.orgType ?? "s3";
    if (data.gdriveRules) {
      gdriveRules.value = {
        enforceNomenclature: !!data.gdriveRules.enforceNomenclature,
        enforceHierarchy: !!data.gdriveRules.enforceHierarchy,
        allowInterDeptVisibility: data.gdriveRules.allowInterDeptVisibility !== false,
      };
    }

    // Extract custom roles
    const defaults = ["admin", "dept_head", "team_lead", "team_member", "guest", "intern"];
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

const route = useRoute();
const activeTab = ref<"org" | "users">((route.query.tab as any) === "users" ? "users" : "org");

// User-level Access Control State
const userSearch = ref("");
const selectedUserId = ref("");
const usersList = ref<any[]>([]);
const userOverrides = ref<any[]>([]);
const userGrants = ref<any[]>([]);
const savingUserAccess = ref(false);

const permissionDefinitions = [
  { key: "canView", label: "View and browse", icon: "lucide:eye" },
  { key: "canDownload", label: "Download", icon: "lucide:download" },
  { key: "canUpload", label: "Upload", icon: "lucide:upload" },
  { key: "canCreateFolder", label: "Create folders", icon: "lucide:folder-plus" },
  { key: "canRename", label: "Rename", icon: "lucide:pencil" },
  { key: "canDelete", label: "Delete", icon: "lucide:trash-2" },
  { key: "canShare", label: "Share and publish", icon: "lucide:share-2" },
  { key: "canEditMetadata", label: "Edit metadata", icon: "lucide:tags" },
  { key: "canUseRag", label: "Run RAG processing", icon: "lucide:bot" },
];

const selectedUser = computed(() => (usersList.value || []).find((u) => u && u.id === selectedUserId.value));
const filteredUsers = computed(() => {
  const q = userSearch.value.trim().toLowerCase();
  return (usersList.value || []).filter((u) => u && u.role !== "admin" && (!q ||
    (u.name && u.name.toLowerCase().includes(q)) || (u.email && u.email.toLowerCase().includes(q))));
});

const userForm = ref({ permissions: {} as Record<string, boolean | null>, allDepartmentAccess: false, departmentIds: [] as string[] });

const roleDefault = (key: string) => {
  const u = selectedUser.value;
  if (!u) return false;
  const deptP = (permissions.value || []).find((p) => p && p.role === u.role && p.departmentId === u.departmentId);
  const globalP = (permissions.value || []).find((p) => p && p.role === u.role && (p.departmentId || "global") === "global");
  return deptP?.[key] ?? globalP?.[key] ?? false;
};

const effectiveUserValue = (key: string) => userForm.value.permissions[key] ?? roleDefault(key);
const deptName = (id?: string) => (departments.value || []).find((d) => d && d.id === id)?.name || "Unassigned";
const availableDepartments = computed(() => (departments.value || []).filter((d) => d && d.id !== selectedUser.value?.departmentId));

const selectUser = (userId: string) => {
  selectedUserId.value = userId;
  const override = (userOverrides.value || []).find((item) => item && item.userId === userId);
  userForm.value = {
    permissions: Object.fromEntries(permissionDefinitions.map(({ key }) => [key, override?.[key] ?? null])),
    allDepartmentAccess: !!override?.allDepartmentAccess,
    departmentIds: (userGrants.value || []).filter((grant) => grant && grant.userId === userId).map((grant) => grant.departmentId),
  };
};

const fetchUserAccessData = async () => {
  try {
    const data: any = await $fetch("/api/admin/access-control");
    usersList.value = data.users || [];
    userOverrides.value = data.overrides || [];
    userGrants.value = data.grants || [];
    const nextId = selectedUserId.value || (usersList.value || []).find((u) => u && u.role !== "admin")?.id;
    if (nextId) selectUser(nextId);
  } catch (err) {
    console.error("Failed to load user access data:", err);
  }
};

const saveUserAccess = async () => {
  if (!selectedUser.value) return;
  savingUserAccess.value = true;
  try {
    await $fetch("/api/admin/access-control", {
      method: "PUT",
      body: { userId: selectedUser.value.id, ...userForm.value },
    });
    toast.add({ title: "Access updated", description: `Permissions saved for ${selectedUser.value.name}.`, color: "success" });
    await fetchUserAccessData();
  } catch (error: any) {
    toast.add({ title: error?.data?.message || "Failed to save access", color: "error" });
  } finally {
    savingUserAccess.value = false;
  }
};

onMounted(() => {
  fetchSettings();
  fetchUserAccessData();
});

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

const deleteDepartment = (id: string, event?: Event) => {
  if (event) event.stopPropagation();
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
  const permsList = permissions.value || [];
  let p = permsList.find((perm) => perm && (perm.role === role || (role === "guest" && perm.role === "intern")) && (perm.departmentId || "global") === selectedDeptId.value);
  if (!p) {
    const globalP = permsList.find((perm) => perm && (perm.role === role || (role === "guest" && perm.role === "intern")) && (perm.departmentId || "global") === "global");
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
  const defaults = ["admin", "dept_head", "team_lead", "team_member", "guest", "intern"];
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
  return [
    "dept_head",
    "team_lead",
    "team_member",
    "guest",
    ...customRoles.value.filter((r) => r !== "intern" && r !== "guest"),
  ];
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
  guest: "Guest",
  intern: "Guest",
};
</script>

<template>
  <AppMain title="Organization Settings">
    <div v-if="loading" class="flex items-center justify-center min-h-[50vh]">
      <Icon name="lucide:loader" class="animate-spin size-8 text-neutral-400" />
    </div>

    <div v-else class="max-w-5xl mx-auto space-y-8">
      <!-- Navigation Tabs -->
      <div class="flex items-center gap-2 border-b border-[var(--dam-line)] pb-3">
        <button
          type="button"
          :class="[
            'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all cursor-pointer',
            activeTab === 'org'
              ? 'bg-primary-500 text-white shadow-md'
              : 'bg-[var(--dam-panel-solid)] text-[var(--dam-muted)] hover:bg-[var(--dam-panel-raised)] hover:text-[var(--dam-ink)] border border-[var(--dam-line)]',
          ]"
          @click="activeTab = 'org'"
        >
          <Icon name="lucide:building" class="size-4" />
          <span>Organization &amp; Role Settings</span>
        </button>

        <button
          type="button"
          :class="[
            'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all cursor-pointer',
            activeTab === 'users'
              ? 'bg-primary-500 text-white shadow-md'
              : 'bg-[var(--dam-panel-solid)] text-[var(--dam-muted)] hover:bg-[var(--dam-panel-raised)] hover:text-[var(--dam-ink)] border border-[var(--dam-line)]',
          ]"
          @click="activeTab = 'users'"
        >
          <Icon name="lucide:shield-check" class="size-4" />
          <span>Individual User Access Overrides</span>
        </button>
      </div>

      <template v-if="activeTab === 'org'">
        <!-- Org Name -->
        <section class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] text-[var(--dam-ink)] rounded-2xl p-6 space-y-4 shadow-[var(--dam-shadow-soft)]">
          <h2 class="text-lg font-semibold text-[var(--dam-ink)] flex items-center gap-2">
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
        <section class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] text-[var(--dam-ink)] rounded-2xl p-6 space-y-6 relative shadow-[var(--dam-shadow-soft)]">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-[var(--dam-ink)] flex items-center gap-2">
              <Icon name="lucide:network" class="text-primary size-5" />
              Departments &amp; Hierarchy
            </h2>
            <span v-if="!features?.hierarchy" class="flex items-center gap-1.5 text-xs font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
              <Icon name="lucide:lock" class="w-3 h-3" />
              Locked by Super Admin
            </span>
          </div>

          <!-- Locked overlay -->
          <div v-if="!features?.hierarchy" class="text-center py-10 text-[var(--dam-muted)]">
            <Icon name="lucide:lock" class="w-10 h-10 mx-auto mb-3 text-[var(--dam-muted)]" />
            <p class="font-medium text-[var(--dam-ink)]">Department management is disabled for this organization</p>
            <p class="text-sm mt-1">Contact your platform administrator to enable this feature.</p>
          </div>

          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <!-- Add Department -->
            <div class="space-y-4 bg-[var(--dam-panel-raised)] p-4 border border-[var(--dam-line)] rounded-xl">
              <h3 class="text-sm font-semibold text-[var(--dam-ink)]">Add Department / Sub-team</h3>
              <div class="space-y-4">
                <UFormField label="Department Name">
                  <UInput v-model="newDeptName" placeholder="e.g. Graphic Team" class="w-full" />
                </UFormField>
                
                <UFormField label="Works Under (Parent Department)">
                  <select
                    v-model="newDeptParentId"
                    class="w-full bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-xl px-3 py-2 text-[var(--dam-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
              <h3 class="text-sm font-semibold text-[var(--dam-ink)]">Current Departments</h3>
              <div class="border border-[var(--dam-line)] rounded-xl divide-y divide-[var(--dam-line)] max-h-[300px] overflow-y-auto">
                <div v-if="departments.length === 0" class="p-4 text-center text-sm text-[var(--dam-muted)]">
                  No departments configured.
                </div>
                <div
                  v-for="dept in departments"
                  :key="dept.id"
                  class="flex items-center justify-between p-3 text-sm hover:bg-[var(--dam-panel-raised)] cursor-pointer"
                  :class="selectedDeptId === dept.id ? 'bg-primary-500/10' : ''"
                  @click="selectedDeptId = dept.id"
                >
                  <div>
                    <span class="font-medium text-[var(--dam-ink)]">{{ dept.name }}</span>
                    <span
                      v-if="dept.parentId"
                      class="ml-2 text-xs bg-[var(--dam-panel-raised)] text-[var(--dam-muted)] px-2 py-0.5 rounded-full"
                    >
                      under {{ (departments || []).find(d => d.id === dept.parentId)?.name || 'Parent' }}
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span v-if="selectedDeptId === dept.id" class="text-xs text-primary-500 font-medium">Selected</span>
                    <UButton
                      color="error"
                      variant="ghost"
                      icon="lucide:trash"
                      @click="(e) => deleteDepartment(dept.id, e)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Custom Permissions Matrix -->
        <section class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] text-[var(--dam-ink)] rounded-2xl p-6 space-y-4 overflow-hidden shadow-[var(--dam-shadow-soft)]">
          <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-[var(--dam-line)] pb-4">
            <h2 class="text-lg font-semibold text-[var(--dam-ink)] flex items-center gap-2">
              <Icon name="lucide:shield-alert" class="text-primary size-5" />
              Role &amp; Capacity Settings
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
                  @keydown="handleRoleKeydown"
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
                <span class="text-xs text-[var(--dam-muted)] font-medium">Scope:</span>
                <select
                  v-model="selectedDeptId"
                  class="bg-[var(--dam-panel-raised)] border border-[var(--dam-line)] rounded-xl px-3 py-1.5 text-[var(--dam-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="global">Global Defaults (All Departments)</option>
                  <option v-for="dept in departments" :key="dept.id" :value="dept.id">
                    Department: {{ dept.name }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <p class="text-xs text-[var(--dam-muted)]">
            Showing role configuration and permissions overrides for:
            <strong class="text-[var(--dam-ink)]">
              {{ selectedDeptId === 'global' ? 'Global Defaults' : ((departments || []).find(d => d.id === selectedDeptId)?.name || selectedDeptId) }}
            </strong>
          </p>

          <div class="overflow-x-auto w-full">
            <table class="w-full text-sm text-left border border-[var(--dam-line)] rounded-xl overflow-hidden">
              <thead class="bg-[var(--dam-panel-raised)] text-[var(--dam-ink)] uppercase text-xs font-semibold border-b border-[var(--dam-line)]">
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
              <tbody class="divide-y divide-[var(--dam-line)]">
                <tr v-for="roleKey in allAvailableRoles" :key="roleKey" class="hover:bg-[var(--dam-panel-raised)]">
                  <td class="px-4 py-3.5 font-medium text-neutral-800 dark:text-neutral-200 flex items-center justify-between gap-2">
                    <span>{{ roleLabelMap[roleKey] || roleKey }}</span>
                    <UButton
                      v-if="!['dept_head', 'team_lead', 'team_member', 'guest', 'intern'].includes(roleKey)"
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
                  </td>
                  <td class="px-4 py-3.5 text-center">
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
                  </td>
                  <td class="px-4 py-3.5 text-center">
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
            Save Role Settings
          </UButton>
        </div>

        <!-- GDrive Governance Section (only shown for GDrive orgs) -->
        <section v-if="orgType === 'gdrive'" class="bg-[var(--dam-panel-solid)] border border-blue-500/30 rounded-2xl p-6 space-y-6 shadow-[var(--dam-shadow-soft)]">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-[var(--dam-ink)] flex items-center gap-2">
                <Icon name="lucide:hard-drive" class="text-blue-500 size-5" />
                Google Drive Governance
              </h2>
              <p class="text-sm text-[var(--dam-muted)] mt-1">
                Enforce organization-wide rules on top of your Google Drive storage.
              </p>
            </div>
            <span class="text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
              GDrive Org
            </span>
          </div>

          <div class="space-y-4">
            <!-- Nomenclature Enforcement -->
            <div class="flex items-start justify-between gap-4 p-4 bg-[var(--dam-panel-raised)] border border-[var(--dam-line)] rounded-xl">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <Icon name="lucide:text-cursor-input" class="text-violet-400 size-4" />
                  <h3 class="text-sm font-semibold text-[var(--dam-ink)]">Enforce Nomenclature</h3>
                </div>
                <p class="text-xs text-[var(--dam-muted)]">
                  When enabled, all uploaded files must follow the department's nomenclature template. Non-conforming names will be rejected.
                </p>
              </div>
              <USwitch
                v-model="gdriveRules.enforceNomenclature"
                :disabled="!features?.nomenclature"
                color="primary"
              />
            </div>

            <!-- Hierarchy Enforcement -->
            <div class="flex items-start justify-between gap-4 p-4 bg-[var(--dam-panel-raised)] border border-[var(--dam-line)] rounded-xl">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <Icon name="lucide:network" class="text-green-400 size-4" />
                  <h3 class="text-sm font-semibold text-[var(--dam-ink)]">Enforce Folder Hierarchy</h3>
                </div>
                <p class="text-xs text-[var(--dam-muted)]">
                  When enabled, non-admin users cannot create top-level department folders at the root.
                </p>
              </div>
              <USwitch
                v-model="gdriveRules.enforceHierarchy"
                :disabled="!features?.hierarchy"
                color="primary"
              />
            </div>

            <!-- Inter-Department Visibility -->
            <div class="flex items-start justify-between gap-4 p-4 bg-[var(--dam-panel-raised)] border border-[var(--dam-line)] rounded-xl">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <Icon name="lucide:eye" class="text-amber-400 size-4" />
                  <h3 class="text-sm font-semibold text-[var(--dam-ink)]">Allow Inter-Department Visibility</h3>
                </div>
                <p class="text-xs text-[var(--dam-muted)]">
                  When enabled (default), all users can see all department folders at the root. When disabled, users only see their own department folder.
                </p>
              </div>
              <USwitch
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
      </template>

      <!-- User Access Control Overrides Tab -->
      <template v-else-if="activeTab === 'users'">
        <div class="grid w-full gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <!-- User Selector Aside -->
          <aside class="overflow-hidden rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] shadow-[var(--dam-shadow-soft)]">
            <div class="border-b border-[var(--dam-line)] p-4">
              <h2 class="text-base font-bold text-[var(--dam-ink)]">Organization Users</h2>
              <p class="mt-1 text-xs text-[var(--dam-muted)]">Select an individual team member to configure permission overrides.</p>
              <UInput v-model="userSearch" icon="lucide:search" placeholder="Search user..." class="mt-4 w-full" />
            </div>
            <div class="max-h-[60vh] overflow-y-auto p-2">
              <button
                v-for="u in filteredUsers"
                :key="u.id"
                type="button"
                :class="[
                  'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors cursor-pointer',
                  selectedUserId === u.id ? 'bg-primary-500/10 text-primary-500' : 'hover:bg-[var(--dam-panel-raised)]',
                ]"
                @click="selectUser(u.id)"
              >
                <UAvatar :src="u.avatar || undefined" :alt="u.name" size="sm" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold text-[var(--dam-ink)]">{{ u.name }}</span>
                  <span class="block truncate text-xs text-[var(--dam-muted)]">{{ roleLabelMap[u.role] || u.role }} · {{ deptName(u.departmentId) }}</span>
                </span>
              </button>
              <p v-if="!filteredUsers.length" class="p-6 text-center text-sm text-[var(--dam-muted)]">No users found.</p>
            </div>
          </aside>

          <!-- User Specific Overrides & Scope Panel -->
          <section v-if="selectedUser" class="space-y-6">
            <div class="flex flex-col gap-4 rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] p-5 shadow-[var(--dam-shadow-soft)] sm:flex-row sm:items-center">
              <UAvatar :src="selectedUser.avatar || undefined" :alt="selectedUser.name" size="lg" />
              <div class="min-w-0 flex-1">
                <h2 class="truncate text-xl font-bold text-[var(--dam-ink)]">{{ selectedUser.name }}</h2>
                <p class="truncate text-sm text-[var(--dam-muted)]">{{ selectedUser.email }}</p>
                <p class="mt-1 text-xs font-semibold text-primary-500">{{ roleLabelMap[selectedUser.role] || selectedUser.role }} · {{ deptName(selectedUser.departmentId) }}</p>
              </div>
              <UButton icon="lucide:save" color="primary" variant="solid" :loading="savingUserAccess" @click="saveUserAccess">Save Access</UButton>
            </div>

            <!-- Specific Permission Overrides -->
            <div class="rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] p-5 shadow-[var(--dam-shadow-soft)] space-y-4">
              <div>
                <h3 class="text-base font-bold text-[var(--dam-ink)]">Individual Service Permissions</h3>
                <p class="mt-1 text-sm text-[var(--dam-muted)]">Default follows the user's role. Choose 'Allow' or 'Deny' to explicitly override for this person.</p>
              </div>
              <div class="divide-y divide-[var(--dam-line)]">
                <div v-for="permission in permissionDefinitions" :key="permission.key" class="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                  <div class="flex min-w-0 flex-1 items-center gap-3">
                    <span class="grid size-9 place-items-center rounded-xl bg-[var(--dam-panel-raised)] text-[var(--dam-muted)]"><Icon :name="permission.icon" class="size-4" /></span>
                    <div>
                      <p class="text-sm font-semibold text-[var(--dam-ink)]">{{ permission.label }}</p>
                      <p class="text-xs text-[var(--dam-muted)]">Effective: {{ effectiveUserValue(permission.key) ? 'Allowed' : 'Denied' }}</p>
                    </div>
                  </div>
                  <select v-model="userForm.permissions[permission.key]" class="h-10 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] px-3 text-sm font-semibold text-[var(--dam-ink)]">
                    <option :value="null">Inherit role</option>
                    <option :value="true">Allow</option>
                    <option :value="false">Deny</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Cross Department Access Scope -->
            <div class="rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] p-5 shadow-[var(--dam-shadow-soft)] space-y-4">
              <h3 class="text-base font-bold text-[var(--dam-ink)]">Cross-Department Access Scope</h3>
              <p class="mt-1 text-sm text-[var(--dam-muted)]">Their home department is always accessible. Grant additional departments if needed.</p>
              <label class="mt-3 flex items-center justify-between gap-4 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] p-4">
                <span>
                  <span class="block text-sm font-semibold text-[var(--dam-ink)]">All Organization Departments</span>
                  <span class="block text-xs text-[var(--dam-muted)]">Automatically grant access to current and future departments.</span>
                </span>
                <USwitch v-model="userForm.allDepartmentAccess" color="primary" />
              </label>
              <div v-if="!userForm.allDepartmentAccess" class="mt-4 grid gap-3 sm:grid-cols-2">
                <label v-for="department in availableDepartments" :key="department.id" class="flex items-center gap-3 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] p-3 text-sm font-semibold text-[var(--dam-ink)]">
                  <UCheckbox v-model="userForm.departmentIds" :value="department.id" />
                  {{ department.name }}
                </label>
              </div>
            </div>
          </section>
        </div>
      </template>
    </div>
  </AppMain>
</template>
