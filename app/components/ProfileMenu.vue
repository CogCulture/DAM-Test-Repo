<script setup lang="ts">
const { clear, user } = useUserSession();
const route = useRoute();
const menuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);
const bucketName = computed(() => (route.params.bucket as string) || "org");

const closeMenu = () => {
  menuOpen.value = false;
};

const toggleMenu = (event: MouseEvent) => {
  event.stopPropagation();
  menuOpen.value = !menuOpen.value;
};

const goTo = async (path: string) => {
  closeMenu();
  await navigateTo(path);
};

const signOut = async () => {
  closeMenu();
  await clear();
  await navigateTo("/auth/signin");
};

const onDocumentClick = (event: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) closeMenu();
};

const onDocumentKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") closeMenu();
};

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onDocumentKeydown);
});
</script>

<template>
  <div v-if="user" ref="menuRef" class="relative shrink-0">
    <button
      type="button"
      class="dam-control flex h-10 items-center gap-2 rounded-xl px-2.5 text-left transition hover:border-primary-500/50 hover:bg-[var(--dam-panel-raised)]"
      :aria-expanded="menuOpen"
      aria-haspopup="menu"
      aria-label="Open user menu"
      @click="toggleMenu"
    >
      <UAvatar
        v-if="user?.avatar"
        :src="user.avatar"
        :alt="user?.name || 'User'"
        size="xs"
        class="border border-[var(--dam-line-strong)]"
      />
      <span v-else class="flex size-7 items-center justify-center rounded-full bg-[var(--dam-panel-raised)]">
        <Icon name="lucide:user" class="size-4" />
      </span>
      <span class="hidden max-w-28 truncate text-xs font-semibold xl:block">{{ user?.name || 'Account' }}</span>
      <Icon name="lucide:chevron-down" :class="['size-3.5 transition-transform', menuOpen && 'rotate-180']" />
    </button>

    <Transition name="profile-menu">
      <div
        v-if="menuOpen"
        class="dam-glass absolute right-0 top-[calc(100%+0.65rem)] z-[100] w-72 overflow-hidden rounded-2xl border border-[var(--dam-line-strong)] bg-[var(--dam-panel)] p-2 shadow-2xl"
        role="menu"
        @click.stop
      >
        <div class="rounded-xl bg-[var(--dam-panel-raised)] px-3 py-3">
          <p class="truncate text-sm font-semibold text-[var(--dam-ink)]">{{ user?.name || 'Workspace user' }}</p>
          <p v-if="user?.email" class="mt-0.5 truncate text-xs text-[var(--dam-muted)]">{{ user.email }}</p>
        </div>

        <div class="my-2 grid gap-1">
          <button type="button" class="profile-item" role="menuitem" @click="goTo(`/${bucketName}`)">
            <Icon name="lucide:layout-dashboard" class="size-4" />
            <span>My workspace</span>
          </button>
          <button type="button" class="profile-item" role="menuitem" @click="goTo(`/${bucketName}/favorites`)">
            <Icon name="lucide:star" class="size-4" />
            <span>Favorites</span>
          </button>
          <button type="button" class="profile-item" role="menuitem" @click="goTo(`/${bucketName}/shared`)">
            <Icon name="lucide:users" class="size-4" />
            <span>Shared with me</span>
          </button>
          <button type="button" class="profile-item" role="menuitem" @click="goTo(`/${bucketName}/published`)">
            <Icon name="lucide:globe" class="size-4" />
            <span>Published assets</span>
          </button>
        </div>

        <div class="border-t border-[var(--dam-line)] pt-2">
          <button type="button" class="profile-item text-red-600 dark:text-red-400" role="menuitem" @click="signOut">
            <Icon name="lucide:log-out" class="size-4" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.profile-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.75rem;
  border-radius: 0.75rem;
  padding: 0.65rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--dam-ink);
  transition: background-color 150ms ease, transform 150ms ease;
}
.profile-item:hover {
  background: var(--dam-panel-raised);
  transform: translateX(2px);
}
.profile-menu-enter-active,
.profile-menu-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}
.profile-menu-enter-from,
.profile-menu-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
</style>