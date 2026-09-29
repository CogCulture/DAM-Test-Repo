<script setup lang="ts">
import { ref, onMounted } from "vue";
definePageMeta({ layout: "guest" });

const route = useRoute();
const router = useRouter();
const { loggedIn, user, fetch: fetchSession } = useUserSession();

const token = (route.query.token as string) || "";
const inviteCookie = useCookie("invite_token");

if (token) {
  inviteCookie.value = token;
}

const loading = ref(true);
const error = ref("");
const inviteInfo = ref<{
  email: string;
  organizationId: string;
  departmentId: string;
  role: string;
  roleLabel: string;
  orgName: string;
  deptName: string;
} | null>(null);

const accepting = ref(false);

const loadInvite = async () => {
  if (!token) {
    error.value = "Invalid invitation link: Missing token.";
    loading.value = false;
    return;
  }

  try {
    const data = await $fetch<any>(`/api/auth/invite/${token}`);
    inviteInfo.value = data;
  } catch (e: any) {
    error.value = e?.data?.message || "Failed to load invitation. The link may have expired or is invalid.";
  } finally {
    loading.value = false;
  }
};

const handleAccept = async () => {
  accepting.value = true;
  error.value = "";
  try {
    await $fetch(`/api/auth/invite/${token}`, { method: "POST" });
    inviteCookie.value = null; // Clear invite token cookie
    await fetchSession();
    router.push("/");
  } catch (e: any) {
    error.value = e?.data?.message || "Failed to accept the invitation.";
  } finally {
    accepting.value = false;
  }
};

onMounted(() => {
  loadInvite();
});
</script>

<template>
  <div class="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-white font-sans selection:bg-indigo-500 selection:text-white">
    <div class="sm:mx-auto sm:w-full sm:max-w-md text-center">
      <div class="inline-flex items-center justify-center p-3 bg-indigo-600/10 rounded-2xl border border-indigo-500/20 mb-6">
        <span class="i-lucide-mail-open text-indigo-400 text-3xl"></span>
      </div>
      <h2 class="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent">
        Workspace Invitation
      </h2>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-slate-900/50 backdrop-blur-md py-8 px-6 shadow-2xl rounded-3xl border border-slate-800 sm:px-10 space-y-6">
        
        <!-- Loading state -->
        <div v-if="loading" class="flex flex-col items-center justify-center py-8 space-y-4">
          <div class="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p class="text-slate-400 text-sm">Validating invitation...</p>
        </div>

        <!-- Error state -->
        <div v-else-if="error" class="space-y-4 text-center">
          <div class="bg-red-500/10 border border-red-500/30 p-4 rounded-xl text-red-200 text-sm flex items-start space-x-3 text-left">
            <span class="i-lucide-alert-triangle text-red-400 text-lg shrink-0 mt-0.5"></span>
            <p class="text-red-300/80">{{ error }}</p>
          </div>
          <button @click="router.push('/auth/signin')" class="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 transition">
            Go to Sign In
          </button>
        </div>

        <!-- Valid Invite Content -->
        <div v-else-if="inviteInfo" class="space-y-6">
          <div class="text-center space-y-3">
            <p class="text-slate-400 text-sm">You have been invited to join</p>
            <h3 class="text-2xl font-bold text-white">{{ inviteInfo.orgName }}</h3>
            
            <div class="flex flex-wrap items-center justify-center gap-2 pt-1">
              <span class="inline-flex items-center gap-1.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3.5 py-1 rounded-full text-xs font-semibold">
                <span class="i-lucide-shield text-xs"></span>
                Role: {{ inviteInfo.roleLabel }}
              </span>
              <span v-if="inviteInfo.deptName && inviteInfo.departmentId !== 'global'" class="inline-flex items-center gap-1.5 bg-slate-800 text-slate-300 border border-slate-700 px-3.5 py-1 rounded-full text-xs font-medium">
                <span class="i-lucide-building-2 text-xs"></span>
                {{ inviteInfo.deptName }}
              </span>
            </div>
          </div>

          <!-- Logged in accept flow -->
          <div v-if="loggedIn" class="space-y-4 pt-4 border-t border-slate-800">
            <div class="bg-indigo-500/5 border border-indigo-500/10 p-4 rounded-xl text-slate-300 text-sm text-center">
              Logged in as <strong class="text-white">{{ user?.name }}</strong> <br/>
              <span class="text-xs text-slate-400">({{ user?.email }})</span>
            </div>

            <p class="text-xs text-slate-400 text-center leading-relaxed">
              Your role has been set by the organization administrator as 
              <strong class="text-indigo-300">{{ inviteInfo.roleLabel }}</strong>.
              Click below to accept and start working.
            </p>

            <button 
              @click="handleAccept" 
              :disabled="accepting"
              class="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition duration-150 shadow-lg shadow-indigo-600/30 disabled:opacity-50"
            >
              <span v-if="accepting" class="i-lucide-loader-2 animate-spin mr-2"></span>
              Accept and Join
            </button>
          </div>

          <!-- Guest sign in flow -->
          <div v-else class="space-y-4 pt-4 border-t border-slate-800">
            <p class="text-sm text-slate-300 text-center">
              Please sign in with your Google or GitHub account to accept your invitation:
            </p>

            <div class="space-y-3">
              <a 
                href="/api/auth/google?prompt=select_account"
                class="w-full flex items-center justify-center py-3 px-4 border border-slate-700 hover:border-slate-600 bg-slate-800 hover:bg-slate-700/80 rounded-xl text-sm font-semibold transition"
              >
                <span class="i-logos-google-icon text-lg mr-3"></span>
                Sign in with Google
              </a>
              <a 
                href="/api/auth/github"
                class="w-full flex items-center justify-center py-3 px-4 border border-slate-700 hover:border-slate-600 bg-slate-800 hover:bg-slate-700/80 rounded-xl text-sm font-semibold transition"
              >
                <span class="i-logos-github-icon text-lg mr-3"></span>
                Sign in with GitHub
              </a>
            </div>
          </div>

        </div>

      </div>
    </div>
  </div>
</template>
