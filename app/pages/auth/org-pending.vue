<script setup lang="ts">
definePageMeta({ layout: false });

const { data, refresh } = await useFetch<any>("/api/auth/org-request-status");

// Auto-refresh every 3 seconds to check if approved
let interval: any;
onMounted(() => {
  interval = setInterval(async () => {
    await refresh();
    if (data.value?.status === "approved") {
      clearInterval(interval);
      // Refresh session and redirect to home
      await $fetch("/api/auth/refresh", { method: "POST" }).catch(() => {});
      navigateTo("/");
    }
  }, 3000);
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
      <div class="w-20 h-20 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto border border-violet-500/20">
        <Icon name="lucide:clock" class="w-10 h-10 text-violet-400" />
      </div>

      <div>
        <h1 class="text-2xl font-bold text-white mb-2">Organization Request Submitted</h1>
        <p class="text-neutral-400 text-sm leading-relaxed">
          Your request to create
          <span v-if="data?.orgName" class="text-white font-semibold">"{{ data.orgName }}"</span>
          has been submitted and is pending approval from the platform administrator.
        </p>
      </div>

      <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 text-left space-y-3">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
            <Icon name="lucide:building-2" class="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <p class="text-xs text-neutral-500">Organization Name</p>
            <p class="text-sm text-white font-medium">{{ data?.orgName ?? '—' }}</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Icon :name="data?.orgType === 'gdrive' ? 'lucide:hard-drive' : 'lucide:database'" class="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p class="text-xs text-neutral-500">Storage Type</p>
            <p class="text-sm text-white font-medium">{{ data?.orgType === 'gdrive' ? 'Google Drive' : 'Platform Storage (S3)' }}</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Icon name="lucide:loader" class="w-4 h-4 text-amber-400 animate-spin" />
          </div>
          <div>
            <p class="text-xs text-neutral-500">Status</p>
            <p class="text-sm text-amber-400 font-medium">Pending Super Admin approval</p>
          </div>
        </div>
      </div>

      <p class="text-xs text-neutral-600">This page updates automatically.</p>

      <button
        @click="handleLogout"
        class="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        Sign out
      </button>
    </div>
  </div>
</template>
