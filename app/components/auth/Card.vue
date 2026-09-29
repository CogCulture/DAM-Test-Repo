<script setup lang="ts">
import { parsePublicBooleanFlag } from "~~/shared/utils/public-feature-flags";

const { auth } = useAppConfig();
const runtimeConfig = useRuntimeConfig();
const enableGDriveStorage = computed(() =>
  parsePublicBooleanFlag(runtimeConfig.public.enableGDriveStorage),
);
defineProps<{
  title?: string;
  description?: string;
}>();
</script>

<template>
  <div class="w-full max-w-md mx-auto">
    <div class="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d12]/90 p-8 shadow-[0_24px_60px_rgba(0,0,0,0.8)] backdrop-blur-xl">
      <!-- Glow ambient behind card header -->
      <div class="pointer-events-none absolute -top-20 -left-20 size-48 rounded-full bg-indigo-500/15 blur-3xl" />
      <div class="pointer-events-none absolute -bottom-20 -right-20 size-48 rounded-full bg-violet-600/15 blur-3xl" />

      <div class="relative z-10 flex flex-col gap-6">
        <!-- Header -->
        <div class="text-left">
          <div class="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300 mb-3">
            <span class="size-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Workspace Access
          </div>
          <h3 class="text-2xl font-bold tracking-tight text-white">
            {{ title || "Sign In to DAM" }}
          </h3>
          <p class="mt-1 text-sm text-zinc-400">
            {{ description || "Access your digital asset library and collaborative tools." }}
          </p>
        </div>

        <div class="flex flex-col gap-4">
          <!-- OAuth Login -->
          <div class="flex flex-col gap-2.5">
            <AuthButton
              v-for="provider in auth.providers"
              :key="provider"
              :provider="provider"
              class="!bg-zinc-900/90 !border-zinc-800 !text-zinc-200 hover:!bg-zinc-800 hover:!border-zinc-700 !rounded-xl !py-3 font-medium transition-all duration-150"
            />

            <template v-if="enableGDriveStorage">
              <div class="relative flex items-center py-1">
                <div class="grow border-t border-zinc-800/80" />
                <span class="mx-3 text-[10px] font-semibold text-zinc-500 uppercase">External Storage</span>
                <div class="grow border-t border-zinc-800/80" />
              </div>
              <a
                href="/api/auth/google?gdrive=true"
                class="flex items-center justify-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/90 px-4 py-3 text-sm font-medium text-zinc-200 transition-all duration-150 hover:border-zinc-700 hover:bg-zinc-800"
              >
                <Icon name="logos:google-icon" class="size-5" />
                <span>Host Google Drive Folder</span>
              </a>
            </template>
          </div>
        </div>

        <!-- Security footer tag -->
        <div class="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500">
          <span class="flex items-center gap-1">
            <UIcon name="lucide:shield-check" class="size-3.5 text-indigo-400" />
            Department Isolation
          </span>
          <span>Pinecone Vector RAG</span>
        </div>
      </div>
    </div>
  </div>
</template>
