<script setup lang="ts">
import { parsePublicBooleanFlag } from "~~/shared/utils/public-feature-flags";

const { auth } = useAppConfig();
const runtimeConfig = useRuntimeConfig();
const enableGDriveStorage = computed(() =>
  parsePublicBooleanFlag(runtimeConfig.public.enableGDriveStorage),
);
const props = defineProps<{
  title: string;
  description: string;
}>();
</script>
<template>
  <div class="max-w-md w-full flex flex-col items-center gap-6">
    <div class="mx-auto inline-flex size-10 items-center justify-center rounded-md bg-primary-500">
      <svg viewBox="0 0 132 132" role="img" aria-label="DAM folder" class="size-8">
        <path d="M11.88 36.96C11.88 31.1256 15.9558 26.4 20.988 26.4H46.035L52.866 34.32H93.852C98.8842 34.32 102.96 39.0456 102.96 44.88V95.04C102.96 100.874 98.8842 105.6 93.852 105.6H20.988C15.9558 105.6 11.88 100.874 11.88 95.04V36.96Z" fill="#ffffff" stroke="#0f172a" stroke-width="6" />
        <path d="M26.1307 54.853C27.6846 50.4582 31.8399 47.52 36.5014 47.52H110.22C115.052 47.52 118.43 52.2985 116.82 56.8535L103.277 95.156C100.98 100.98 99.1865 105.6 94.1369 105.6H21.0197C15.97 105.6 11.88 100.926 11.88 95.156L26.1307 54.853Z" fill="#ffffff" stroke="#0f172a" stroke-width="6" />
      </svg>
    </div>
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
        <template v-if="enableGDriveStorage">
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
        </template>
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
