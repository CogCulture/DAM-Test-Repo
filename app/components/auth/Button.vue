<script setup lang="ts">
defineProps<{
  provider: "linkedin" | "github" | "google";
  label?: string;
}>();
const providers = {
  github: {
    icon: "logos:github-icon",
    label: "Continue with GitHub",
    class: "size-6 *:fill-white dark:*:fill-neutral-900",
  },
  google: {
    icon: "logos:google-icon",
    label: "Continue with Google",
    class: "size-6",
  },
};
</script>
<template>
  <UButton
    v-if="providers[provider]"
    variant="solid"
    color="neutral"
    size="xl"
    class="text-sm"
    block
    as-child
  >
    <a :href="provider === 'google' ? `/api/auth/${provider}?prompt=select_account` : `/api/auth/${provider}`">
      <Icon
        :name="providers[provider].icon"
        :class="providers[provider].class"
      />
      <span class="ml-2">{{ label || providers[provider].label }}</span>
    </a>
  </UButton>
</template>
