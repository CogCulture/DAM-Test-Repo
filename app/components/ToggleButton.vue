<script setup lang="ts">
export type ToggleButtonItem = { label: string; value: string; icon: string };

const model = defineModel<string>({ default: 'grid' });

const items: ToggleButtonItem[] = [
  { label: 'List view', value: 'list', icon: 'lucide:list' },
  { label: 'Grid view', value: 'grid', icon: 'lucide:grid-2x2' },
  { label: 'Compact grid', value: 'grid-compact', icon: 'lucide:grid-3x3' },
  { label: 'Table view', value: 'table', icon: 'lucide:table-2' },
];

const selectView = (value: string) => {
  model.value = value;
};
</script>

<template>
  <div class="w-full min-w-0">
    <div class="grid grid-cols-4 gap-1 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel)] p-1 shadow-[var(--dam-shadow-soft)]" role="group" aria-label="Asset layout">
      <button
        v-for="item in items"
        :key="item.value"
        type="button"
        :title="item.label"
        :aria-label="item.label"
        :aria-pressed="model === item.value"
        :data-testid="`view-${item.value}`"
        :class="[
          'flex min-h-9 min-w-0 items-center justify-center rounded-lg border transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
          model === item.value
            ? 'border-primary-500/40 bg-primary-500 text-white shadow-sm'
            : 'border-transparent text-[var(--dam-muted)] hover:bg-[var(--dam-panel-raised)] hover:text-[var(--dam-text)]',
        ]"
        @click.stop="selectView(item.value)"
      >
        <UIcon :name="item.icon" class="size-4" />
      </button>
    </div>
    <p class="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dam-muted)]">
      {{ items.find((item) => item.value === model)?.label ?? 'Grid view' }}
    </p>
  </div>
</template>
