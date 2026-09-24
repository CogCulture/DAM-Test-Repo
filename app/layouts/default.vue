<script setup lang="ts">
import { useAside } from "~/composables/useAside";
import { useFolder } from "~/composables/useFolder";
import { useToast } from "~/composables/useToast";

const route = useRoute();
const { loggedIn } = useUserSession();
if (!loggedIn.value) {
  navigateTo("/auth/signin");
}
const { aside } = useAside();
const { folder } = useFolder();
const sidebarWidth = useState<number>("dam-sidebar-width", () => 272);
const showsWorkspaceControls = computed(() => !!route.params.bucket || route.path.startsWith("/admin") || route.path.startsWith("/dept-head"));
const mainPaddingTop = computed(() => {
  if (!showsWorkspaceControls.value) return "pt-24";
  return aside.value ? "pt-64" : "pt-44";
});

const { toasts, remove } = useToast();
</script>

<template>
  <div class="dam-authenticated-shell flex min-h-screen flex-col justify-start bg-[var(--dam-bg)] text-[var(--dam-ink)]" :style="{ '--dam-sidebar-width': `${sidebarWidth}px` }">
    <AppHeader />
    <div class="dam-authenticated-viewport relative flex h-screen overflow-auto bg-[var(--dam-bg)] text-[var(--dam-ink)] px-3 sm:px-6">
      <AppDirectoryTree v-if="route.params?.bucket" />
      <div
        :class="[
          'min-w-0 grow px-1 sm:px-2 pb-24 transition-all duration-150',
          route.params?.bucket ? 'dam-main-with-sidebar' : 'ml-0',
          mainPaddingTop,
        ]"
      >
        <main class="mx-auto w-full max-w-[1680px]">
          <slot />
        </main>
      </div>
    </div>
    <AppFooter v-if="route.params?.bucket" />
  </div>
</template>
