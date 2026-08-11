<script setup>
const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === "dark");
const toggleColorMode = () => {
  const nextMode = isDark.value ? "light" : "dark";
  colorMode.preference = nextMode;
  if (import.meta.client) {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(nextMode);
    document.documentElement.style.colorScheme = nextMode;
  }
};
const toggleLabel = computed(() =>
  isDark.value ? "Switch to light mode" : "Switch to dark mode"
);
</script>

<template>
  <ClientOnly v-if="!colorMode?.forced">
    <button
      type="button"
      role="switch"
      :aria-checked="isDark"
      :aria-label="toggleLabel"
      :title="toggleLabel"
      class="group relative inline-flex h-9 w-14 shrink-0 overflow-hidden rounded-full border border-slate-300 bg-white p-1 text-[var(--dam-ink)] shadow-sm transition hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900"
      @click="toggleColorMode"
    >
      <span class="absolute inset-1 rounded-full bg-white dark:bg-slate-800" aria-hidden="true" />
      <span
        :class="[
          'relative z-10 flex size-7 items-center justify-center rounded-full bg-white shadow transition-transform duration-200',
          isDark ? 'translate-x-5' : 'translate-x-0',
        ]"
        aria-hidden="true"
      >
        <Icon :name="isDark ? 'lucide:moon' : 'lucide:sun'" :class="['size-3.5', isDark ? 'text-slate-800' : 'text-amber-500']" />
      </span>
      <span class="sr-only">{{ isDark ? 'Dark mode enabled' : 'Light mode enabled' }}</span>
    </button>

    <template #fallback>
      <div class="h-9 w-14 shrink-0 rounded-full border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900" />
    </template>
  </ClientOnly>
</template>