<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue";
import { useRole } from "~/composables/useRole";
import { useToast } from "~/composables/useToast";

const { isAdmin } = useRole();
if (!isAdmin.value) {
  navigateTo("/");
}

const toast = useToast();
const loading = ref(true);
const saving = ref(false);

// Raw Data
const orgName = ref("Organization");
const departments = ref<any[]>([]);
const usersList = ref<any[]>([]);
const invites = ref<any[]>([]);

// UI States
const viewMode = ref<"tree" | "grid" | "table">("tree");
const searchQuery = ref("");

// Modals
const isDeptModalOpen = ref(false);
const editingDept = ref<any>(null); // null if creating new
const deptForm = ref({
  name: "",
  parentId: ""
});

const isAssignHeadModalOpen = ref(false);
const selectedDeptForAssign = ref<any>(null);
const selectedHeadUserId = ref("");
const assigningHead = ref(false);

const isInviteModalOpen = ref(false);
const selectedDeptForInvite = ref<any>(null);
const inviteEmail = ref("");
const sendingInvite = ref(false);
const generatedInviteUrl = ref("");

const isDeleteModalOpen = ref(false);
const deptToDelete = ref<any>(null);

// Default starter departments if empty
const DEFAULT_DEPARTMENTS = [
  { id: "dept_product", name: "Product & Engineering", parentId: null },
  { id: "dept_design", name: "Creative & Design", parentId: null },
  { id: "dept_marketing", name: "Marketing & Content", parentId: null },
  { id: "dept_finance", name: "Finance & Operations", parentId: null },
  { id: "dept_ui", name: "UI/UX & Graphics", parentId: "dept_design" },
  { id: "dept_3d", name: "3D Motion & Studio", parentId: "dept_design" }
];

// Fetch Data
const fetchData = async () => {
  loading.value = true;
  try {
    const settings: any = await $fetch("/api/organizations/settings");
    orgName.value = settings.name || "Organization";
    
    let fetchedDepts = settings.departments || [];
    if (!fetchedDepts || fetchedDepts.length === 0) {
      fetchedDepts = DEFAULT_DEPARTMENTS;
    }
    departments.value = fetchedDepts;

    // Fetch users
    try {
      const usersData: any = await $fetch("/api/admin/users");
      usersList.value = Array.isArray(usersData) ? usersData : (usersData?.data || []);
    } catch (e) {
      usersList.value = [];
    }

    // Fetch invites
    await fetchInvites();
  } catch (e) {
    toast.add({ title: "Failed to load organizational hierarchy", color: "error" });
  } finally {
    loading.value = false;
  }
};

const fetchInvites = async () => {
  try {
    const data: any = await $fetch("/api/admin/invites");
    invites.value = Array.isArray(data) ? data : (data?.invites || []);
  } catch (e) {
    invites.value = [];
  }
};

// Mappings & Metrics
const getDeptHead = (deptId: string) => {
  return usersList.value.find((u) => u.departmentId === deptId && (u.role === "dept_head" || u.role === "admin"));
};

const getDeptMembers = (deptId: string) => {
  return usersList.value.filter((u) => u.departmentId === deptId);
};

const totalDepartmentsCount = computed(() => departments.value.length);
const totalAssignedHeads = computed(() => {
  return departments.value.filter((d) => !!getDeptHead(d.id)).length;
});
const totalVacantHeads = computed(() => totalDepartmentsCount.value - totalAssignedHeads.value);
const totalUsersCount = computed(() => usersList.value.length);

// Tree Structure Computation
const filteredDepartments = computed(() => {
  if (!searchQuery.value.trim()) return departments.value;
  const q = searchQuery.value.toLowerCase();
  return departments.value.filter((d) => {
    const nameMatch = d.name.toLowerCase().includes(q);
    const head = getDeptHead(d.id);
    const headMatch = head && (head.name?.toLowerCase().includes(q) || head.email?.toLowerCase().includes(q));
    return nameMatch || headMatch;
  });
});

const rootDepartments = computed(() => {
  return filteredDepartments.value.filter((d) => !d.parentId);
});

const getChildDepartments = (parentId: string) => {
  return filteredDepartments.value.filter((d) => d.parentId === parentId);
};

// Actions: Department CRUD
const openAddDeptModal = (parentId: string | null = null) => {
  editingDept.value = null;
  deptForm.value = {
    name: "",
    parentId: parentId || ""
  };
  isDeptModalOpen.value = true;
};

