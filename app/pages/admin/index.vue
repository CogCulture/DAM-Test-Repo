<script setup lang="ts">
import { ref, computed } from "vue";
import { useRole } from "~/composables/useRole";
import { useToast } from "~/composables/useToast";
import { getDepartmentName } from "~~/shared/constants/departments";
import { getRoleLabel } from "~~/shared/constants/roles";

const { isAdmin, isDeptHead, canApproveUsers } = useRole();
const toast = useToast();

if (!canApproveUsers.value) {
  navigateTo("/");
}

const { data: pendingUsersData, refresh: refreshPending } = await useFetch("/api/admin/users/pending");
const { data: allUsersData, refresh: refreshAll } = (isAdmin.value || isDeptHead.value)
  ? await useFetch("/api/admin/users")
  : { data: ref([]), refresh: () => {} };

const { data: orgSettings } = await useFetch("/api/organizations/settings");

// UI States
const route = useRoute();
const activeTab = ref<"pending" | "all" | "folders">(
  (route.query.tab as any) === "folders" ? "folders" : (route.query.tab as any) === "all" ? "all" : "pending"
);

watch(() => route.query.tab, (tab) => {
  if (tab === "folders" || tab === "all" || tab === "pending") {
    activeTab.value = tab;
  }
});

const searchQuery = ref("");
const statusFilter = ref("all");
const roleFilter = ref("all");

// Folder Requests State & Handlers
const { data: folderRequestsData, refresh: refreshFolderRequests } = await useFetch<any[]>("/api/folder-requests");
const folderRequestsList = computed(() => {
  const d = folderRequestsData.value;
  return Array.isArray(d) ? d : (d as any)?.data || [];
});
const pendingFolderRequests = computed(() => folderRequestsList.value.filter((r: any) => r.status === "pending"));
const reviewedFolderRequests = computed(() => folderRequestsList.value.filter((r: any) => r.status !== "pending"));
const totalPendingFoldersCount = computed(() => pendingFolderRequests.value.length);

const filteredPendingFolderRequests = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return pendingFolderRequests.value;
  return pendingFolderRequests.value.filter((r: any) =>
    r.folderName?.toLowerCase().includes(q) ||
    r.requesterName?.toLowerCase().includes(q) ||
    getDepartmentName(r.departmentId)?.toLowerCase().includes(q)
  );
});

const filteredReviewedFolderRequests = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return reviewedFolderRequests.value;
  return reviewedFolderRequests.value.filter((r: any) =>
    r.folderName?.toLowerCase().includes(q) ||
    r.requesterName?.toLowerCase().includes(q) ||
    getDepartmentName(r.departmentId)?.toLowerCase().includes(q)
  );
});

const actioningFolder = ref<string | null>(null);
const reviewNotes = reactive<Record<string, string>>({});

const handleFolderReview = async (id: string, action: "approve" | "reject") => {
  actioningFolder.value = id;
  try {
    await $fetch(`/api/folder-requests/${id}`, {
      method: "POST",
      body: { action, reviewNote: reviewNotes[id]?.trim() || undefined },
    });
    toast.add({
      title: action === "approve" ? "Folder request approved & created" : "Folder request rejected",
      color: action === "approve" ? "success" : "neutral",
    });
    await refreshFolderRequests();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error updating folder request", color: "error" });
  } finally {
    actioningFolder.value = null;
  }
};

const getDestinationPath = (req: any) => {
  let parentPath = "";
  if (req.parentId === "root") {
    parentPath = req.bucketName;
  } else if (req.parentId?.startsWith("dept_")) {
    const deptId = req.parentId.substring(5);
    parentPath = `${req.bucketName}/${deptId}`;
  } else {
    parentPath = req.parentPath || req.parentId;
  }
  return `${parentPath}/${req.folderName}`;
};

const folderStatusColor = (status: string) => {
  if (status === "approved") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (status === "rejected") return "bg-red-500/10 text-red-400 border-red-500/20";
  return "bg-amber-500/10 text-amber-500 border-amber-500/20";
};

const actioning = ref<string | null>(null);
const editingUser = ref<any>(null);
const editForm = ref({ role: "", departmentId: "" });
const savingEdit = ref(false);

