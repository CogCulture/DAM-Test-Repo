<script setup lang="ts">
const props = defineProps<{
  name: string;
  loading: boolean;
}>();
const gridLayout = {
  "grid-compact": "grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3",
  grid: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5",
  list: "grid-cols-1 gap-2",
  table: "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3",
};
const layoutClass = computed(() => gridLayout[props.name as keyof typeof gridLayout] ?? gridLayout.grid);
const dir = computed(() =>
  ["list", "table"].includes(props.name) ? "row" : ("col" as "row" | "col")
);
</script>
<template>
  <div :key="name" :data-layout="name" :class="['grid w-full items-start', layoutClass]">
    <slot :dir="dir" />
    <template v-if="loading">
      <FileSkeleton v-for="i of 12" :key="i" :dir="dir" />
    </template>
  </div>
</template>