<script setup lang="ts">
const sort = ref({
  sortBy: "createdAt",
  order: "desc",
});
const sortOptions = [
  { value: "createdAt", label: "Created (Newest First)" },
  { value: "name", label: "Name" },
  { value: "updatedAt", label: "Modified" },
];
const emit = defineEmits(["update"]);
watch(
  sort,
  () => {
    emit("update", sort.value);
  },
  { deep: true }
);
onMounted(() => emit("update", { ...sort.value }));
</script>
<template>
  <UButtonGroup class="flex w-full min-w-0 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel)] p-0.5 shadow-[var(--dam-shadow-soft)]">
    <UTooltip text="Change Order" arrow :delay-duration="0">
      <UButton
        :icon="
          sort.order === 'asc'
            ? 'lucide:arrow-down-wide-narrow'
            : 'lucide:arrow-up-narrow-wide'
        "
        class="rounded-lg"
        aria-label="Toggle sort order"
        @click="sort.order = sort.order === 'asc' ? 'desc' : 'asc'"
      />
    </UTooltip>
    <select v-model="sort.sortBy" class="min-w-0 flex-1 rounded-lg border-0 bg-transparent px-2.5 py-1 text-xs font-semibold text-[var(--dam-ink)] focus:outline-none cursor-pointer" aria-label="Sort assets by">
      <option v-for="item in sortOptions" :key="item.value" :value="item.value" class="bg-[var(--dam-panel-solid)] text-[var(--dam-ink)]">{{ item.label }}</option>
    </select>
  </UButtonGroup>
</template>
