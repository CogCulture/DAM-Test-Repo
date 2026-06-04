<script setup lang="ts">
definePageMeta({ layout: "guest" });

const { user, clear, fetch: fetchSession } = useUserSession();
const { roleLabel, departmentLabel } = useRole();
const router = useRouter();

const logout = async () => {
  await clear();
  router.push("/auth/signin");
};

let intervalId: any = null;

onMounted(async () => {
  if ((user.value as any)?.approvalStatus === "active") {
    router.push("/");
    return;
  }

  intervalId = setInterval(async () => {
    try {
      await $fetch("/api/auth/refresh", { method: "POST" });
      await fetchSession();

      const approvalStatus = (user.value as any)?.approvalStatus;
      if (approvalStatus === "active") {
        router.push("/");
      } else if (approvalStatus === "needs_profile") {
        router.push("/auth/complete-profile");
      } else if (approvalStatus === "rejected") {
        router.push("/auth/signin");
      }
    } catch (e) {
      console.error("Error refreshing approval status:", e);
    }
  }, 3000);
});

onUnmounted(() => {
  if (intervalId) {
    clearInterval(intervalId);
  }
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 px-4">
    <div class="w-full max-w-md text-center">
      <Logo class="mx-auto mb-8" />

      <!-- Waiting animation -->
      <div class="relative mb-8 mx-auto w-20 h-20">
        <div class="absolute inset-0 rounded-full border-4 border-blue-500/20 animate-ping" />
        <div class="absolute inset-2 rounded-full border-4 border-blue-500/40 animate-ping" style="animation-delay: 0.3s" />
        <div class="relative w-20 h-20 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
          <UIcon name="lucide:clock" class="text-blue-400 text-2xl" />
        </div>
      </div>

      <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl space-y-4">
        <h1 class="text-xl font-semibold text-white">Awaiting Approval</h1>
        <p class="text-neutral-400 text-sm leading-relaxed">
          Your account is pending approval from your Department Head.
          You'll be notified once you're approved.
        </p>

        <div v-if="roleLabel || departmentLabel" class="grid grid-cols-2 gap-3 pt-2">
          <div class="bg-neutral-800 rounded-xl p-3 text-left">
            <p class="text-xs text-neutral-500 mb-1">Role</p>
            <p class="text-sm text-white font-medium">{{ roleLabel }}</p>
          </div>
          <div class="bg-neutral-800 rounded-xl p-3 text-left">
            <p class="text-xs text-neutral-500 mb-1">Department</p>
            <p class="text-sm text-white font-medium">{{ departmentLabel }}</p>
          </div>
        </div>

        <div class="pt-2 border-t border-neutral-800 space-y-2">
          <p class="text-xs text-neutral-500">
            Contact your Department Head if you need urgent access.
          </p>
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            class="w-full justify-center text-neutral-400"
            @click="logout"
          >
            Sign out
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
