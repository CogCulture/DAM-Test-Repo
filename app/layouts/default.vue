<script setup lang="ts">
import { useAside } from "~/composables/useAside";
import { useFolder } from "~/composables/useFolder";

const route = useRoute();
const { loggedIn } = useUserSession();
if (!loggedIn.value) {
  navigateTo("/auth/signin");
}
const { aside } = useAside();
const { folder } = useFolder();
const sidebarWidth = useState<number>("dam-sidebar-width", () => 272);
</script>
<template>
  <div class="dam-authenticated-shell flex min-h-screen flex-col justify-start bg-white text-[var(--dam-ink)] dark:bg-transparent" :style="{ '--dam-sidebar-width': `${sidebarWidth}px` }">
    <AppHeader />
    <div class="dam-authenticated-viewport relative flex h-screen overflow-auto bg-white px-3 dark:bg-transparent sm:px-6">
      <AppDirectoryTree v-if="route.params?.bucket || route.path.startsWith('/admin') || route.path.startsWith('/dept-head')" />
      <div
        :class="[
          'min-w-0 grow px-1 sm:px-2',
          route.params?.bucket
            ? `dam-main-with-sidebar pb-24 ${aside ? 'pt-48' : 'pt-36'}`
            : (route.path.startsWith('/admin') || route.path.startsWith('/dept-head'))
              ? `dam-main-with-sidebar pb-24 ${aside ? 'pt-36' : 'pt-24'}`
              : 'ml-0 pt-24 pb-24',
        ]"
      >
        <main class="mx-auto w-full max-w-[1680px]">
          <slot />
        </main>
      </div>
    </div>
    <AppFooter v-if="route.params?.bucket || route.path.startsWith('/admin') || route.path.startsWith('/dept-head')" />
    <FilePreview />
  </div>
</template>
