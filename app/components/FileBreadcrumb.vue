<script setup lang="ts">
import { useFolder } from "~/composables/useFolder";
type BreadcrumbItem = {
  label: string;
  href: string;
  icon?: string;
};
const route = useRoute();
const { folder } = useFolder();
const breadcrumbs = computed(() => {
  const items: BreadcrumbItem[] = [
    {
      label: route.params.bucket as string,
      href: "/" + route.params.bucket,
      icon: "lucide:hard-drive",
    },
  ];
  if (folder.value?.breadcrumb) {
    const paths = folder.value?.breadcrumb;
    paths.forEach((item) => {
      items.push({
        label: item.name,
        href: `/${route.params.bucket as string}/${item.id}`,
      });
    });
  }
  return items;
});
</script>
<template>
  <UBreadcrumb
    v-if="route.params.bucket"
    :items="breadcrumbs"
    :ui="{ list: 'gap-1' }"
  >
    <template #separator>
      <span>/</span>
    </template>
  </UBreadcrumb>
</template>
