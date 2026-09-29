<script setup lang="ts">
import { useToast } from "~/composables/useToast";

definePageMeta({ layout: "superadmin", middleware: "superadmin" });

const { data: orgs, refresh } = await useFetch<any[]>("/api/superadmin/organizations");

const toast = useToast();
const actionLoading = ref<string | null>(null);

// Client onboarding modal state
const createModalOpen = ref(false);
const createLoading = ref(false);
const newOrgForm = ref({
  name: "",
  orgType: "s3" as "s3" | "gdrive",
  adminEmail: "",
});

const handleCreateOrg = async () => {
  if (!newOrgForm.value.name.trim()) {
    toast.add({ title: "Organization name is required", color: "error" });
    return;
  }
  createLoading.value = true;
  try {
    const res: any = await $fetch("/api/superadmin/organizations", {
      method: "POST",
      body: newOrgForm.value,
    });
    toast.add({
      title: "Client Onboarded Successfully",
      description: `Organization "${res.name}" workspace created.`,
      color: "success",
    });
    createModalOpen.value = false;
    newOrgForm.value = { name: "", orgType: "s3", adminEmail: "" };
    refresh();
  } catch (err: any) {
    toast.add({
      title: "Failed to onboard client",
      description: err?.data?.message || err?.message || "An error occurred.",
      color: "error",
    });
  } finally {
    createLoading.value = false;
  }
};

const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const toggleStatus = async (org: any) => {
  const newStatus = org.status === "active" ? "suspended" : "active";
  actionLoading.value = org.id;
  try {
    await $fetch(`/api/superadmin/organizations/${org.id}/status`, {
      method: "PUT",
      body: { status: newStatus },
    });
    toast.add({ title: `Organization ${newStatus === "suspended" ? "suspended" : "reactivated"}`, color: newStatus === "active" ? "success" : "warning" });
    refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error", color: "error" });
  } finally {
    actionLoading.value = null;
  }
};

const deleteOrg = async (org: any) => {
  const message = `Are you absolutely sure you want to delete "${org.name}"?\n\nThis will permanently delete the organization, all departments, permissions, nomenclatures, and buckets.\n\nAll users belonging to this organization will be DELETED, resetting them to fresh signups. This action CANNOT be undone.`;
  if (!confirm(message)) return;

  actionLoading.value = org.id;
  try {
    await $fetch(`/api/superadmin/organizations/${org.id}`, {
      method: "DELETE",
    });
    toast.add({ title: `Organization "${org.name}" deleted successfully`, color: "success" });
    refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error deleting organization", color: "error" });
  } finally {
    actionLoading.value = null;
  }
};

const searchQuery = ref("");
const filteredOrgs = computed(() => {
  if (!orgs.value) return [];
  const q = searchQuery.value.toLowerCase();
  if (!q) return orgs.value;
  return orgs.value.filter((o) => o.name.toLowerCase().includes(q));
});
</script>