const pendingUsers = computed(() => {
  const list = Array.isArray(pendingUsersData.value) ? pendingUsersData.value : (pendingUsersData.value as any)?.data || [];
  return list;
});

const allUsers = computed(() => {
  const list = Array.isArray(allUsersData.value) ? allUsersData.value : (allUsersData.value as any)?.data || [];
  return list;
});

// Metrics
const totalPendingCount = computed(() => pendingUsers.value.length);
const totalActiveCount = computed(() => allUsers.value.filter((u: any) => u.approvalStatus === "active").length);
const totalDeptHeadsCount = computed(() => allUsers.value.filter((u: any) => u.role === "dept_head").length);
const totalMembersCount = computed(() => allUsers.value.length);

// Filtered Lists
const filteredPendingUsers = computed(() => {
  return pendingUsers.value.filter((user: any) => {
    const q = searchQuery.value.toLowerCase();
    const matchName = user.name?.toLowerCase().includes(q) || user.email?.toLowerCase().includes(q);
    return matchName;
  });
});

const filteredAllUsers = computed(() => {
  return allUsers.value.filter((user: any) => {
    const q = searchQuery.value.toLowerCase();
    const matchName = !q || user.name?.toLowerCase().includes(q) || user.email?.toLowerCase().includes(q);
    const matchStatus = statusFilter.value === "all" || user.approvalStatus === statusFilter.value;
    const matchRole =
      roleFilter.value === "all" ||
      user.role === roleFilter.value ||
      (roleFilter.value === "guest" && user.role === "intern");
    return matchName && matchStatus && matchRole;
  });
});

const openEditModal = (user: any) => {
  editingUser.value = user;
  editForm.value = {
    role: user.role === "intern" ? "guest" : user.role || "team_member",
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
    let toastTitle = "User access approved";
    let toastColor: any = "success";
    if (action === "reject") {
      toastTitle = "User request rejected";
      toastColor = "error";
    } else if (action === "remove") {
      toastTitle = "User removed from organization";
      toastColor = "warning";
    }
    toast.add({
      title: toastTitle,
      color: toastColor,
    });
    await refreshPending();
    await refreshAll();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error processing user action", color: "error" });
  } finally {
    actioning.value = null;
  }
};
</script>

