<script setup>
const route = useRoute();
const { loggedIn } = useUserSession();
if (!loggedIn.value) {
  navigateTo("/auth/signin");
}
const { aside } = useAside();
const { folder } = useFolder();
</script>
<template>
  <div
    class="flex flex-col justify-start min-h-screen bg-neutral-100 dark:bg-neutral-900"
  >
    <AppHeader />
    <div class="flex px-4 sm:px-18 h-screen overflow-auto relative">
      <AppDirectoryTree v-if="route.params?.bucket || route.path.startsWith('/admin')" />
      <div
        :class="[
          'grow transition-all duration-200 ease-in-out',
          (route.params?.bucket || route.path.startsWith('/admin')) ? `sm:ml-64 pb-24 ${aside ? 'pt-36' : 'pt-20'}` : 'ml-0 pt-24 pb-24',
        ]"
      >
        <slot />
      </div>
    </div>
    <AppFooter v-if="route.params?.bucket || route.path.startsWith('/admin')" />
  </div>
</template>
