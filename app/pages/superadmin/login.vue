<script setup lang="ts">
definePageMeta({ layout: false });

const email = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");

const handleLogin = async () => {
  error.value = "";
  loading.value = true;
  try {
    await $fetch("/api/superadmin/login", {
      method: "POST",
      body: { email: email.value, password: password.value },
    });
    navigateTo("/superadmin");
  } catch (e: any) {
    error.value = e?.data?.message ?? "Invalid credentials.";
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-[#080810] flex items-center justify-center p-4 relative overflow-hidden">
    <!-- Background effects -->
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-[120px]"></div>
      <div class="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-indigo-600/10 blur-[100px]"></div>
    </div>

    <div class="w-full max-w-md relative z-10">
      <!-- Header -->
      <div class="text-center mb-10">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-2xl shadow-violet-500/40 mb-5">
          <Icon name="lucide:shield-check" class="w-8 h-8 text-white" />
        </div>
        <h1 class="text-3xl font-bold text-white mb-2">Super Admin</h1>
        <p class="text-slate-400 text-sm">Platform Control Center — Restricted Access</p>
      </div>

      <!-- Card -->
      <div class="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl p-8 shadow-2xl">
        <form @submit.prevent="handleLogin" class="space-y-5">
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Admin Email</label>
            <input
              v-model="email"
              type="email"
              required
              autocomplete="username"
              placeholder="superadmin@dam.local"
              class="w-full bg-[#13131f] border border-[#252540] rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Password</label>
            <input
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              placeholder="••••••••••"
              class="w-full bg-[#13131f] border border-[#252540] rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all"
            />
          </div>

          <!-- Error -->
          <div v-if="error" class="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <Icon name="lucide:alert-circle" class="text-red-400 w-4 h-4 flex-shrink-0" />
            <span class="text-red-400 text-sm">{{ error }}</span>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl px-4 py-3 text-sm transition-all duration-200 shadow-lg shadow-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Icon v-if="loading" name="lucide:loader" class="animate-spin w-4 h-4" />
            <Icon v-else name="lucide:log-in" class="w-4 h-4" />
            {{ loading ? "Signing in..." : "Access Control Center" }}
          </button>
        </form>
      </div>

      <p class="text-center text-xs text-slate-600 mt-6">
        This area is restricted to platform administrators only.
      </p>
    </div>
  </div>
</template>