<template>
  <AppMain 
    title="User Approvals & Member Governance" 
    description="Review pending access requests, approve organization members, and manage assigned roles and department scopes."
    icon="lucide:user-check"
  >
    <div class="max-w-6xl mx-auto space-y-8">
      <!-- Executive Summary Cards -->
      <section class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-5 shadow-sm hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider">Pending Approvals</span>
            <div class="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Icon name="lucide:clock" class="size-5" />
            </div>
          </div>
          <div class="mt-3 flex items-baseline gap-2">
            <span class="text-3xl font-bold text-amber-500">{{ totalPendingCount }}</span>
            <span class="text-xs text-[var(--dam-ink-muted)]">awaiting review</span>
          </div>
        </div>

        <div class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-5 shadow-sm hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider">Active Members</span>
            <div class="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Icon name="lucide:user-check" class="size-5" />
            </div>
          </div>
          <div class="mt-3 flex items-baseline gap-2">
            <span class="text-3xl font-bold text-emerald-500">{{ totalActiveCount }}</span>
            <span class="text-xs text-[var(--dam-ink-muted)]">approved users</span>
          </div>
        </div>

        <div class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-5 shadow-sm hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider">Folder Requests</span>
            <div class="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Icon name="lucide:folder-plus" class="size-5" />
            </div>
          </div>
          <div class="mt-3 flex items-baseline gap-2">
            <span class="text-3xl font-bold text-blue-400">{{ totalPendingFoldersCount }}</span>
            <span class="text-xs text-[var(--dam-ink-muted)]">awaiting review</span>
          </div>
        </div>

        <div class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-5 shadow-sm hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider">Total Registered</span>
            <div class="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Icon name="lucide:users" class="size-5" />
            </div>
          </div>
          <div class="mt-3 flex items-baseline gap-2">
            <span class="text-3xl font-bold text-[var(--dam-ink)]">{{ totalMembersCount }}</span>
            <span class="text-xs text-[var(--dam-ink-muted)]">accounts</span>
          </div>
        </div>
      </section>

      <!-- Control Toolbar & Navigation Tabs -->
      <section class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <!-- Tabs Switcher -->
        <div class="flex items-center p-1 bg-[var(--dam-bg)] border border-[var(--dam-line)] rounded-xl w-full md:w-auto">
          <button
            type="button"
            class="flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition cursor-pointer"
            :class="activeTab === 'pending' ? 'bg-[var(--dam-panel-raised)] text-indigo-400 shadow-sm border border-[var(--dam-line)]' : 'text-[var(--dam-ink-muted)] hover:text-[var(--dam-ink)]'"
            @click="activeTab = 'pending'"
          >
            <Icon name="lucide:clock" class="size-4 text-amber-500" />
            Pending Requests
            <span v-if="totalPendingCount > 0" class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
              {{ totalPendingCount }}
            </span>
          </button>

          <button
            type="button"
            class="flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition cursor-pointer"
            :class="activeTab === 'all' ? 'bg-[var(--dam-panel-raised)] text-indigo-400 shadow-sm border border-[var(--dam-line)]' : 'text-[var(--dam-ink-muted)] hover:text-[var(--dam-ink)]'"
            @click="activeTab = 'all'"
          >
            <Icon name="lucide:users" class="size-4 text-emerald-500" />
            All Organization Members
            <span class="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-bold">
              {{ totalMembersCount }}
            </span>
          </button>

          <button
            type="button"
            class="flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition cursor-pointer"
            :class="activeTab === 'folders' ? 'bg-[var(--dam-panel-raised)] text-indigo-400 shadow-sm border border-[var(--dam-line)]' : 'text-[var(--dam-ink-muted)] hover:text-[var(--dam-ink)]'"
            @click="activeTab = 'folders'"
          >
            <Icon name="lucide:folder-plus" class="size-4 text-blue-500" />
            Folder Requests
            <span v-if="totalPendingFoldersCount > 0" class="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold">
              {{ totalPendingFoldersCount }}
            </span>
          </button>
        </div>

        <!-- Search & Filter Options -->
        <div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div class="relative w-full sm:w-64">
            <Icon name="lucide:search" class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--dam-ink-muted)]" />
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="activeTab === 'folders' ? 'Search folder requests...' : 'Search by name or email...'"
              class="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] text-[var(--dam-ink)] placeholder-[var(--dam-ink-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

          <div v-if="activeTab === 'all'" class="flex items-center gap-2 w-full sm:w-auto">
            <select
              v-model="statusFilter"
              class="w-full sm:w-auto px-3 py-2 text-xs rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] text-[var(--dam-ink)] focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>

            <select
              v-model="roleFilter"
              class="w-full sm:w-auto px-3 py-2 text-xs rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] text-[var(--dam-ink)] focus:outline-none"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="dept_head">Dept Head</option>
              <option value="team_lead">Team Lead</option>
              <option value="team_member">Team Member</option>
              <option value="guest">Guest</option>
            </select>
          </div>
        </div>
      </section>

      <!-- TAB 1: PENDING APPROVALS LIST -->
      <section v-if="activeTab === 'pending'" class="space-y-4">
        <div v-if="filteredPendingUsers.length === 0" class="text-center py-16 bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl space-y-3">
          <div class="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
            <Icon name="lucide:check-circle-2" class="size-7" />
          </div>
          <h3 class="text-base font-bold text-[var(--dam-ink)]">All Clear! No Pending Approvals</h3>
          <p class="text-xs text-[var(--dam-ink-muted)] max-w-sm mx-auto">
            Every user account request has been reviewed and granted access.
          </p>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="user in filteredPendingUsers"
            :key="user.id"
            class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] hover:border-amber-500/50 rounded-2xl p-5 shadow-sm hover:shadow-md transition space-y-4 flex flex-col justify-between"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3.5">
                <img v-if="user.avatar" :src="user.avatar" class="size-12 rounded-full border-2 border-amber-500/40 object-cover" />
                <div v-else class="size-12 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-base border border-amber-500/30">
                  {{ user.name?.charAt(0) || 'U' }}
                </div>
                <div>
                  <h4 class="text-base font-bold text-[var(--dam-ink)]">{{ user.name }}</h4>
                  <p class="text-xs text-[var(--dam-ink-muted)]">{{ user.email }}</p>
                </div>
              </div>

              <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30 uppercase tracking-wider">
                Awaiting Approval
              </span>
            </div>

            <div class="bg-[var(--dam-bg)] border border-[var(--dam-line)] rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span class="text-[10px] font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider block">Requested Role</span>
                <span class="font-bold text-indigo-400 mt-0.5 block">{{ getRoleLabel(user.role as any) }}</span>
              </div>
              <div>
                <span class="text-[10px] font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider block">Department Domain</span>
                <span class="font-bold text-[var(--dam-ink)] mt-0.5 block">{{ getDepartmentName(user.departmentId ?? "") }}</span>
              </div>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-[var(--dam-line)]">
              <UButton
                size="sm"
                color="error"
                variant="ghost"
                class="rounded-xl"
                :loading="actioning === user.id"
                icon="lucide:x"
                @click="handleAction(user.id, 'reject')"
              >
                Reject Request
              </UButton>
              <UButton
                size="sm"
                color="success"
                variant="solid"
                class="rounded-xl shadow-xs"
                :loading="actioning === user.id"
                icon="lucide:check"
                @click="handleAction(user.id, 'approve')"
              >
                Approve Access
              </UButton>
            </div>
          </div>
        </div>
      </section>

      <!-- TAB 2: ALL ORGANIZATION MEMBERS TABLE -->
      <section v-else-if="activeTab === 'all'" class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl overflow-hidden shadow-sm">
        <table class="w-full text-sm text-left">
          <thead class="bg-[var(--dam-bg)] text-[var(--dam-ink-muted)] uppercase text-[10px] font-bold tracking-wider border-b border-[var(--dam-line)]">
            <tr>
              <th class="px-5 py-4">User Member</th>
              <th class="px-5 py-4">System Role</th>
              <th class="px-5 py-4">Department Scope</th>
              <th class="px-5 py-4">Status</th>
              <th class="px-5 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--dam-line)] text-[var(--dam-ink)]">
            <tr v-for="user in filteredAllUsers" :key="user.id" class="hover:bg-[var(--dam-bg)]/50 transition">
              <td class="px-5 py-4">
                <div class="flex items-center gap-3">
                  <img v-if="user.avatar" :src="user.avatar" class="size-10 rounded-full border border-[var(--dam-line)] object-cover" />
                  <div v-else class="size-10 rounded-full bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center text-xs border border-indigo-500/30">
                    {{ user.name?.charAt(0) || 'U' }}
                  </div>
                  <div>
                    <div class="font-bold text-[var(--dam-ink)]">{{ user.name }}</div>
                    <div class="text-xs text-[var(--dam-ink-muted)]">{{ user.email }}</div>
                  </div>
                </div>
              </td>
              <td class="px-5 py-4 text-xs">
                <span class="px-2.5 py-1 rounded-full font-bold bg-[var(--dam-bg)] text-indigo-400 border border-[var(--dam-line)]">
                  {{ getRoleLabel(user.role as any) }}
                </span>
              </td>
              <td class="px-5 py-4 text-xs font-semibold text-[var(--dam-ink)]">
                {{ getDepartmentName(user.departmentId ?? "") }}
              </td>
              <td class="px-5 py-4 text-xs">
                <span 
                  class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                  :class="user.approvalStatus === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : user.approvalStatus === 'pending' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'"
                >
                  {{ user.approvalStatus }}
                </span>
              </td>
              <td class="px-5 py-4 text-right flex items-center justify-end gap-2">
                <UButton
                  v-if="user.approvalStatus === 'pending'"
                  size="xs"
                  color="success"
                  variant="solid"
                  icon="lucide:check"
                  class="rounded-lg"
                  :loading="actioning === user.id"
                  @click="handleAction(user.id, 'approve')"
                >
                  Approve
                </UButton>
                <UButton
                  v-if="user.role !== 'admin'"
                  size="xs"
                  color="primary"
                  variant="soft"
                  icon="lucide:pencil"
                  class="rounded-lg"
                  @click="openEditModal(user)"
                >
                  Edit Scope
                </UButton>
                <UButton
                  v-if="user.role !== 'admin'"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="lucide:user-minus"
                  class="rounded-lg text-red-400 hover:bg-red-500/10"
                  :loading="actioning === user.id"
                  @click="handleAction(user.id, 'remove')"
                >
                  Revoke
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- TAB 3: FOLDER REQUESTS SUBSECTION -->
      <section v-else-if="activeTab === 'folders'" class="space-y-6">
        <!-- Awaiting Review Section -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wider text-[var(--dam-ink-muted)] flex items-center gap-2">
              <Icon name="lucide:clock" class="size-4 text-amber-500" />
              Folder Requests Awaiting Review
            </h3>
            <span v-if="totalPendingFoldersCount > 0" class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {{ totalPendingFoldersCount }} pending
            </span>
          </div>

          <div v-if="filteredPendingFolderRequests.length === 0" class="text-center py-14 bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl space-y-3">
            <div class="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
              <Icon name="lucide:folder-check" class="size-7" />
            </div>
            <h4 class="text-base font-bold text-[var(--dam-ink)]">All Clear! No Pending Folder Requests</h4>
            <p class="text-xs text-[var(--dam-ink-muted)] max-w-sm mx-auto">
              All team lead folder creation requests have been reviewed.
            </p>
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="req in filteredPendingFolderRequests"
              :key="req.id"
              class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[var(--dam-panel-solid)] border border-amber-500/30 hover:border-amber-500/60 rounded-2xl p-5 shadow-sm transition"
            >
              <div class="flex items-start gap-4 flex-1 min-w-0">
                <div class="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon name="lucide:folder-plus" class="size-5 text-amber-400" />
                </div>
                <div class="min-w-0 space-y-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-base text-[var(--dam-ink)] truncate">{{ req.folderName }}</span>
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider">
                      Pending
                    </span>
                  </div>
                  <p class="text-xs text-[var(--dam-ink-muted)]">
                    Requested by <span class="font-semibold text-[var(--dam-ink)]">{{ req.requesterName || 'User' }}</span> · 
                    <span class="font-semibold text-indigo-400">{{ getDepartmentName(req.departmentId) }}</span>
                  </p>
                  <p class="text-[11px] font-mono text-[var(--dam-ink-muted)] flex items-center gap-1">
                    <Icon name="lucide:corner-down-right" class="size-3 text-neutral-400 shrink-0" />
                    Destination: <span class="text-[var(--dam-ink)]">{{ getDestinationPath(req) }}</span>
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2.5 w-full md:w-auto shrink-0 justify-end pt-2 md:pt-0 border-t md:border-t-0 border-[var(--dam-line)]">
                <input
                  v-model="reviewNotes[req.id]"
                  type="text"
                  placeholder="Optional review note..."
                  class="px-3.5 py-2 text-xs rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] text-[var(--dam-ink)] placeholder-[var(--dam-ink-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 w-48 sm:w-56"
                  :disabled="actioningFolder === req.id"
                />
                <UButton
                  size="sm"
                  color="success"
                  variant="solid"
                  icon="lucide:check"
                  class="rounded-xl shadow-xs"
                  :loading="actioningFolder === req.id"
                  @click="handleFolderReview(req.id, 'approve')"
                >
                  Approve
                </UButton>
                <UButton
                  size="sm"
                  color="error"
                  variant="ghost"
                  icon="lucide:x"
                  class="rounded-xl"
                  :loading="actioningFolder === req.id"
                  @click="handleFolderReview(req.id, 'reject')"
                >
                  Reject
                </UButton>
              </div>
            </div>
          </div>
        </div>

        <!-- Review History Section -->
        <div v-if="filteredReviewedFolderRequests.length > 0" class="space-y-3 pt-4 border-t border-[var(--dam-line)]">
          <h3 class="text-xs font-bold uppercase tracking-wider text-[var(--dam-ink-muted)] flex items-center gap-2">
            <Icon name="lucide:history" class="size-4 text-neutral-400" />
            Folder Review History
          </h3>

          <div class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl overflow-hidden shadow-sm divide-y divide-[var(--dam-line)]">
            <div
              v-for="req in filteredReviewedFolderRequests"
              :key="req.id"
              class="p-4 flex items-center justify-between gap-4 transition hover:bg-[var(--dam-bg)]/40"
            >
              <div class="flex items-center gap-3.5 min-w-0">
                <div class="w-9 h-9 rounded-xl bg-[var(--dam-bg)] border border-[var(--dam-line)] flex items-center justify-center shrink-0">
                  <Icon name="lucide:folder" class="size-4 text-[var(--dam-ink-muted)]" />
                </div>
                <div class="min-w-0 space-y-0.5">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-sm text-[var(--dam-ink)] truncate">{{ req.folderName }}</span>
                    <span
                      class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                      :class="folderStatusColor(req.status)"
                    >
                      {{ req.status }}
                    </span>
                  </div>
                  <p class="text-xs text-[var(--dam-ink-muted)]">
                    Requested by {{ req.requesterName || 'User' }} · {{ getDepartmentName(req.departmentId) }}
                    <span v-if="req.reviewNote" class="text-neutral-400 italic"> — Note: "{{ req.reviewNote }}"</span>
                  </p>
                </div>
              </div>

              <span class="text-[11px] font-mono text-[var(--dam-ink-muted)] hidden sm:block truncate max-w-xs text-right">
                {{ getDestinationPath(req) }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- EDIT USER ROLE & SCOPE MODAL -->
      <Teleport to="body">
        <div v-if="editingUser" class="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" @click.self="editingUser = null">
          <div class="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] text-[var(--dam-ink)] shadow-2xl p-6 space-y-6" @click.stop>
            <div class="flex items-center justify-between border-b border-[var(--dam-line)] pb-4">
              <h3 class="text-base font-bold text-[var(--dam-ink)] flex items-center gap-2">
                <Icon name="lucide:user-cog" class="text-indigo-500 size-5" />
                Edit Member Scope: {{ editingUser.name }}
              </h3>
              <UButton color="neutral" variant="ghost" icon="lucide:x" @click="editingUser = null" />
            </div>

            <div class="space-y-4">
              <div>
                <label for="edit-user-department-select" class="block text-xs font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider mb-2">Assigned Department</label>
                <select
                  id="edit-user-department-select"
                  v-model="editForm.departmentId"
                  class="w-full bg-[var(--dam-bg)] border border-[var(--dam-line)] rounded-xl px-4 py-2.5 text-[var(--dam-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                >
                  <option value="">Global / Unassigned Domain</option>
                  <option v-for="dept in orgSettings?.departments || []" :key="dept.id" :value="dept.id">
                    {{ dept.name }}
                  </option>
                </select>
              </div>

              <div>
                <label for="edit-user-role-select" class="block text-xs font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider mb-2">System Role Level</label>
                <select
                  id="edit-user-role-select"
                  v-model="editForm.role"
                  class="w-full bg-[var(--dam-bg)] border border-[var(--dam-line)] rounded-xl px-4 py-2.5 text-[var(--dam-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                >
                  <option value="admin">Organization Admin</option>
                  <option value="dept_head">Department Head</option>
                  <option value="team_lead">Team Lead</option>
                  <option value="team_member">Team Member</option>
                  <option value="guest">Guest</option>
                </select>
              </div>
            </div>

            <div class="flex justify-end gap-3 pt-4 border-t border-[var(--dam-line)] bg-[var(--dam-bg)] -mx-6 -mb-6 px-6 py-4">
              <UButton color="neutral" variant="ghost" @click="editingUser = null">Cancel</UButton>
              <UButton color="primary" variant="solid" :loading="savingEdit" @click="saveUserEdit">Save Changes</UButton>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </AppMain>
</template>
