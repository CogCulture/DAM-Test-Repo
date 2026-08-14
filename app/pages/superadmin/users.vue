<script setup lang="ts">
import { useToast } from "~/composables/useToast";
definePageMeta({ layout: "superadmin", middleware: "superadmin" });

const toast = useToast();
const { data: users, refresh, pending } = await useFetch<any[]>("/api/superadmin/users");

// Orgs for reassignment
const { data: orgsData } = await useFetch<any>("/api/superadmin/organizations");
const orgs = computed(() => orgsData.value?.organizations ?? []);

const search = ref("");
const filterOrg = ref("");
const filterRole = ref("");
const filterStatus = ref("");

const filteredUsers = computed(() => {
  let list = users.value ?? [];
  const q = search.value.toLowerCase();
  if (q) {
    list = list.filter((u: any) =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.organizationName?.toLowerCase().includes(q)
    );
  }
  if (filterOrg.value) {
    list = list.filter((u: any) => (filterOrg.value === "unassigned" ? !u.organizationId : u.organizationId === filterOrg.value));
  }
  if (filterRole.value) list = list.filter((u: any) => u.role === filterRole.value);
  if (filterStatus.value) list = list.filter((u: any) => u.approvalStatus === filterStatus.value);
  return list;
});

// Edit modal state
const editingUser = ref<any>(null);
const editForm = ref({ organizationId: "", role: "", approvalStatus: "" });
const editLoading = ref(false);

const openEdit = (user: any) => {
  editingUser.value = user;
  editForm.value = {
    organizationId: user.organizationId ?? "",
    role: user.role ?? "team_member",
    approvalStatus: user.approvalStatus ?? "active",
  };
};

const saveUser = async () => {
  if (!editingUser.value) return;
  editLoading.value = true;
  try {
    await $fetch(`/api/superadmin/users/${editingUser.value.id}`, {
      method: "PUT",
      body: {
        organizationId: editForm.value.organizationId || null,
        role: editForm.value.role,
        approvalStatus: editForm.value.approvalStatus,
      },
    });
    toast.add({ title: "User updated", color: "success" });
    editingUser.value = null;
    await refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Update failed", color: "error" });
  } finally {
    editLoading.value = false;
  }
};

const deleteUser = async (user: any) => {
  if (!user) return;
  if (!window.confirm(`Are you sure you want to remove ${user.name} (${user.email})? This will delete their login entirely.`)) {
    return;
  }
  editLoading.value = true;
  try {
    await $fetch(`/api/superadmin/users/${user.id}`, {
      method: "DELETE",
    });
    toast.add({ title: "User removed successfully", color: "success" });
    editingUser.value = null;
    await refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Removal failed", color: "error" });
  } finally {
    editLoading.value = false;
  }
};

const roleColors: Record<string, string> = {
  admin: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  dept_head: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  team_lead: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  team_member: "text-slate-300 bg-slate-500/10 border-slate-500/20",
  intern: "text-amber-400 bg-amber-500/10 border-amber-500/20",
};

const statusColors: Record<string, string> = {
  active: "text-emerald-400 bg-emerald-500/10",
  pending: "text-amber-400 bg-amber-500/10",
  pending_org: "text-orange-400 bg-orange-500/10",
  rejected: "text-red-400 bg-red-500/10",
  needs_profile: "text-slate-400 bg-slate-500/10",
};

const formatDate = (d: any) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
</script>

