<script setup lang="ts">
definePageMeta({
  validate: async (route) => {
    const reserved = ["admin", "superadmin", "auth", "dept-head", "gdrive"];
    const bucket = route.params.bucket;
    return typeof bucket === "string" && !reserved.includes(bucket);
  },
});
</script>

<template>
  <AppLibraryLanding kind="recent" />
</template>