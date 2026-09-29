<script setup lang="ts">
import { computed } from "vue";

definePageMeta({
  key: (route) => route.fullPath,
  pageTransition: false,
  layoutTransition: false,
  validate: async (route) => {
    const reserved = ["admin", "superadmin", "auth", "dept-head", "gdrive"];
    const reservedSubroutes = ["favorites", "shared", "published", "recent", "trash"];
    const bucket = route.params.bucket;
    if (typeof bucket !== "string" || reserved.includes(bucket)) return false;

    const idParam = route.params.id;
    const firstSegment = Array.isArray(idParam) ? idParam[0] : idParam;
    if (firstSegment && reservedSubroutes.includes(firstSegment)) {
      return false;
    }
    return true;
  }
});

const route = useRoute();
const bucket = computed(() => (route.params.bucket as string) || "org");
</script>

<template>
  <div class="dam-page-container w-full">
    <AppFiles v-if="bucket" :key="route.fullPath" />
  </div>
</template>