const openEditDeptModal = (dept: any) => {
  editingDept.value = dept;
  deptForm.value = {
    name: dept.name,
    parentId: dept.parentId || ""
  };
  isDeptModalOpen.value = true;
};

const saveDepartment = async () => {
  if (!deptForm.value.name.trim()) return;
  saving.value = true;
  try {
    let updatedList = [...departments.value];
    if (editingDept.value) {
      // Update
      updatedList = updatedList.map((d) => {
        if (d.id === editingDept.value.id) {
          return {
            ...d,
            name: deptForm.value.name.trim(),
            parentId: deptForm.value.parentId || null
          };
        }
        return d;
      });
    } else {
      // Create new
      const newDept = {
        id: `dept_${Date.now()}`,
        name: deptForm.value.name.trim(),
        parentId: deptForm.value.parentId || null
      };
      updatedList.push(newDept);
    }

    // Persist to backend settings
    await $fetch("/api/organizations/settings", {
      method: "PUT",
      body: {
        name: orgName.value,
        departments: updatedList,
        permissions: [] // keeps permissions intact
      }
    });

    departments.value = updatedList;
    isDeptModalOpen.value = false;
    toast.add({ title: editingDept.value ? "Department updated!" : "Department created!", color: "success" });
  } catch (e: any) {
    toast.add({ title: e?.data?.message || "Failed to save department", color: "error" });
  } finally {
    saving.value = false;
  }
};

const openDeleteDeptModal = (dept: any) => {
  deptToDelete.value = dept;
  isDeleteModalOpen.value = true;
};

const confirmDeleteDept = async () => {
  if (!deptToDelete.value) return;
  saving.value = true;
  try {
    const updatedList = departments.value.filter((d) => d.id !== deptToDelete.value.id && d.parentId !== deptToDelete.value.id);
    await $fetch("/api/organizations/settings", {
      method: "PUT",
      body: {
        name: orgName.value,
        departments: updatedList,
        permissions: []
      }
    });
    departments.value = updatedList;
    isDeleteModalOpen.value = false;
    toast.add({ title: "Department removed successfully", color: "success" });
  } catch (e: any) {
    toast.add({ title: "Failed to delete department", color: "error" });
  } finally {
    saving.value = false;
  }
};

// Actions: Head Assignment
const openAssignHeadModal = (dept: any) => {
  selectedDeptForAssign.value = dept;
  const currentHead = getDeptHead(dept.id);
  selectedHeadUserId.value = currentHead ? currentHead.id : "";
  isAssignHeadModalOpen.value = true;
};

const saveAssignedHead = async () => {
  if (!selectedDeptForAssign.value || !selectedHeadUserId.value) return;
  assigningHead.value = true;
  try {
    // Update user role & departmentId via admin endpoint
    await $fetch(`/api/admin/users/${selectedHeadUserId.value}`, {
      method: "PUT",
      body: {
        role: "dept_head",
        departmentId: selectedDeptForAssign.value.id
      }
    });

    toast.add({ title: "Department Head assigned successfully!", color: "success" });
    isAssignHeadModalOpen.value = false;
    fetchData();
  } catch (e: any) {
    toast.add({ title: e?.data?.message || "Failed to assign Department Head", color: "error" });
  } finally {
    assigningHead.value = false;
  }
};

// Actions: Invite Head
const openInviteModal = (dept: any) => {
  selectedDeptForInvite.value = dept;
  inviteEmail.value = "";
  generatedInviteUrl.value = "";
  isInviteModalOpen.value = true;
};

const sendInvite = async () => {
  if (!inviteEmail.value.trim() || !selectedDeptForInvite.value) return;
  sendingInvite.value = true;
  try {
    const res: any = await $fetch(`/api/admin/departments/${selectedDeptForInvite.value.id}/invite`, {
      method: "POST",
      body: { email: inviteEmail.value.trim() }
    });
    generatedInviteUrl.value = res.inviteUrl;
    toast.add({ title: "Invitation link generated!", color: "success" });
    await fetchInvites();
  } catch (e: any) {
    toast.add({ title: e?.data?.message || "Failed to generate invite.", color: "error" });
  } finally {
    sendingInvite.value = false;
  }
};

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.add({ title: "Link copied to clipboard!", color: "success" });
};

onMounted(fetchData);
</script>

