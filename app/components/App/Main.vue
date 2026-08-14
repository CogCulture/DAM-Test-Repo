<script setup lang="ts">
defineProps<{
  title?: string;
  description?: string;
  icon?: string;
}>();
</script>

<template>
  <div class="dam-enter flex flex-col gap-6 pb-48">
    <div class="flex flex-col gap-4 border-b border-[var(--dam-line)] pb-6">
      <FileBreadcrumb />
      <div class="flex w-full flex-wrap items-end justify-between gap-4">
        <div v-if="title" class="flex min-w-0 items-center gap-4">
          <span v-if="icon" class="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] text-primary-500 shadow-[var(--dam-shadow-soft)]">
            <UIcon :name="icon" class="size-5" />
          </span>
          <div class="min-w-0">
            <h1 class="truncate text-3xl font-semibold tracking-[-0.045em] text-[var(--dam-ink)] sm:text-[2.5rem]">{{ title }}</h1>
            <p class="mt-2 max-w-2xl text-sm text-[var(--dam-muted)]">{{ description || "Discover, organize and share your creative library." }}</p>
          </div>
        </div>
        <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <slot name="actions" />
        </div>
      </div>
    </div>
    <slot />
  </div>
</template>
