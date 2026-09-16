<script setup lang="ts">
import { parsePublicBooleanFlag } from "~~/shared/utils/public-feature-flags";

const { auth } = useAppConfig();
const runtimeConfig = useRuntimeConfig();
const enableGDriveStorage = computed(() =>
  parsePublicBooleanFlag(runtimeConfig.public.enableGDriveStorage),
);
const props = defineProps<{
  title?: string;
  description?: string;
}>();

const devLoggingIn = ref(false);
const handleDevLogin = async () => {
  devLoggingIn.value = true;
  try {
    const res: any = await $fetch("/api/auth/dev-login", { method: "POST" });
    if (res.redirect) {
      window.location.href = res.redirect;
    }
  } catch (e) {
    console.error("Dev login failed", e);
  } finally {
    devLoggingIn.value = false;
  }
};
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
          <!-- Primary CTA: Quick Dev Login -->
          <button
            type="button"
            class="group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all duration-200 hover:shadow-[0_0_40px_rgba(99,102,241,0.5)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 cursor-pointer"
            :disabled="devLoggingIn"
            @click="handleDevLogin"
          >
            <UIcon
              v-if="!devLoggingIn"
              name="lucide:zap"
              class="size-4.5 text-indigo-200 transition-transform group-hover:scale-110"
            />
            <UIcon
              v-else
              name="lucide:loader-2"
              class="size-4.5 animate-spin text-indigo-200"
            />
            <span>{{ devLoggingIn ? 'Authenticating Admin...' : 'Quick Dev Login (Local Admin)' }}</span>
          </button>

          <!-- Divider -->
          <div class="relative flex items-center py-2">
            <div class="grow border-t border-zinc-800" />
            <span class="mx-3 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Or Continue With</span>
            <div class="grow border-t border-zinc-800" />
          </div>

          <!-- Social auth -->
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