<template>
  <AppMain title="Organization Hierarchy & Departments">
    <div v-if="loading" class="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
      <Icon name="lucide:loader" class="animate-spin size-8 text-primary" />
      <span class="text-sm text-[var(--dam-ink-muted)]">Building organizational tree graph...</span>
    </div>

    <div v-else class="max-w-7xl mx-auto space-y-8">
      <!-- Executive Summary Cards -->
      <section class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-5 shadow-sm hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider">Total Departments</span>
            <div class="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
              <Icon name="lucide:network" class="size-5" />
            </div>
          </div>
          <div class="mt-3 flex items-baseline gap-2">
            <span class="text-3xl font-bold text-[var(--dam-ink)]">{{ totalDepartmentsCount }}</span>
            <span class="text-xs text-[var(--dam-ink-muted)]">active units</span>
          </div>
        </div>

        <div class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-5 shadow-sm hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider">Assigned Heads</span>
            <div class="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Icon name="lucide:user-check" class="size-5" />
            </div>
          </div>
          <div class="mt-3 flex items-baseline gap-2">
            <span class="text-3xl font-bold text-emerald-500">{{ totalAssignedHeads }}</span>
            <span class="text-xs text-[var(--dam-ink-muted)]">governed domains</span>
          </div>
        </div>

        <div class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-5 shadow-sm hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider">Vacant Heads</span>
            <div class="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Icon name="lucide:alert-circle" class="size-5" />
            </div>
          </div>
          <div class="mt-3 flex items-baseline gap-2">
            <span class="text-3xl font-bold text-amber-500">{{ totalVacantHeads }}</span>
            <span class="text-xs text-[var(--dam-ink-muted)]">need assignment</span>
          </div>
        </div>

        <div class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-5 shadow-sm hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider">Org Headcount</span>
            <div class="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Icon name="lucide:users" class="size-5" />
            </div>
          </div>
          <div class="mt-3 flex items-baseline gap-2">
            <span class="text-3xl font-bold text-[var(--dam-ink)]">{{ totalUsersCount }}</span>
            <span class="text-xs text-[var(--dam-ink-muted)]">members</span>
          </div>
        </div>
      </section>

      <!-- Action & View Controls Bar -->
      <section class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="relative w-full md:w-96">
          <Icon name="lucide:search" class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--dam-ink-muted)]" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search departments or heads..."
            class="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] text-[var(--dam-ink)] placeholder-[var(--dam-ink-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>

        <div class="flex items-center gap-3 w-full md:w-auto justify-end">
          <!-- View Mode Toggle -->
          <div class="flex items-center p-1 bg-[var(--dam-bg)] border border-[var(--dam-line)] rounded-xl">
            <button
              class="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition"
              :class="viewMode === 'tree' ? 'bg-[var(--dam-panel-raised)] text-[var(--dam-ink)] shadow-sm' : 'text-[var(--dam-ink-muted)] hover:text-[var(--dam-ink)]'"
              @click="viewMode = 'tree'"
            >
              <Icon name="lucide:git-fork" class="size-3.5" />
              Hierarchy Tree
            </button>
            <button
              class="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition"
              :class="viewMode === 'grid' ? 'bg-[var(--dam-panel-raised)] text-[var(--dam-ink)] shadow-sm' : 'text-[var(--dam-ink-muted)] hover:text-[var(--dam-ink)]'"
              @click="viewMode = 'grid'"
            >
              <Icon name="lucide:layout-grid" class="size-3.5" />
              Cards
            </button>
            <button
              class="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition"
              :class="viewMode === 'table' ? 'bg-[var(--dam-panel-raised)] text-[var(--dam-ink)] shadow-sm' : 'text-[var(--dam-ink-muted)] hover:text-[var(--dam-ink)]'"
              @click="viewMode = 'table'"
            >
              <Icon name="lucide:list" class="size-3.5" />
              Table
            </button>
          </div>

          <UButton
            color="primary"
            variant="solid"
            size="md"
            icon="lucide:plus"
            class="rounded-xl shadow-sm"
            @click="openAddDeptModal()"
          >
            Add Department
          </UButton>
        </div>
      </section>

      <!-- VIEW 1: ORGANIZATIONAL HIERARCHY TREE GRAPH -->
      <section v-if="viewMode === 'tree'" class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-8 space-y-10 overflow-x-auto">
        <div class="text-center max-w-xl mx-auto space-y-1">
          <h3 class="text-lg font-bold text-[var(--dam-ink)] flex items-center justify-center gap-2">
            <Icon name="lucide:shield-check" class="text-indigo-500 size-5" />
            {{ orgName }} Executive Structure
          </h3>
          <p class="text-xs text-[var(--dam-ink-muted)]">
            Visual reporting tree mapping department heads, sub-domains, and team members.
          </p>
        </div>

        <!-- ROOT NODE: Executive Leadership / Org Admin -->
        <div class="flex flex-col items-center">
          <div class="relative group bg-gradient-to-b from-indigo-600/10 via-[var(--dam-panel-raised)] to-[var(--dam-panel-solid)] border-2 border-indigo-500/40 rounded-2xl p-5 w-80 text-center shadow-lg hover:shadow-indigo-500/10 transition">
            <div class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-full shadow">
              Executive Leadership
            </div>
            
            <div class="mt-2 flex flex-col items-center">
              <div class="w-14 h-14 rounded-full border-2 border-indigo-500 overflow-hidden bg-indigo-950/40 flex items-center justify-center shadow">
                <Icon name="lucide:crown" class="size-7 text-indigo-400" />
              </div>
              <h4 class="text-base font-bold text-[var(--dam-ink)] mt-2">Organization Admin</h4>
              <p class="text-xs text-indigo-400 font-medium">Chief Executive & Governance</p>
              
              <div class="mt-3 pt-3 border-t border-[var(--dam-line)] w-full flex items-center justify-around text-xs text-[var(--dam-ink-muted)]">
                <span>{{ totalDepartmentsCount }} Departments</span>
                <span>•</span>
                <span>{{ totalUsersCount }} Total Users</span>
              </div>
            </div>
          </div>

          <!-- Vertical Stem from Root -->
          <div class="w-0.5 h-10 bg-indigo-500/40 my-1"></div>
        </div>

        <!-- LEVEL 2 & 3: DEPARTMENT NODES GRID / TREE BRANCHES -->
        <div v-if="rootDepartments.length > 0" class="space-y-12">
          <!-- Main Connecting Bar for Children -->
          <div class="relative flex justify-center">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full">
              <div 
                v-for="dept in rootDepartments" 
                :key="dept.id"
                class="flex flex-col items-center"
              >
                <!-- Department Card Node -->
                <div class="w-full bg-[var(--dam-panel-raised)] border border-[var(--dam-line)] hover:border-indigo-500/50 rounded-2xl p-5 shadow-sm hover:shadow-md transition space-y-4">
                  <!-- Header: Name & Options -->
                  <div class="flex items-start justify-between">
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                          <Icon name="lucide:folder-tree" class="size-4" />
                        </span>
                        <h4 class="text-base font-bold text-[var(--dam-ink)]">{{ dept.name }}</h4>
                      </div>
                      <span class="text-[10px] text-[var(--dam-ink-muted)] uppercase tracking-wider block mt-1">
                        Root Domain
                      </span>
                    </div>

                    <div class="flex items-center gap-1">
                      <button 
                        title="Add Sub-department"
                        class="p-1.5 rounded-lg hover:bg-[var(--dam-bg)] text-[var(--dam-ink-muted)] hover:text-indigo-400 transition"
                        @click="openAddDeptModal(dept.id)"
                      >
                        <Icon name="lucide:plus" class="size-4" />
                      </button>
                      <button 
                        title="Edit Department"
                        class="p-1.5 rounded-lg hover:bg-[var(--dam-bg)] text-[var(--dam-ink-muted)] hover:text-[var(--dam-ink)] transition"
                        @click="openEditDeptModal(dept)"
                      >
                        <Icon name="lucide:edit-3" class="size-4" />
                      </button>
                      <button 
                        title="Delete Department"
                        class="p-1.5 rounded-lg hover:bg-[var(--dam-bg)] text-[var(--dam-ink-muted)] hover:text-red-400 transition"
                        @click="openDeleteDeptModal(dept)"
                      >
                        <Icon name="lucide:trash-2" class="size-4" />
                      </button>
                    </div>
                  </div>

                  <!-- Assigned Head Section -->
                  <div class="bg-[var(--dam-bg)] border border-[var(--dam-line)] rounded-xl p-3">
                    <div class="text-[10px] font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider mb-2">
                      Department Head
                    </div>
                    
                    <div v-if="getDeptHead(dept.id)" class="flex items-center justify-between">
                      <div class="flex items-center gap-2.5">
                        <img 
                          v-if="getDeptHead(dept.id)?.avatar" 
                          :src="getDeptHead(dept.id)?.avatar" 
                          class="w-9 h-9 rounded-full border border-indigo-500/30 object-cover" 
                        />
                        <div v-else class="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center text-xs border border-indigo-500/30">
                          {{ getDeptHead(dept.id)?.name?.charAt(0) || 'H' }}
                        </div>
                        <div>
                          <div class="text-xs font-bold text-[var(--dam-ink)]">{{ getDeptHead(dept.id)?.name }}</div>
                          <div class="text-[10px] text-[var(--dam-ink-muted)]">{{ getDeptHead(dept.id)?.email }}</div>
                        </div>
                      </div>
                      <UButton size="xs" color="neutral" variant="ghost" icon="lucide:user-cog" @click="openAssignHeadModal(dept)" />
                    </div>

                    <div v-else class="flex items-center justify-between">
                      <span class="text-xs text-amber-500 font-medium flex items-center gap-1.5">
                        <Icon name="lucide:alert-circle" class="size-3.5" />
                        No Head Assigned
                      </span>
                      <div class="flex items-center gap-1">
                        <UButton size="xs" color="primary" variant="soft" icon="lucide:user-plus" @click="openAssignHeadModal(dept)">Assign</UButton>
                        <UButton size="xs" color="neutral" variant="ghost" icon="lucide:mail-plus" @click="openInviteModal(dept)">Invite</UButton>
                      </div>
                    </div>
                  </div>

                  <!-- Sub-department & Member Footers -->
                  <div class="flex items-center justify-between text-xs text-[var(--dam-ink-muted)] pt-2 border-t border-[var(--dam-line)]">
                    <span class="flex items-center gap-1">
                      <Icon name="lucide:users" class="size-3.5 text-indigo-400" />
                      {{ getDeptMembers(dept.id).length }} Members
                    </span>
                    <span class="flex items-center gap-1">
                      <Icon name="lucide:git-merge" class="size-3.5 text-emerald-400" />
                      {{ getChildDepartments(dept.id).length }} Sub-departments
                    </span>
                  </div>
                </div>

                <!-- SUB-DEPARTMENTS (LEVEL 3 NODES) -->
                <div v-if="getChildDepartments(dept.id).length > 0" class="w-full mt-6 space-y-4 pl-6 border-l-2 border-dashed border-indigo-500/30">
                  <div class="text-[10px] font-bold text-[var(--dam-ink-muted)] uppercase tracking-wider">
                    Sub-departments
                  </div>

                  <div 
                    v-for="subDept in getChildDepartments(dept.id)" 
                    :key="subDept.id"
                    class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] hover:border-indigo-500/40 rounded-xl p-3 shadow-xs space-y-2"
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <Icon name="lucide:corner-down-right" class="size-3.5 text-indigo-400" />
                        <span class="text-xs font-bold text-[var(--dam-ink)]">{{ subDept.name }}</span>
                      </div>
                      
                      <div class="flex items-center gap-1">
                        <button class="p-1 text-[var(--dam-ink-muted)] hover:text-[var(--dam-ink)]" @click="openEditDeptModal(subDept)">
                          <Icon name="lucide:edit-2" class="size-3" />
                        </button>
                        <button class="p-1 text-[var(--dam-ink-muted)] hover:text-red-400" @click="openDeleteDeptModal(subDept)">
                          <Icon name="lucide:trash-2" class="size-3" />
                        </button>
                      </div>
                    </div>

                    <div class="flex items-center justify-between text-[11px] text-[var(--dam-ink-muted)] bg-[var(--dam-bg)] px-2.5 py-1.5 rounded-lg border border-[var(--dam-line)]">
                      <span v-if="getDeptHead(subDept.id)" class="font-medium text-emerald-400 flex items-center gap-1">
                        <Icon name="lucide:user-check" class="size-3" />
                        {{ getDeptHead(subDept.id)?.name }}
                      </span>
                      <span v-else class="text-amber-500 flex items-center gap-1">
                        <Icon name="lucide:user-x" class="size-3" />
                        Vacant Head
                      </span>
                      <span>{{ getDeptMembers(subDept.id).length }} members</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="text-center py-12 text-[var(--dam-ink-muted)]">
          No departments matched your search query.
        </div>
      </section>

      <!-- VIEW 2: GRID CARDS VIEW -->
      <section v-else-if="viewMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div 
          v-for="dept in filteredDepartments" 
          :key="dept.id"
          class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-5 shadow-sm hover:shadow-md transition space-y-4 flex flex-col justify-between"
        >
          <div class="space-y-3">
            <div class="flex items-start justify-between">
              <div>
                <h3 class="text-base font-bold text-[var(--dam-ink)]">{{ dept.name }}</h3>
                <span v-if="dept.parentId" class="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20">
                  Sub-dept of {{ departments.find(d => d.id === dept.parentId)?.name }}
                </span>
                <span v-else class="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                  Root Department
                </span>
              </div>

              <div class="flex items-center gap-1">
                <button class="p-1.5 rounded-lg hover:bg-[var(--dam-bg)] text-[var(--dam-ink-muted)] hover:text-[var(--dam-ink)]" @click="openEditDeptModal(dept)">
                  <Icon name="lucide:edit-3" class="size-4" />
                </button>
                <button class="p-1.5 rounded-lg hover:bg-[var(--dam-bg)] text-[var(--dam-ink-muted)] hover:text-red-400" @click="openDeleteDeptModal(dept)">
                  <Icon name="lucide:trash-2" class="size-4" />
                </button>
              </div>
            </div>

            <!-- Head Info -->
            <div class="bg-[var(--dam-bg)] border border-[var(--dam-line)] rounded-xl p-3">
              <div v-if="getDeptHead(dept.id)" class="flex items-center gap-3">
                <img v-if="getDeptHead(dept.id)?.avatar" :src="getDeptHead(dept.id)?.avatar" class="w-8 h-8 rounded-full border border-indigo-500/30" />
                <div v-else class="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center text-xs">
                  {{ getDeptHead(dept.id)?.name?.charAt(0) || 'H' }}
                </div>
                <div>
                  <div class="text-xs font-bold text-[var(--dam-ink)]">{{ getDeptHead(dept.id)?.name }}</div>
                  <div class="text-[10px] text-[var(--dam-ink-muted)]">Department Head</div>
                </div>
              </div>
              <div v-else class="flex items-center justify-between text-xs text-amber-500 font-medium">
                <span>No Department Head assigned</span>
                <UButton size="xs" color="primary" variant="soft" icon="lucide:user-plus" @click="openAssignHeadModal(dept)">Assign</UButton>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between pt-3 border-t border-[var(--dam-line)] text-xs text-[var(--dam-ink-muted)]">
            <span>{{ getDeptMembers(dept.id).length }} Active Members</span>
            <UButton size="xs" color="neutral" variant="ghost" icon="lucide:mail-plus" @click="openInviteModal(dept)">Invite</UButton>
          </div>
        </div>
      </section>

      <!-- VIEW 3: TABLE VIEW -->
      <section v-else-if="viewMode === 'table'" class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl overflow-hidden shadow-sm">
        <table class="w-full text-sm text-left">
          <thead class="bg-[var(--dam-bg)] text-[var(--dam-ink-muted)] uppercase text-[10px] font-bold tracking-wider border-b border-[var(--dam-line)]">
            <tr>
              <th class="px-5 py-4">Department Name</th>
              <th class="px-5 py-4">Type / Parent</th>
              <th class="px-5 py-4">Department Head</th>
              <th class="px-5 py-4">Headcount</th>
              <th class="px-5 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--dam-line)] text-[var(--dam-ink)]">
            <tr v-for="dept in filteredDepartments" :key="dept.id" class="hover:bg-[var(--dam-bg)]/50 transition">
              <td class="px-5 py-4 font-bold flex items-center gap-2">
                <Icon name="lucide:network" class="size-4 text-indigo-400" />
                {{ dept.name }}
              </td>
              <td class="px-5 py-4 text-xs text-[var(--dam-ink-muted)]">
                <span v-if="dept.parentId" class="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Sub-dept of {{ departments.find(d => d.id === dept.parentId)?.name }}
                </span>
                <span v-else class="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Root Level
                </span>
              </td>
              <td class="px-5 py-4 text-xs">
                <div v-if="getDeptHead(dept.id)" class="flex items-center gap-2">
                  <span class="font-bold text-[var(--dam-ink)]">{{ getDeptHead(dept.id)?.name }}</span>
                  <span class="text-[10px] text-[var(--dam-ink-muted)]">({{ getDeptHead(dept.id)?.email }})</span>
                </div>
                <span v-else class="text-amber-500 font-medium">Vacant Head</span>
              </td>
              <td class="px-5 py-4 text-xs text-[var(--dam-ink-muted)]">
                {{ getDeptMembers(dept.id).length }} members
              </td>
              <td class="px-5 py-4 text-right flex items-center justify-end gap-2">
                <UButton size="xs" color="neutral" variant="ghost" icon="lucide:user-cog" @click="openAssignHeadModal(dept)" />
                <UButton size="xs" color="neutral" variant="ghost" icon="lucide:edit-3" @click="openEditDeptModal(dept)" />
                <UButton size="xs" color="neutral" variant="ghost" icon="lucide:trash-2" class="text-red-400" @click="openDeleteDeptModal(dept)" />
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Pending Invitations -->
      <section v-if="invites && invites.length > 0" class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-6 space-y-4 shadow-sm">
        <h3 class="text-base font-bold text-[var(--dam-ink)] flex items-center gap-2">
          <Icon name="lucide:clock" class="text-amber-500 size-5" />
          Pending Department Head Invitations
        </h3>

        <div class="border border-[var(--dam-line)] rounded-xl overflow-hidden">
          <table class="w-full text-xs text-left">
            <thead class="bg-[var(--dam-bg)] text-[var(--dam-ink-muted)] uppercase tracking-wider font-semibold border-b border-[var(--dam-line)]">
              <tr>
                <th class="px-4 py-3">Email</th>
                <th class="px-4 py-3">Target Department</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[var(--dam-line)] text-[var(--dam-ink)]">
              <tr v-for="invite in invites" :key="invite.id" class="hover:bg-[var(--dam-bg)]">
                <td class="px-4 py-3 font-medium">{{ invite.email }}</td>
                <td class="px-4 py-3 text-[var(--dam-ink-muted)]">
                  {{ departments.find(d => d.id === invite.departmentId)?.name || 'Unknown' }}
                </td>
                <td class="px-4 py-3">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    {{ invite.status }}
                  </span>
                </td>
                <td class="px-4 py-3 text-right">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="lucide:copy"
                    @click="copyToClipboard(invite.inviteUrl)"
                  >
                    Copy Link
                  </UButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- MODAL 1: ADD / EDIT DEPARTMENT -->
    <Teleport to="body">
      <div v-if="isDeptModalOpen" class="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" @click.self="isDeptModalOpen = false">
        <div class="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] text-[var(--dam-ink)] shadow-2xl" @click.stop>
          <div class="flex items-center justify-between border-b border-[var(--dam-line)] px-6 py-4">
            <h3 class="text-base font-bold text-[var(--dam-ink)]">
              {{ editingDept ? 'Edit Department' : 'Create New Department' }}
            </h3>
            <UButton color="neutral" variant="ghost" icon="lucide:x" @click="isDeptModalOpen = false" />
          </div>

          <div class="p-6 space-y-4">
            <div>
              <label for="dept-modal-name" class="block text-xs font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider mb-2">
                Department Name
              </label>
              <input
                id="dept-modal-name"
                v-model="deptForm.name"
                type="text"
                placeholder="e.g. Creative & Design"
                class="w-full rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] px-4 py-2.5 text-sm text-[var(--dam-ink)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>

            <div>
              <label for="dept-modal-parent" class="block text-xs font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider mb-2">
                Parent Department (Optional)
              </label>
              <select
                id="dept-modal-parent"
                v-model="deptForm.parentId"
                class="w-full rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] px-4 py-2.5 text-sm text-[var(--dam-ink)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="">None (Top-Level Root Department)</option>
                <option 
                  v-for="d in departments.filter(dep => dep.id !== editingDept?.id)" 
                  :key="d.id" 
                  :value="d.id"
                >
                  {{ d.name }}
                </option>
              </select>
            </div>
          </div>

          <div class="flex justify-end gap-3 border-t border-[var(--dam-line)] bg-[var(--dam-bg)] px-6 py-4">
            <UButton color="neutral" variant="ghost" @click="isDeptModalOpen = false">Cancel</UButton>
            <UButton color="primary" variant="solid" :loading="saving" :disabled="!deptForm.name.trim()" @click="saveDepartment">
              Save Department
            </UButton>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- MODAL 2: ASSIGN DEPARTMENT HEAD -->
    <Teleport to="body">
      <div v-if="isAssignHeadModalOpen" class="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" @click.self="isAssignHeadModalOpen = false">
        <div class="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] text-[var(--dam-ink)] shadow-2xl" @click.stop>
          <div class="flex items-center justify-between border-b border-[var(--dam-line)] px-6 py-4">
            <h3 class="text-base font-bold text-[var(--dam-ink)]">
              Assign Head to {{ selectedDeptForAssign?.name }}
            </h3>
            <UButton color="neutral" variant="ghost" icon="lucide:x" @click="isAssignHeadModalOpen = false" />
          </div>

          <div class="p-6 space-y-4">
            <p class="text-xs text-[var(--dam-ink-muted)]">
              Select an existing organization member to promote as the Department Head for governance oversight.
            </p>

            <div>
              <label for="assign-head-user-select" class="block text-xs font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider mb-2">
                Select Member
              </label>
              <select
                id="assign-head-user-select"
                v-model="selectedHeadUserId"
                class="w-full rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] px-4 py-2.5 text-sm text-[var(--dam-ink)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="" disabled>Choose a user...</option>
                <option v-for="user in usersList" :key="user.id" :value="user.id">
                  {{ user.name || user.email }} ({{ user.role }})
                </option>
              </select>
            </div>
          </div>

          <div class="flex justify-end gap-3 border-t border-[var(--dam-line)] bg-[var(--dam-bg)] px-6 py-4">
            <UButton color="neutral" variant="ghost" @click="isAssignHeadModalOpen = false">Cancel</UButton>
            <UButton color="primary" variant="solid" :loading="assigningHead" :disabled="!selectedHeadUserId" @click="saveAssignedHead">
              Confirm Assignment
            </UButton>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- MODAL 3: INVITE DEPARTMENT HEAD -->
    <Teleport to="body">
      <div v-if="isInviteModalOpen" class="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" @click.self="isInviteModalOpen = false">
        <div class="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] text-[var(--dam-ink)] shadow-2xl" @click.stop>
          <div class="flex items-center justify-between border-b border-[var(--dam-line)] px-6 py-4">
            <h3 class="text-base font-bold text-[var(--dam-ink)]">Invite Department Head</h3>
            <UButton color="neutral" variant="ghost" icon="lucide:x" @click="isInviteModalOpen = false" />
          </div>

          <div class="p-6 space-y-4">
            <div v-if="!generatedInviteUrl" class="space-y-4">
              <div>
                <label for="dept-invite-email-input" class="block text-xs font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider mb-2">
                  Invitee's Email Address
                </label>
                <input
                  id="dept-invite-email-input"
                  v-v-model="inviteEmail"
                  v-model="inviteEmail"
                  type="email"
                  placeholder="manager@company.com"
                  class="w-full rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] px-4 py-3 text-sm text-[var(--dam-ink)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  @keydown.enter="sendInvite"
                />
              </div>
            </div>

            <div v-else class="space-y-4">
              <div class="bg-indigo-500/10 border border-indigo-500/30 p-4 rounded-xl space-y-2">
                <p class="text-xs font-bold text-indigo-400 flex items-center gap-2">
                  <Icon name="lucide:check-circle-2" class="size-4" />
                  Invitation Link Generated
                </p>
                <div class="flex items-center gap-2 mt-2">
                  <input 
                    readonly 
                    :value="generatedInviteUrl" 
                    class="flex-1 bg-[var(--dam-bg)] border border-[var(--dam-line)] rounded-lg px-3 py-2 text-xs font-mono text-indigo-300 focus:outline-none"
                  />
                  <UButton color="primary" variant="solid" size="sm" icon="lucide:copy" @click="copyToClipboard(generatedInviteUrl)">Copy</UButton>
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-3 border-t border-[var(--dam-line)] bg-[var(--dam-bg)] px-6 py-4">
            <template v-if="!generatedInviteUrl">
              <UButton color="neutral" variant="ghost" @click="isInviteModalOpen = false">Cancel</UButton>
              <UButton color="primary" variant="solid" :loading="sendingInvite" :disabled="!inviteEmail.trim()" icon="lucide:send" @click="sendInvite">
                Generate Invite Link
              </UButton>
            </template>
            <template v-else>
              <UButton color="primary" variant="solid" @click="isInviteModalOpen = false">Done</UButton>
            </template>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- MODAL 4: CONFIRM DELETE -->
    <Teleport to="body">
      <div v-if="isDeleteModalOpen" class="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" @click.self="isDeleteModalOpen = false">
        <div class="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] text-[var(--dam-ink)] shadow-2xl p-6 text-center space-y-4" @click.stop>
          <div class="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
            <Icon name="lucide:alert-triangle" class="size-6" />
          </div>
          <div>
            <h4 class="text-base font-bold text-[var(--dam-ink)]">Remove {{ deptToDelete?.name }}?</h4>
            <p class="text-xs text-[var(--dam-ink-muted)] mt-1">
              Are you sure you want to delete this department? Any nested sub-departments will also be unlinked.
            </p>
          </div>
          <div class="flex justify-center gap-3 pt-2">
            <UButton color="neutral" variant="ghost" @click="isDeleteModalOpen = false">Cancel</UButton>
            <UButton color="error" variant="solid" :loading="saving" @click="confirmDeleteDept">Delete</UButton>
          </div>
        </div>
      </div>
    </Teleport>
  </AppMain>
</template>
