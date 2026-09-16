<script setup lang="ts">
definePageMeta({
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
const bucket = route.params.bucket;
</script>

<template>
  <AppFiles v-if="bucket" />
</template>