<template>
  <div class="p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Client Organizations</h1>
        <p class="text-slate-400 text-sm mt-1">Onboard & manage isolated client workspaces, features, and storage</p>
      </div>
      <div class="flex items-center gap-3">
        <input
          v-model="searchQuery"
          placeholder="Search organizations..."
          class="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 w-56 transition-all"
        />
        <button
          @click="createModalOpen = true"
          class="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium px-4 py-2 rounded-xl text-sm shadow-lg shadow-indigo-500/25 transition-all cursor-pointer"
        >
          <Icon name="lucide:building-2" class="w-4 h-4" />
          <span>Onboard Client</span>
        </button>
        <button @click="refresh" class="text-slate-400 hover:text-white px-3 py-2 rounded-xl hover:bg-white/5 transition-all">
          <Icon name="lucide:refresh-cw" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Onboard Client Modal -->
    <Teleport to="body">
      <div v-if="createModalOpen" class="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs" @click="createModalOpen = false" />

        <div class="relative z-10 w-full max-w-lg bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6 shadow-2xl space-y-5 text-white">
          <div class="flex items-center justify-between border-b border-zinc-800 pb-4">
            <div class="flex items-center gap-3">
              <div class="size-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
                <Icon name="lucide:building-2" class="size-5" />
              </div>
              <div>
                <h3 class="text-lg font-bold text-white">Onboard New Client Organization</h3>
                <p class="text-xs text-zinc-400">Create an isolated organization workspace for a new client.</p>
              </div>
            </div>
            <button @click="createModalOpen = false" class="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/5">
              <Icon name="lucide:x" class="size-5" />
            </button>
          </div>

          <form @submit.prevent="handleCreateOrg" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Client / Organization Name *
              </label>
              <input
                v-model="newOrgForm.name"
                type="text"
                required
                placeholder="e.g. Acme Corporation or Client Enterprise"
                class="w-full bg-[#141420] border border-[#2e2e44] rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Storage Architecture
              </label>
              <div class="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  @click="newOrgForm.orgType = 's3'"
                  :class="newOrgForm.orgType === 's3'
                    ? 'border-violet-500 bg-violet-500/10 text-white'
                    : 'border-[#2e2e44] bg-[#141420] text-zinc-400 hover:border-zinc-700'"
                  class="flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-medium transition-all"
                >
                  <Icon name="lucide:database" class="size-4 text-violet-400 shrink-0" />
                  <div>
                    <div class="font-bold text-white">Platform S3</div>
                    <div class="text-[10px] text-zinc-400">Local / Isolated S3 Storage</div>
                  </div>
                </button>

                <button
                  type="button"
                  @click="newOrgForm.orgType = 'gdrive'"
                  :class="newOrgForm.orgType === 'gdrive'
                    ? 'border-blue-500 bg-blue-500/10 text-white'
                    : 'border-[#2e2e44] bg-[#141420] text-zinc-400 hover:border-zinc-700'"
                  class="flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-medium transition-all"
                >
                  <Icon name="logos:google-icon" class="size-4 shrink-0" />
                  <div>
                    <div class="font-bold text-white">Google Drive</div>
                    <div class="text-[10px] text-zinc-400">Host Client Google Drive Folder</div>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Client Admin Email (Optional)
              </label>
              <input
                v-model="newOrgForm.adminEmail"
                type="email"
                placeholder="client.admin@company.com"
                class="w-full bg-[#141420] border border-[#2e2e44] rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
              />
              <p class="mt-1 text-[11px] text-zinc-500">Assigns or creates an admin account for the client upon onboarding.</p>
            </div>

            <div class="pt-3 border-t border-zinc-800/80 flex items-center justify-end gap-3">
              <button
                type="button"
                @click="createModalOpen = false"
                class="px-4 py-2 text-sm text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="createLoading"
                class="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50"
              >
                <Icon v-if="createLoading" name="lucide:loader-2" class="size-4 animate-spin" />
                <span>{{ createLoading ? "Onboarding..." : "Onboard Organization" }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Empty -->
    <div v-if="!filteredOrgs.length" class="flex flex-col items-center justify-center py-24 text-slate-500">
      <Icon name="lucide:building-2" class="w-12 h-12 mb-4 opacity-30" />
      <p class="text-sm">No organizations found</p>
    </div>

    <!-- Orgs list -->
    <div v-else class="space-y-3">
      <div
        v-for="org in filteredOrgs"
        :key="org.id"
        class="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-5 hover:border-[#2e2e44] transition-all"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3 mb-2">
              <h3 class="text-white font-semibold text-base truncate">{{ org.name }}</h3>
              <!-- Status badge -->
              <span
                :class="org.status === 'active'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                  : 'bg-red-500/15 text-red-400 border-red-500/20'"
                class="text-xs font-medium px-2 py-0.5 rounded-full border"
              >{{ org.status }}</span>
              <!-- Type badge -->
              <span
                :class="org.orgType === 'gdrive'
                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/20'
                  : 'bg-slate-500/15 text-slate-400 border-slate-500/20'"
                class="text-xs font-medium px-2 py-0.5 rounded-full border"
              >{{ org.orgType === 'gdrive' ? 'Google Drive' : 'Platform Storage' }}</span>
            </div>
            <div class="flex items-center gap-6 text-xs text-slate-500 mb-4">
              <span class="flex items-center gap-1.5">
                <Icon name="lucide:users" class="w-3.5 h-3.5" />
                {{ org.memberCount }} member{{ org.memberCount !== 1 ? 's' : '' }}
              </span>
              <span class="flex items-center gap-1.5">
                <Icon name="lucide:database" class="w-3.5 h-3.5" />
                {{ formatBytes(org.storageBytes) }}
              </span>
              <span v-if="org.gdriveStatus" class="flex items-center gap-1.5">
                <Icon name="lucide:hard-drive" class="w-3.5 h-3.5" />
                GDrive: {{ org.gdriveStatus }}
              </span>
            </div>

            <!-- Feature flags -->
            <div class="flex flex-wrap gap-2">
              <span
                v-for="(val, key) in org.features"
                :key="key"
                :class="val
                  ? 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                  : 'bg-[#141420] text-slate-600 border-[#1e1e2e]'"
                class="text-xs px-2.5 py-1 rounded-full border flex items-center gap-1.5"
              >
                <Icon :name="val ? 'lucide:check' : 'lucide:x'" class="w-3 h-3" />
                {{ key === 'userPermissions' ? 'User Permissions' : key.charAt(0).toUpperCase() + key.slice(1) }}
              </span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2 flex-shrink-0">
            <NuxtLink
              :to="`/superadmin/organizations/${org.id}`"
              class="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl transition-all"
            >
              <Icon name="lucide:settings" class="w-3.5 h-3.5" />
              Manage
            </NuxtLink>
            <button
              :disabled="actionLoading === org.id"
              @click="toggleStatus(org)"
              :class="org.status === 'active'
                ? 'text-[#ea580c] hover:bg-[#ea580c]/10'
                : 'text-emerald-400 hover:bg-emerald-500/10'"
              class="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl transition-all disabled:opacity-50"
            >
              <Icon :name="org.status === 'active' ? 'lucide:pause-circle' : 'lucide:play-circle'" class="w-3.5 h-3.5" />
              {{ org.status === "active" ? "Suspend" : "Activate" }}
            </button>
            <button
              :disabled="actionLoading === org.id"
              @click="deleteOrg(org)"
              class="flex items-center gap-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 px-3 py-2 rounded-xl transition-all disabled:opacity-50"
            >
              <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