<template>
  <div class="p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-white">All Users</h1>
        <p class="text-slate-400 text-sm mt-1">{{ filteredUsers.length }} of {{ users?.length ?? 0 }} users across all organizations</p>
      </div>
      <button @click="refresh()" class="text-slate-400 hover:text-white transition-colors">
        <Icon name="lucide:refresh-cw" class="w-5 h-5" />
      </button>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3">
      <input
        v-model="search"
        placeholder="Search name, email, org..."
        class="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl px-4 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 w-64 transition-all"
      />
      <select v-model="filterOrg" class="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-violet-500">
        <option value="">All Organizations</option>
        <option value="unassigned">⚠️ Unassigned</option>
        <option v-for="org in orgs" :key="org.id" :value="org.id">{{ org.name }}</option>
      </select>
      <select v-model="filterRole" class="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-violet-500">
        <option value="">All Roles</option>
        <option value="admin">Admin</option>
        <option value="dept_head">Dept Head</option>
        <option value="team_lead">Team Lead</option>
        <option value="team_member">Team Member</option>
        <option value="intern">Intern</option>
      </select>
      <select v-model="filterStatus" class="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-violet-500">
        <option value="">All Statuses</option>
        <option value="active">Active</option>
        <option value="pending">Pending</option>
        <option value="pending_org">Pending Org</option>
        <option value="needs_profile">Needs Profile</option>
        <option value="rejected">Rejected</option>
      </select>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center py-24">
      <Icon name="lucide:loader" class="animate-spin w-8 h-8 text-slate-500" />
    </div>

    <!-- Table -->
    <div v-else class="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl overflow-hidden">
      <div v-if="!filteredUsers.length" class="flex flex-col items-center justify-center py-20 text-slate-500">
        <Icon name="lucide:user-x" class="w-12 h-12 mb-4 opacity-30" />
        <p class="text-sm">No users found matching your filters</p>
      </div>

      <table v-else class="w-full text-sm">
        <thead class="border-b border-[#1e1e2e]">
          <tr>
            <th class="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-4">User</th>
            <th class="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-4">Organization</th>
            <th class="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-4">Role</th>
            <th class="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-4">Status</th>
            <th class="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-4">Joined</th>
            <th class="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-4">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[#1a1a25]">
          <tr v-for="user in filteredUsers" :key="user.id" class="hover:bg-white/[0.02] transition-colors group">
            <!-- User info -->
            <td class="px-6 py-4">
              <div class="flex items-center gap-3">
                <div class="relative flex-shrink-0">
                  <img v-if="user.avatar" :src="user.avatar" :alt="user.name" class="w-9 h-9 rounded-xl object-cover" />
                  <div v-else class="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold"
                    :class="user.role === 'admin' ? 'bg-violet-500/20 text-violet-400' : 'bg-slate-700 text-slate-300'">
                    {{ user.name?.[0]?.toUpperCase() ?? '?' }}
                  </div>
                </div>
                <div class="min-w-0">
                  <p class="text-white font-medium truncate">{{ user.name }}</p>
                  <p class="text-xs text-slate-500 truncate">{{ user.email }}</p>
                </div>
              </div>
            </td>

            <!-- Organization -->
            <td class="px-4 py-4">
              <span v-if="user.organizationName" class="text-sm text-slate-300">{{ user.organizationName }}</span>
              <span v-else class="flex items-center gap-1 text-xs text-amber-400">
                <Icon name="lucide:alert-triangle" class="w-3 h-3" />
                Unassigned
              </span>
            </td>

            <!-- Role -->
            <td class="px-4 py-4">
              <span :class="roleColors[user.role] ?? 'text-slate-400 bg-slate-500/10 border-slate-500/20'"
                class="text-xs font-semibold px-2.5 py-1 rounded-full border capitalize whitespace-nowrap">
                {{ user.role?.replace('_', ' ') }}
              </span>
            </td>

            <!-- Status -->
            <td class="px-4 py-4">
              <span :class="statusColors[user.approvalStatus] ?? 'text-slate-400 bg-slate-500/10'"
                class="text-xs font-medium px-2 py-0.5 rounded-full capitalize whitespace-nowrap">
                {{ user.approvalStatus?.replace('_', ' ') }}
              </span>
            </td>

            <!-- Joined -->
            <td class="px-4 py-4">
              <span class="text-xs text-slate-500 whitespace-nowrap">{{ formatDate(user.createdAt) }}</span>
            </td>

            <!-- Actions -->
            <td class="px-6 py-4 text-right">
              <div class="flex justify-end gap-2">
                <button @click="openEdit(user)"
                  class="text-xs font-medium text-slate-400 hover:text-white border border-[#1e1e2e] hover:border-violet-500/40 px-3 py-1.5 rounded-lg transition-all">
                  Edit
                </button>
                <button @click="deleteUser(user)"
                  class="text-xs font-medium text-red-400 hover:text-white border border-[#1e1e2e] hover:border-red-500/40 px-3 py-1.5 rounded-lg transition-all bg-red-500/5 hover:bg-red-500/20">
                  Remove
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Edit Modal -->
    <div v-if="editingUser" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div class="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6 w-full max-w-md mx-4 space-y-5 shadow-2xl">
        <div class="flex items-center justify-between">
          <h2 class="text-white font-semibold text-lg">Edit User</h2>
          <button @click="editingUser = null" class="text-slate-500 hover:text-white transition-colors">
            <Icon name="lucide:x" class="w-5 h-5" />
          </button>
        </div>

        <!-- User preview -->
        <div class="flex items-center gap-3 p-3 bg-[#0a0a10] rounded-xl border border-[#1a1a25]">
          <img v-if="editingUser.avatar" :src="editingUser.avatar" class="w-10 h-10 rounded-xl object-cover" />
          <div v-else class="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center text-white font-bold">
            {{ editingUser.name?.[0]?.toUpperCase() ?? '?' }}
          </div>
          <div>
            <p class="text-white font-medium">{{ editingUser.name }}</p>
            <p class="text-xs text-slate-500">{{ editingUser.email }}</p>
          </div>
        </div>

        <!-- Organization -->
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Organization</label>
          <select v-model="editForm.organizationId"
            class="w-full bg-[#0a0a10] border border-[#1e1e2e] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-all">
            <option value="">None (Unassigned)</option>
            <option v-for="org in orgs" :key="org.id" :value="org.id">{{ org.name }}</option>
          </select>
        </div>

        <!-- Role -->
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</label>
          <select v-model="editForm.role"
            class="w-full bg-[#0a0a10] border border-[#1e1e2e] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-all">
            <option value="admin">Admin</option>
            <option value="dept_head">Department Head</option>
            <option value="team_lead">Team Lead</option>
            <option value="team_member">Team Member</option>
            <option value="intern">Intern</option>
          </select>
        </div>

        <!-- Approval Status -->
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Approval Status</label>
          <select v-model="editForm.approvalStatus"
            class="w-full bg-[#0a0a10] border border-[#1e1e2e] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-all">
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="pending_org">Pending Org</option>
            <option value="needs_profile">Needs Profile</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <!-- Actions -->
        <div class="flex flex-col gap-2.5 pt-2">
          <div class="flex gap-3">
            <button @click="editingUser = null"
              class="flex-1 border border-[#1e1e2e] text-slate-400 hover:text-white rounded-xl py-2.5 text-sm font-medium transition-all hover:border-slate-500">
              Cancel
            </button>
            <button @click="saveUser" :disabled="editLoading"
              class="flex-1 bg-violet-600 hover:bg-violet-500 text-white rounded-xl py-2.5 text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              <Icon v-if="editLoading" name="lucide:loader" class="w-4 h-4 animate-spin" />
              Save Changes
            </button>
          </div>
          <button @click="deleteUser(editingUser)" :disabled="editLoading"
            class="w-full border border-red-500/20 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-400 rounded-xl py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-2">
            <Icon v-if="editLoading" name="lucide:loader" class="w-4 h-4 animate-spin" />
            Remove User Entirely
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
