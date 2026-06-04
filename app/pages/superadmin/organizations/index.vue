<script setup lang="ts">
definePageMeta({ layout: "superadmin", middleware: "superadmin" });

const { data: orgs, refresh } = await useFetch<any[]>("/api/superadmin/organizations");

const toast = useToast();
const actionLoading = ref<string | null>(null);

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
        <h1 class="text-2xl font-bold text-white">Organizations</h1>
        <p class="text-slate-400 text-sm mt-1">Manage all organizations, features, and status</p>
      </div>
      <div class="flex items-center gap-3">
        <input
          v-model="searchQuery"
          placeholder="Search organizations..."
          class="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 w-56 transition-all"
        />
        <button @click="refresh" class="text-slate-400 hover:text-white px-3 py-2 rounded-xl hover:bg-white/5 transition-all">
          <Icon name="lucide:refresh-cw" class="w-4 h-4" />
        </button>
      </div>
    </div>

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
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-emerald-400 hover:bg-emerald-500/10'"
              class="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl transition-all disabled:opacity-50"
            >
              <Icon :name="org.status === 'active' ? 'lucide:pause-circle' : 'lucide:play-circle'" class="w-3.5 h-3.5" />
              {{ org.status === "active" ? "Suspend" : "Activate" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
