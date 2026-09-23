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
          <!-- Icon -->
          <span class="mt-0.5 shrink-0 text-lg">
            <span v-if="toast.color === 'success'">✅</span>
            <span v-else-if="toast.color === 'error'">❌</span>
            <span v-else-if="toast.color === 'warning'">⚠️</span>
            <span v-else>ℹ️</span>
          </span>

          <!-- Text -->
          <div class="flex-1 min-w-0">
            <p v-if="toast.title" class="text-sm font-semibold leading-snug">{{ toast.title }}</p>
            <p v-if="toast.description" class="text-xs opacity-75 mt-0.5">{{ toast.description }}</p>
          </div>

          <!-- Close button -->
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
