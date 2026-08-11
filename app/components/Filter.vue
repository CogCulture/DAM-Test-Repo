<script setup lang="ts">
import { fileIcons } from "~~/shared/utils/constants";

const open = ref(false);
const emit = defineEmits<{
  update: [value: Record<string, unknown> | null];
}>();

const { data: taxonomies } = await useFetch<ITaxonomy[]>('/api/taxonomies');

const defaultValue = {
  drive: false,
  contentType: '',
  visibility: '',
  shared: '',
  tags: [] as string[],
  meta: {} as Record<string, string | string[]>,
};

const filters = ref({ ...defaultValue, tags: [] as string[], meta: {} as Record<string, string | string[]> });
const tagInput = ref('');

const fileTypeOptions = computed(() => Object.keys(fileIcons).map((key) => ({
  value: key,
  label: key.charAt(0).toUpperCase() + key.slice(1),
  icon: fileIcons[key],
})));

const sharedOptions = [
  { value: 'yes', label: 'Shared' },
  { value: 'no', label: 'Not Shared' },
];

const hasFilters = computed(() => (
  filters.value.drive ||
  !!filters.value.contentType ||
  !!filters.value.visibility ||
  !!filters.value.shared ||
  filters.value.tags.length > 0 ||
  Object.values(filters.value.meta).some((value) => Array.isArray(value) ? value.length > 0 : !!value)
));

const addTag = () => {
  const tag = tagInput.value.trim();
  if (tag && !filters.value.tags.includes(tag)) filters.value.tags.push(tag);
  tagInput.value = '';
};

const removeTag = (tag: string) => {
  filters.value.tags = filters.value.tags.filter((item) => item !== tag);
};

const reset = () => {
  filters.value = { ...defaultValue, tags: [], meta: {} };
  tagInput.value = '';
  emit('update', null);
  open.value = false;
};

const onApply = () => {
  emit('update', hasFilters.value ? {
    ...filters.value,
    tags: [...filters.value.tags],
    meta: { ...filters.value.meta },
  } : null);
  open.value = false;
};
</script>

<template>
  <div class="w-full min-w-0">
    <UChip :show="hasFilters" inset class="w-full">
      <UButton
        type="button"
        icon="lucide:filter"
        :label="hasFilters ? 'Filters active' : 'Filters'"
        color="neutral"
        variant="outline"
        class="w-full justify-between rounded-xl border-[var(--dam-line)] bg-[var(--dam-panel)] shadow-[var(--dam-shadow-soft)]"
        :aria-expanded="open"
        aria-controls="asset-filter-panel"
        data-testid="filters-trigger"
        @click="open = !open"
      >
        <template #trailing>
          <UIcon name="lucide:chevron-down" :class="['size-4 transition-transform', open && 'rotate-180']" />
        </template>
      </UButton>
    </UChip>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="-translate-y-1 opacity-0"
    >
      <div
        v-if="open"
        id="asset-filter-panel"
        class="mt-3 flex max-h-[22rem] flex-col gap-4 overflow-y-auto rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] p-3"
        data-testid="filters-panel"
      >
        <USwitch v-model="filters.drive" label="Entire Drive" />
        <USelect v-model="filters.contentType" placeholder="File Type" :items="fileTypeOptions" variant="outline" :ui="{ content: 'z-[60]' }" />
        <USelect v-model="filters.visibility" placeholder="Visibility" :items="['public', 'private']" variant="outline" :ui="{ content: 'z-[60]' }" />
        <USelect v-model="filters.shared" placeholder="Sharing" :items="sharedOptions" variant="outline" :ui="{ content: 'z-[60]' }" />

        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium uppercase tracking-wide text-[var(--dam-muted)]">Tags</span>
          <div class="flex flex-wrap gap-1">
            <span v-for="tag in filters.tags" :key="tag" class="inline-flex items-center gap-1 rounded-full bg-primary-500/10 px-2 py-0.5 text-xs text-primary-500">
              {{ tag }}
              <button type="button" class="hover:text-red-500" :aria-label="`Remove ${tag}`" @click="removeTag(tag)">
                <UIcon name="lucide:x" class="size-3" />
              </button>
            </span>
          </div>
          <div class="flex gap-1">
            <UInput v-model="tagInput" placeholder="Filter by tag..." size="xs" class="flex-1" @keyup.enter="addTag" />
            <UButton type="button" size="xs" icon="lucide:plus" color="primary" aria-label="Add tag filter" @click="addTag" />
          </div>
        </div>

        <div v-if="taxonomies?.length" class="border-t border-[var(--dam-line)] pt-3">
          <span class="mb-3 block text-xs font-medium uppercase tracking-wide text-[var(--dam-muted)]">Metadata Filters</span>
          <div class="flex flex-col gap-3">
            <div v-for="taxonomy in taxonomies" :key="taxonomy.id" class="flex flex-col gap-1">
              <label class="text-xs text-[var(--dam-muted)]">{{ taxonomy.name }}</label>
              <UInput v-if="taxonomy.type === 'text'" v-model="filters.meta[taxonomy.key]" :placeholder="`Filter by ${taxonomy.name}...`" size="xs" />
              <USelect v-else-if="taxonomy.type === 'select'" v-model="filters.meta[taxonomy.key]" :items="taxonomy.options ?? []" :placeholder="`Any ${taxonomy.name}`" size="xs" :ui="{ content: 'z-[70]' }" />
              <USelectMenu v-else-if="taxonomy.type === 'multiselect'" v-model="filters.meta[taxonomy.key]" :items="taxonomy.options ?? []" multiple :placeholder="`Any ${taxonomy.name}`" size="xs" :ui="{ content: 'z-[70]' }" />
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between gap-2 border-t border-[var(--dam-line)] pt-3">
          <UButton type="button" color="primary" variant="solid" class="rounded-xl" @click="onApply">Apply filters</UButton>
          <UButton type="button" color="neutral" variant="ghost" class="rounded-xl" @click="reset">Reset</UButton>
        </div>
      </div>
    </Transition>
  </div>
</template>
