<script setup lang="ts">
definePageMeta({ layout: "superadmin", middleware: "superadmin" });

const { data: stats, refresh } = await useFetch<any>("/api/superadmin/stats");

const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const statCards = computed(() => [
  {
    label: "Organizations",
    value: stats.value?.totalOrgs ?? 0,
    icon: "lucide:building-2",
    color: "violet",
    sub: `${stats.value?.suspendedOrgs ?? 0} suspended`,
  },
  {
    label: "Total Users",
    value: stats.value?.totalUsers ?? 0,
    icon: "lucide:users",
    color: "blue",
    sub: "across all orgs",
  },
  {
    label: "Storage Used",
    value: formatBytes(stats.value?.totalStorageBytes ?? 0),
    icon: "lucide:database",
    color: "emerald",
    sub: `${stats.value?.totalFiles ?? 0} files`,
  },
  {
    label: "Active GDrive",
    value: stats.value?.activeGDriveConnections ?? 0,
    icon: "lucide:hard-drive",
    color: "amber",
    sub: "connections approved",
  },
]);

const hasAlerts = computed(
  () => (stats.value?.pendingOrgRequests ?? 0) + (stats.value?.pendingGDriveRequests ?? 0) > 0
);

const colorMap: Record<string, { bg: string; text: string; shadow: string; icon: string }> = {
  violet: { bg: "bg-violet-500/10", text: "text-violet-400", shadow: "shadow-violet-500/20", icon: "bg-violet-500/20" },
  blue: { bg: "bg-blue-500/10", text: "text-blue-400", shadow: "shadow-blue-500/20", icon: "bg-blue-500/20" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", shadow: "shadow-emerald-500/20", icon: "bg-emerald-500/20" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-400", shadow: "shadow-amber-500/20", icon: "bg-amber-500/20" },
};
</script>

<template>
  <div class="p-8 space-y-8">
    <!-- Page header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Platform Dashboard</h1>
        <p class="text-slate-400 text-sm mt-1">Real-time overview of all organizations and activity</p>
      </div>
      <button @click="refresh" class="flex items-center gap-2 text-sm text-slate-400 hover:text-white px-3 py-2 rounded-xl hover:bg-white/5 transition-all">
        <Icon name="lucide:refresh-cw" class="w-4 h-4" />
        Refresh
      </button>
    </div>

    <!-- Alert Banner -->
    <div v-if="hasAlerts" class="flex items-start gap-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-6 py-4">
      <Icon name="lucide:bell-ring" class="text-amber-400 w-5 h-5 mt-0.5 flex-shrink-0" />
      <div class="flex-1">
        <p class="text-amber-300 font-semibold text-sm">Pending Actions Required</p>
        <div class="flex flex-wrap gap-4 mt-1">
          <NuxtLink v-if="stats?.pendingOrgRequests > 0" to="/superadmin/org-requests" class="text-amber-400/80 text-xs hover:text-amber-300 underline underline-offset-2">
            {{ stats.pendingOrgRequests }} org creation request{{ stats.pendingOrgRequests !== 1 ? 's' : '' }} pending
          </NuxtLink>
          <NuxtLink v-if="stats?.pendingGDriveRequests > 0" to="/superadmin/gdrive-requests" class="text-amber-400/80 text-xs hover:text-amber-300 underline underline-offset-2">
            {{ stats.pendingGDriveRequests }} GDrive request{{ stats.pendingGDriveRequests !== 1 ? 's' : '' }} pending
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Stats grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div
        v-for="card in statCards"
        :key="card.label"
        class="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-5 hover:border-[#2e2e44] transition-all"
      >
        <div class="flex items-center justify-between mb-4">
          <span class="text-xs font-semibold text-slate-400 uppercase tracking-widest">{{ card.label }}</span>
          <div :class="[colorMap[card.color].icon, 'w-8 h-8 rounded-xl flex items-center justify-center']">
            <Icon :name="card.icon" :class="[colorMap[card.color].text, 'w-4 h-4']" />
          </div>
        </div>
        <div :class="[colorMap[card.color].text, 'text-3xl font-bold mb-1']">{{ card.value }}</div>
        <p class="text-xs text-slate-500">{{ card.sub }}</p>
      </div>
    </div>

    <!-- Quick links -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <NuxtLink
        to="/superadmin/org-requests"
        class="group bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all"
      >
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Icon name="lucide:clock" class="text-violet-400 w-5 h-5" />
          </div>
          <div>
            <p class="text-white font-semibold text-sm">Org Requests</p>
            <p class="text-slate-500 text-xs">Pending approvals</p>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-2xl font-bold text-violet-400">{{ stats?.pendingOrgRequests ?? 0 }}</span>
          <Icon name="lucide:arrow-right" class="text-slate-600 group-hover:text-violet-400 group-hover:translate-x-1 transition-all w-4 h-4" />
        </div>
      </NuxtLink>

      <NuxtLink
        to="/superadmin/gdrive-requests"
        class="group bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all"
      >
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Icon name="lucide:hard-drive" class="text-blue-400 w-5 h-5" />
          </div>
          <div>
            <p class="text-white font-semibold text-sm">GDrive Requests</p>
            <p class="text-slate-500 text-xs">Drive hosting approvals</p>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-2xl font-bold text-blue-400">{{ stats?.pendingGDriveRequests ?? 0 }}</span>
          <Icon name="lucide:arrow-right" class="text-slate-600 group-hover:text-blue-400 group-hover:translate-x-1 transition-all w-4 h-4" />
        </div>
      </NuxtLink>

      <NuxtLink
        to="/superadmin/organizations"
        class="group bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all"
      >
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Icon name="lucide:building-2" class="text-emerald-400 w-5 h-5" />
          </div>
          <div>
            <p class="text-white font-semibold text-sm">All Organizations</p>
            <p class="text-slate-500 text-xs">Manage features & status</p>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-2xl font-bold text-emerald-400">{{ stats?.totalOrgs ?? 0 }}</span>
          <Icon name="lucide:arrow-right" class="text-slate-600 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all w-4 h-4" />
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
