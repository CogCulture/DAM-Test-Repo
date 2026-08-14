<script setup lang="ts">
definePageMeta({ layout: false });

const { user, fetch: fetchSession } = useUserSession();

// Auto-refresh every 30 seconds to check if reactivated
let interval: any;
onMounted(() => {
  interval = setInterval(async () => {
    // Refresh session and check if organizationStatus changes
    await $fetch("/api/auth/refresh", { method: "POST" }).catch(() => {});
    await fetchSession();
    const orgStatus = (user.value as any)?.organizationStatus;
    if (orgStatus === "active") {
      clearInterval(interval);
      navigateTo("/");
    }
  }, 30000);
});
onUnmounted(() => clearInterval(interval));

const { logout } = useUserSession();
const handleLogout = async () => {
  await logout();
  navigateTo("/auth/signin");
};
</script>

<template>
  <div class="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
    <div class="max-w-md w-full text-center space-y-6">
      <div class="w-20 h-20 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto border border-red-500/20 animate-pulse">
        <Icon name="lucide:ban" class="w-10 h-10 text-red-400" />
      </div>

      <div>
        <h1 class="text-2xl font-bold text-white mb-2">Organization Suspended</h1>
        <p class="text-neutral-400 text-sm leading-relaxed">
          Your organization's account has been suspended by the platform administrator. Access to files, folders, and settings has been disabled.
        </p>
      </div>

      <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 text-left space-y-3">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
            <Icon name="lucide:building" class="w-4 h-4 text-red-400" />
          </div>
          <div>
            <p class="text-xs text-neutral-500">User Email</p>
            <p class="text-sm text-white font-medium">{{ user?.email || '—' }}</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Icon name="lucide:info" class="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p class="text-xs text-neutral-500">Status</p>
            <p class="text-sm text-amber-400 font-medium">Suspended</p>
          </div>
        </div>
      </div>

      <p class="text-xs text-neutral-600">Please contact support or your organization administrator if you think this is a mistake.</p>

      <button
        @click="handleLogout"
        class="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        Sign out
      </button>
    </div>
  </div>
</template>
