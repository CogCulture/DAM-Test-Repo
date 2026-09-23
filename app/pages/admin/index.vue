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
const activeTab = ref<"pending" | "all">("pending");
const searchQuery = ref("");
const statusFilter = ref("all");
const roleFilter = ref("all");

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
            <span class="text-xs font-semibold text-[var(--dam-ink-muted)] uppercase tracking-wider">Department Heads</span>
            <div class="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
              <Icon name="lucide:shield-check" class="size-5" />
            </div>
          </div>
          <div class="mt-3 flex items-baseline gap-2">
            <span class="text-3xl font-bold text-indigo-400">{{ totalDeptHeadsCount }}</span>
            <span class="text-xs text-[var(--dam-ink-muted)]">domain managers</span>
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
            class="flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition"
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
            class="flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition"
            :class="activeTab === 'all' ? 'bg-[var(--dam-panel-raised)] text-indigo-400 shadow-sm border border-[var(--dam-line)]' : 'text-[var(--dam-ink-muted)] hover:text-[var(--dam-ink)]'"
            @click="activeTab = 'all'"
          >
            <Icon name="lucide:users" class="size-4 text-emerald-500" />
            All Organization Members
            <span class="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-bold">
              {{ totalMembersCount }}
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
              placeholder="Search by name or email..."
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
