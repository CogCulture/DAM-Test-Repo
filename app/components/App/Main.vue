<script setup lang="ts">
defineProps<{
  title?: string;
  description?: string;
  icon?: string;
}>();
</script>

<template>
  <div class="dam-enter flex flex-col gap-6 pb-48">
    <!-- Header Visual Banner & Breadcrumbs -->
    <div class="mx-auto w-full max-w-5xl flex flex-col gap-5 rounded-3xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] p-6 shadow-[var(--dam-shadow-soft)] backdrop-blur-md">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <FileBreadcrumb />
      </div>

      <div class="flex w-full flex-wrap items-end justify-between gap-4">
        <div v-if="title" class="flex min-w-0 items-center gap-4">
          <span v-if="icon" class="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-[#ff5733]/30 bg-[#ff5733]/10 text-[#ff5733] shadow-[0_0_20px_rgba(255,87,51,0.25)]">
            <UIcon :name="icon" class="size-6" />
          </span>
          <div class="min-w-0">
            <h1 class="truncate text-3xl font-extrabold tracking-tight text-[var(--dam-ink)] sm:text-4xl uppercase">{{ title }}</h1>
            <p class="mt-1 max-w-2xl text-sm font-medium text-[var(--dam-muted)]">{{ description || "Turning Words & Assets Into Visual Operations." }}</p>
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
