<script setup lang="ts">
definePageMeta({ layout: "guest" });

const { clear } = useUserSession();
const router = useRouter();
const statusInfo = ref<{ status: string; folderName?: string } | null>(null);

const logout = async () => {
  await clear();
  router.push("/auth/signin");
};

let intervalId: any = null;

onMounted(async () => {
  const checkStatus = async () => {
    try {
      const data: any = await $fetch("/api/gdrive/status");
      statusInfo.value = data;
      if (data.status === "approved") {
        router.push("/");
      } else if (data.status === "rejected") {
        router.push("/gdrive/select");
      }
    } catch (e) {
      console.error("Error checking gdrive hosting status:", e);
    }
  };

  await checkStatus();

  intervalId = setInterval(checkStatus, 3000);
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
        <div class="absolute inset-0 rounded-full border-4 border-primary-500/20 animate-ping" />
        <div class="absolute inset-2 rounded-full border-4 border-primary-500/40 animate-ping" style="animation-delay: 0.3s" />
        <div class="relative w-20 h-20 rounded-full bg-primary-500/10 border border-primary-500/30 flex items-center justify-center">
          <UIcon name="lucide:loader-2" class="text-primary-500 text-2xl animate-spin" />
        </div>
      </div>

      <div class="bg-neutral-900/80 backdrop-blur-md border border-neutral-800 rounded-3xl p-8 shadow-2xl space-y-4">
        <h1 class="text-xl font-semibold text-white">Awaiting Folder Hosting Approval</h1>
        <p class="text-neutral-400 text-sm leading-relaxed">
          Your request to host the Google Drive folder
          <span v-if="statusInfo?.folderName" class="text-primary-400 font-bold block mt-1 font-mono">"{{ statusInfo.folderName }}"</span>
          is pending approval from the administrator.
        </p>

        <div class="pt-4 border-t border-neutral-800 space-y-2">
          <p class="text-xs text-neutral-500">
            Contact your Administrator if you need urgent access.
          </p>
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            class="w-full justify-center text-neutral-400 mt-2"
            @click="logout"
          >
            Sign out
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
