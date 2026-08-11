<script setup lang="ts">
const sort = ref({
  sortBy: "createdAt",
  order: "asc",
});
const sortOptions = [
  { value: "name", label: "Name" },
  { value: "updatedAt", label: "Modified" },
  { value: "createdAt", label: "Created" },
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
    <USelect v-model="sort.sortBy" :items="sortOptions" :ui="{ content: 'z-50' }" class="min-w-0 flex-1 rounded-lg" aria-label="Sort assets by" />
  </UButtonGroup>
</template>
