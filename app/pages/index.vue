<script setup lang="ts">
const router = useRouter();
const { bucket, loading } = useBucket();
const { isAdmin, isApproved } = useRole();

// For admins: auto-create the org bucket if it doesn't exist
const bootstrapping = ref(false);
const bootstrapError = ref(false);

const bootstrapOrg = async () => {
  if (!isAdmin.value || bootstrapping.value) return;
  bootstrapping.value = true;
  bootstrapError.value = false;
  try {
    await $fetch("/api/bucket", { method: "POST" });
    // re-fetch bucket
    const { data } = await useFetch("/api/bucket");
    if (data.value) bucket.value = data.value as any;
  } catch (e) {
    // Bucket may already exist - try fetching it
    const { data } = await useFetch("/api/bucket");
    if (data.value) {
      bucket.value = data.value as any;
    } else {
      bootstrapError.value = true;
    }
  } finally {
    bootstrapping.value = false;
  }
};

watch(bucket, (b) => {
  if (b?.name) {
    router.push(`/${b.name}`);
  }
});

// Watch for loading to finish before bootstrapping
watch(loading, (isLoading) => {
  if (!isLoading && !bucket.value && isAdmin.value) {
    bootstrapOrg();
  }
});

onMounted(async () => {
  if (bucket.value?.name) {
    router.push(`/${bucket.value.name}`);
    return;
  }
  // If admin and loading already done (or not started), bootstrap it
  if (isAdmin.value && !loading.value) {
    await bootstrapOrg();
  }
});
</script>

<template>
  <!-- Loading or bootstrapping org workspace -->
  <div v-if="loading || bootstrapping" class="flex flex-col items-center justify-center h-64 gap-4">
    <UIcon name="lucide:loader" class="text-4xl text-blue-500 animate-spin" />
    <p class="text-sm text-neutral-400">
      {{ bootstrapping ? 'Setting up your organization workspace…' : 'Loading…' }}
    </p>
  </div>

  <!-- Bootstrap failed -->
  <div v-else-if="bootstrapError" class="flex flex-col items-center justify-center h-64 text-center gap-4">
    <UIcon name="lucide:alert-circle" class="text-5xl text-red-400" />
    <div>
      <p class="text-lg font-medium text-neutral-700 dark:text-neutral-300">Setup Failed</p>
      <p class="text-sm text-neutral-400 mt-1">Could not create the organization workspace. Please try again.</p>
    </div>
    <UButton @click="bootstrapOrg" label="Retry Setup" icon="lucide:refresh-cw" />
  </div>

  <!-- Admin: bucket not yet set up (show manual trigger) -->
  <div v-else-if="isAdmin && !bucket" class="flex flex-col items-center justify-center h-64 text-center gap-4">
    <UIcon name="lucide:building-2" class="text-5xl text-blue-400" />
    <div>
      <p class="text-lg font-medium text-neutral-700 dark:text-neutral-300">Setup Organization Workspace</p>
      <p class="text-sm text-neutral-400 mt-1">Click below to initialize the shared organization storage.</p>
    </div>
    <UButton @click="bootstrapOrg" label="Setup Workspace" icon="lucide:rocket" color="primary" />
  </div>

  <!-- Non-admin: org not yet set up -->
  <div v-else-if="!bucket && !isAdmin" class="flex flex-col items-center justify-center h-64 text-center gap-4">
    <UIcon name="lucide:building-2" class="text-5xl text-neutral-400" />
    <div>
      <p class="text-lg font-medium text-neutral-700 dark:text-neutral-300">Organization not set up yet</p>
      <p class="text-sm text-neutral-400 mt-1">Please contact your Admin to set up the organization workspace.</p>
    </div>
  </div>
</template>
