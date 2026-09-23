<script setup lang="ts">
import { useToast } from "~/composables/useToast";

const { data, refresh } = useFetch("/api/superadmin/session");
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

const { toasts, remove } = useToast();
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

    <!-- Toast Notification Stack -->
    <div class="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none" style="max-width: 380px;">
      <TransitionGroup name="toast-slide">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-2xl backdrop-blur-md"
          :class="
            toast.color === 'success' ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200' :
            toast.color === 'error'   ? 'bg-red-950/90 border-red-500/40 text-red-200' :
            toast.color === 'warning' ? 'bg-amber-950/90 border-amber-500/40 text-amber-200' :
            'bg-[#1a1a2e]/90 border-indigo-500/30 text-indigo-200'
          "
        >
          <span class="mt-0.5 shrink-0 text-lg">
            <span v-if="toast.color === 'success'">✅</span>
            <span v-else-if="toast.color === 'error'">❌</span>
            <span v-else-if="toast.color === 'warning'">⚠️</span>
            <span v-else>ℹ️</span>
          </span>
          <div class="flex-1 min-w-0">
            <p v-if="toast.title" class="text-sm font-semibold leading-snug">{{ toast.title }}</p>
            <p v-if="toast.description" class="text-xs opacity-75 mt-0.5">{{ toast.description }}</p>
          </div>
          <button class="shrink-0 opacity-50 hover:opacity-100 transition-opacity text-xs mt-0.5" @click="remove(toast.id!)">✕</button>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.toast-slide-enter-from {
  opacity: 0;
  transform: translateX(100%);
}
.toast-slide-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
