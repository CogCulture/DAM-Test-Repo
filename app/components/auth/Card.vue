<script setup lang="ts">
const { auth } = useAppConfig();
const colorMode = useColorMode();
const props = defineProps<{
  title: string;
  description: string;
}>();
const isDark = computed(() => colorMode.value === "dark");
</script>
<template>
  <div class="max-w-md w-full flex flex-col items-center gap-6">
    <img :src="isDark ? '/logo-dark.png' : '/logo.png'" class="w-30 mx-auto" />
    <p class="text-center text-sm">
      Welcome to the demo version of the app.<br />Please sign up to continue.
    </p>
    <UCard class="w-full">
      <h3 class="font-semibold text-neutral-950 dark:text-neutral-50">
        {{ title }}
      </h3>
      <p class="text-neutral-500 dark:text-neutral-400 text-sm">
        {{ description }}
      </p>
      <div class="flex flex-col gap-4 py-4">
        <AuthButton
          v-for="provider in auth.providers"
          :key="provider"
          :provider="provider"
        />
        <div class="flex items-center my-1">
          <div class="grow border-t border-neutral-200 dark:border-neutral-800"></div>
          <span class="mx-3 text-xs text-neutral-400 font-medium">OR</span>
          <div class="grow border-t border-neutral-200 dark:border-neutral-800"></div>
        </div>
        <UButton
          variant="outline"
          color="neutral"
          size="xl"
          class="text-sm"
          block
          as-child
        >
          <a href="/api/auth/google?gdrive=true">
            <Icon
              name="logos:google-icon"
              class="size-6"
            />
            <span class="ml-2">Host Google Drive Folder</span>
          </a>
        </UButton>
        <UAlert
          title="Note"
          icon="lucide:message-square-warning"
          color="neutral"
          variant="subtle"
          description="This is a demo version only. Do not upload personal data. Data may be
      erased periodically."
        />
      </div>
    </UCard>
    <span class="text-sm"
      >Host Your
      <a href="https://folder.run" class="text-primary-500">Folder</a></span
    >
  </div>
</template>
