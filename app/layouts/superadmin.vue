<script setup lang="ts">
const { data, refresh } = await useFetch("/api/superadmin/session");
const isSuperAdmin = computed(() => (data.value as any)?.authenticated === true);

// Watch for unauthenticated state
watchEffect(() => {
  if (process.client && data.value && !(data.value as any).authenticated) {
    navigateTo("/superadmin/login");
  }
});

const route = useRoute();

const navItems = [
  { label: "Dashboard", icon: "lucide:layout-dashboard", to: "/superadmin", exact: true },
  { label: "Organizations", icon: "lucide:building-2", to: "/superadmin/organizations" },
  { label: "Users", icon: "lucide:users", to: "/superadmin/users" },
  { label: "Org Requests", icon: "lucide:clock", to: "/superadmin/org-requests" },
  { label: "GDrive Requests", icon: "lucide:hard-drive", to: "/superadmin/gdrive-requests" },
];

const handleLogout = async () => {
  await $fetch("/api/superadmin/logout", { method: "POST" });
  navigateTo("/superadmin/login");
};
</script>

<template>
  <div class="flex h-screen bg-[#0a0a0f] overflow-hidden">
    <!-- Sidebar -->
    <aside class="w-64 flex-shrink-0 flex flex-col bg-[#0d0d14] border-r border-[#1e1e2e]">
      <!-- Logo -->
      <div class="px-6 pt-6 pb-5 border-b border-[#1e1e2e]">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Icon name="lucide:shield" class="text-white w-4 h-4" />
          </div>
          <div>
            <p class="text-white font-semibold text-sm tracking-wide">Super Admin</p>
            <p class="text-[10px] text-violet-400/70 font-medium uppercase tracking-widest">Control Center</p>
          </div>
        </div>
      </div>

      <!-- Nav items -->
      <nav class="flex-1 px-3 py-4 space-y-1">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group"
          :class="(item.exact ? route.path === item.to : route.path.startsWith(item.to))
            ? 'bg-violet-500/15 text-violet-300 shadow-sm'
            : 'text-slate-400 hover:text-white hover:bg-white/5'"
        >
          <Icon
            :name="item.icon"
            class="w-4 h-4 transition-colors"
            :class="route.path === item.to ? 'text-violet-400' : 'text-slate-500 group-hover:text-slate-300'"
          />
          {{ item.label }}
        </NuxtLink>
      </nav>

      <!-- Footer -->
      <div class="px-4 pb-5 border-t border-[#1e1e2e] pt-4">
        <button
          @click="handleLogout"
          class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 w-full transition-all"
        >
          <Icon name="lucide:log-out" class="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <main class="flex-1 overflow-y-auto">
      <slot />
    </main>
  </div>
</template>
