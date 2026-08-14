<script setup lang="ts">
definePageMeta({ layout: "guest" });

import { ref, onMounted, watch, computed } from "vue";

const { user, fetch: fetchSession } = useUserSession();
const router = useRouter();
const route = useRoute();
const loading = ref(false);
const error = ref("");

const orgAction = ref<"join" | "create">("join");
const newOrgName = ref("");
const orgType = ref<"s3" | "gdrive" | "byos">("s3");
const selectedOrgId = ref("");
const selectedRole = ref("");
const selectedDept = ref("");

// ─── BYOS common state ────────────────────────────────────────────────────────
const byosProvider = ref<"aws" | "r2" | "gcs">("aws");
const byosVerifying = ref(false);
const byosVerified = ref(false);
const byosVerifyError = ref("");
const byosShowCorsGuide = ref(false);
const byosBucketName = ref("");

// AWS S3 / Cloudflare R2 fields
const byosAccessKeyId = ref("");
const byosSecretAccessKey = ref("");
const byosRegion = ref("us-east-1");
const byosEndpoint = ref("");

// ─── GCS — Option B (Service Account JSON) ───────────────────────────────────
const gcsMode = ref<"a" | "b" | "c">("c");
const gcsJsonKey = ref("");
const gcsProjectId = ref("");
const gcsClientEmail = ref("");
const gcsPrivateKey = ref("");

// Auto-parse pasted JSON key
const parseGcsJson = () => {
  try {
    const parsed = JSON.parse(gcsJsonKey.value);
    if (parsed.type !== "service_account") {
      byosVerifyError.value = "This does not look like a service account JSON key.";
      return;
    }
    gcsProjectId.value = parsed.project_id || "";
    gcsClientEmail.value = parsed.client_email || "";
    gcsPrivateKey.value = parsed.private_key || "";
    byosBucketName.value = byosBucketName.value; // keep existing
    byosVerifyError.value = "";
  } catch {
    byosVerifyError.value = "Invalid JSON. Please paste the complete service account key file.";
  }
};

// ─── GCS — Options A & C (OAuth) ─────────────────────────────────────────────
const gcsOAuthConnected = ref(false);
const gcsOAuthConnecting = ref(false);
const gcsOAuthMode = ref<"oauth_manual" | "oauth_auto" | null>(null);

// Option A: manual project ID + bucket picker
const gcsManualProjectId = ref("");
const gcsBuckets = ref<{ name: string; location: string }[]>([]);
const gcsLoadingBuckets = ref(false);
const gcsBucketsError = ref("");
const gcsSelectedBucket = ref("");

// Option C: auto-discover projects + bucket picker
const gcsProjects = ref<{ projectId: string; name: string }[]>([]);
const gcsLoadingProjects = ref(false);
const gcsProjectsError = ref("");
const gcsSelectedProject = ref("");

const connectGcsOAuth = (mode: "a" | "c") => {
  gcsOAuthConnecting.value = true;
  window.location.href = `/api/auth/google?gcs=${mode}`;
};

const checkGcsOAuthStatus = async () => {
  try {
    const status = await $fetch<{ connected: boolean; mode?: string }>("/api/storage/gcs/status");
    if (status.connected) {
      gcsOAuthConnected.value = true;
      gcsOAuthMode.value = status.mode as any;
      // Auto-load projects for Option C
      if (gcsMode.value === "c") await loadGcsProjects();
    }
  } catch {
    gcsOAuthConnected.value = false;
  }
};

const loadGcsProjects = async () => {
  gcsLoadingProjects.value = true;
  gcsProjectsError.value = "";
  try {
    gcsProjects.value = await $fetch<{ projectId: string; name: string }[]>("/api/storage/gcs/projects");
  } catch (e: any) {
    gcsProjectsError.value = e?.data?.message ?? "Failed to load projects.";
  } finally {
    gcsLoadingProjects.value = false;
  }
};

const loadGcsBuckets = async (projectId: string) => {
  if (!projectId?.trim()) return;
  gcsLoadingBuckets.value = true;
  gcsBucketsError.value = "";
  gcsSelectedBucket.value = "";
  try {
    gcsBuckets.value = await $fetch<{ name: string; location: string }[]>(`/api/storage/gcs/buckets?projectId=${projectId}`);
  } catch (e: any) {
    gcsBucketsError.value = e?.data?.message ?? "Failed to load buckets.";
  } finally {
    gcsLoadingBuckets.value = false;
  }
};

// Watch project selection on Option C to auto-load buckets
watch(gcsSelectedProject, (proj) => {
  if (proj) loadGcsBuckets(proj);
});

// ─── Reset verification on changes ───────────────────────────────────────────
const resetByosVerification = () => {
  byosVerified.value = false;
  byosVerifyError.value = "";
};
watch(
  [byosProvider, byosBucketName, byosAccessKeyId, byosSecretAccessKey, byosRegion, byosEndpoint, gcsProjectId, gcsClientEmail, gcsPrivateKey, gcsJsonKey],
  resetByosVerification
);

const byosConfigPayload = computed(() => {
  if (byosProvider.value === "gcs") {
    if (gcsMode.value === "b") {
      return {
        provider: "gcs" as const,
        projectId: gcsProjectId.value,
        clientEmail: gcsClientEmail.value,
        privateKey: gcsPrivateKey.value,
        bucketName: byosBucketName.value,
      };
    } else {
      const proj = gcsMode.value === "c" ? gcsSelectedProject.value : gcsManualProjectId.value;
      return {
        provider: "gcs" as const,
        gcsConnectionMode: gcsMode.value === "a" ? "oauth_manual" : "oauth_auto",
        projectId: proj,
        bucketName: byosBucketName.value,
      };
    }
  }
  return {
    provider: byosProvider.value,
    accessKeyId: byosAccessKeyId.value,
    secretAccessKey: byosSecretAccessKey.value,
    bucketName: byosBucketName.value,
    region: byosRegion.value,
    endpoint: byosProvider.value === "r2" ? byosEndpoint.value : undefined,
  };
});

const verifyByosCredentials = async () => {
  byosVerifying.value = true;
  byosVerifyError.value = "";
  byosVerified.value = false;
  try {
    await $fetch("/api/storage/byos/verify-credentials", {
      method: "POST",
      body: byosConfigPayload.value,
    });
    byosVerified.value = true;
  } catch (e: any) {
    byosVerifyError.value = e?.data?.message ?? "Verification failed. Please check your credentials.";
  } finally {
    byosVerifying.value = false;
  }
};

// ─── GCS canSubmit helper ─────────────────────────────────────────────────────
const gcsReadyToSubmit = computed(() => {
  if (byosProvider.value !== "gcs") return true;
  if (gcsMode.value === "b") return byosVerified.value;
  if (gcsMode.value === "a") return gcsOAuthConnected.value && !!gcsSelectedBucket.value;
  if (gcsMode.value === "c") return gcsOAuthConnected.value && !!gcsSelectedBucket.value;
  return false;
});

// ─── GDrive state ─────────────────────────────────────────────────────────────
const gdriveConnected = ref(false);
const gdriveConnecting = ref(false);
const gdriveFolders = ref<{ id: string; name: string }[]>([]);
const gdriveLoadingFolders = ref(false);
const gdriveError = ref("");
const selectedGDriveFolder = ref<{ id: string; name: string } | null>(null);
const gdriveSearchQ = ref("");

const organizationsList = ref<{ id: string; name: string }[]>([]);
const departmentsList = ref<{ id: string; name: string; parentId: string | null }[]>([]);

onMounted(async () => {
  try {
    organizationsList.value = await $fetch("/api/organizations");
  } catch (e) {
    console.error("Failed to load organizations:", e);
  }

  // Detect return from GCS OAuth (query param ?gcs=connected)
  if (route.query.gcs === "connected") {
    orgType.value = "byos";
    byosProvider.value = "gcs";
    await checkGcsOAuthStatus();
    // Remove the query param without a full page reload
    router.replace({ query: {} });
  }

  if (orgType.value === "gdrive") {
    await checkGDriveConnection();
  }
});

const rolesList = ref<{ id: string; label: string }[]>([]);

watch(selectedOrgId, async (newOrgId) => {
  selectedDept.value = "";
  selectedRole.value = "";
  if (!newOrgId) {
    departmentsList.value = [];
    rolesList.value = [];
    return;
  }
  try {
    const [depts, roles] = await Promise.all([
      $fetch(`/api/organizations/${newOrgId}/departments`),
      $fetch(`/api/organizations/${newOrgId}/roles`),
    ]);
    departmentsList.value = depts as any;
    rolesList.value = roles as any;
  } catch (e) {
    console.error("Failed to load departments or roles:", e);
  }
});

const getDeptOptions = computed(() => {
  return departmentsList.value.map((d) => ({
    label: d.parentId ? `  ↳ ${d.name}` : d.name,
    value: d.id,
  }));
});

const filteredGdriveFolders = computed(() => {
  if (!gdriveFolders.value) return [];
  if (!gdriveSearchQ.value.trim()) return gdriveFolders.value;
  return gdriveFolders.value.filter((f) =>
    f.name.toLowerCase().includes(gdriveSearchQ.value.toLowerCase())
  );
});

watch(orgType, async (type) => {
  if (type === "gdrive") {
    await checkGDriveConnection();
  } else if (type === "byos" && byosProvider.value === "gcs") {
    await checkGcsOAuthStatus();
  } else {
    gdriveConnected.value = false;
    selectedGDriveFolder.value = null;
    gdriveFolders.value = [];
  }
});

watch([byosProvider, gcsMode], async ([provider, mode]) => {
  if (provider === "gcs" && (mode === "a" || mode === "c")) {
    await checkGcsOAuthStatus();
  }
});

const checkGDriveConnection = async () => {
  try {
    const status = await $fetch<{ connected: boolean }>("/api/gdrive/status");
    if ((status as any).connected) {
      gdriveConnected.value = true;
      await loadGDriveFolders();
    }
  } catch (e) {
    gdriveConnected.value = false;
  }
};

const loadGDriveFolders = async () => {
  gdriveLoadingFolders.value = true;
  gdriveError.value = "";
  try {
    const folders = await $fetch<{ id: string; name: string }[]>("/api/gdrive/list-folders");
    gdriveFolders.value = folders || [];
  } catch (e: any) {
    gdriveError.value = "Failed to load folders. Please try reconnecting.";
  } finally {
    gdriveLoadingFolders.value = false;
  }
};

const connectGDrive = () => {
  gdriveConnecting.value = true;
  window.location.href = "/api/auth/google?gdrive=true";
};

// ─── canSubmit ────────────────────────────────────────────────────────────────
const canSubmit = computed(() => {
  if (orgAction.value === "create") {
    if (!newOrgName.value.trim()) return false;
    if (orgType.value === "gdrive") return gdriveConnected.value && !!selectedGDriveFolder.value;
    if (orgType.value === "byos") {
      if (byosProvider.value === "gcs") return gcsReadyToSubmit.value;
      return byosVerified.value;
    }
    return true;
  } else {
    return !!selectedOrgId.value && !!selectedRole.value && !!selectedDept.value;
  }
});

// ─── handleSubmit ─────────────────────────────────────────────────────────────
const handleSubmit = async () => {
  if (orgAction.value === "create") {
    if (!newOrgName.value.trim()) {
      error.value = "Please enter an organization name.";
      return;
    }
    if (orgType.value === "gdrive" && !selectedGDriveFolder.value) {
      error.value = "Please connect Google Drive and select a folder.";
      return;
    }
    if (orgType.value === "byos" && !canSubmit.value) {
      error.value = "Please complete and verify your storage credentials before submitting.";
      return;
    }
  } else {
    if (!selectedOrgId.value) { error.value = "Please select an organization."; return; }
    if (!selectedRole.value || !selectedDept.value) { error.value = "Please select both a role and a department."; return; }
  }

  loading.value = true;
  error.value = "";

  // Build GCS config for submission
  let gcsByosConfig: any = undefined;
  if (orgType.value === "byos" && byosProvider.value === "gcs") {
    if (gcsMode.value === "b") {
      gcsByosConfig = { provider: "gcs", projectId: gcsProjectId.value, clientEmail: gcsClientEmail.value, privateKey: gcsPrivateKey.value, bucketName: byosBucketName.value };
    } else {
      // Options A & C: OAuth-backed; bucket already selected
      const selBucket = gcsSelectedBucket.value;
      const selProject = gcsMode.value === "c" ? gcsSelectedProject.value : gcsManualProjectId.value;
      gcsByosConfig = { provider: "gcs", bucketName: selBucket, projectId: selProject, gcsConnectionMode: gcsMode.value === "a" ? "oauth_manual" : "oauth_auto" };
    }
  }

  try {
    const res = await $fetch<{ success: boolean; redirectToGDrive?: boolean; pendingOrgRequest?: boolean }>("/api/auth/complete-profile", {
      method: "POST",
      body: {
        orgAction: orgAction.value,
        newOrgName: newOrgName.value,
        orgType: orgType.value,
        selectedOrgId: selectedOrgId.value,
        role: selectedRole.value,
        departmentId: selectedDept.value,
        folderId: selectedGDriveFolder.value?.id || undefined,
        folderName: selectedGDriveFolder.value?.name || undefined,
        byosConfig: orgType.value === "byos"
          ? (byosProvider.value === "gcs" ? gcsByosConfig : byosConfigPayload.value)
          : undefined,
      },
    });
    await fetchSession();

    if (res.pendingOrgRequest) {
      router.push("/auth/org-pending");
    } else if (res.redirectToGDrive) {
      router.push("/gdrive/select");
    } else if (orgAction.value === "create") {
      router.push("/");
    } else {
      router.push("/auth/pending");
    }
  } catch (e: any) {
    error.value = e?.data?.message ?? "Something went wrong. Please try again.";
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 px-4 py-8">
    <!-- 2-column when Cloud Storage BYOS is open, single column otherwise -->
    <div
      :class="[
        'w-full my-8 transition-all duration-300',
        orgAction === 'create' && orgType === 'byos'
          ? 'max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6 items-start'
          : 'max-w-md'
      ]"
    >
      <!-- LEFT / MAIN COLUMN -->
      <div>
      <!-- Logo -->
      <div class="text-center mb-8">
        <Logo class="mx-auto mb-4" />
        <h1 class="text-2xl font-semibold text-white">Setup Your Organization Access</h1>
        <p class="text-neutral-400 mt-2 text-sm">
          Join an existing organization or launch a new one for your team.
        </p>
      </div>

      <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl space-y-6">
        <!-- Choose action -->
        <div class="flex bg-neutral-800 p-1 rounded-xl border border-neutral-700">
          <button
            @click="orgAction = 'join'"
            type="button"
            :class="[
              'flex-1 text-center py-2.5 rounded-lg text-sm font-medium transition-all',
              orgAction === 'join'
                ? 'bg-primary-500 text-white shadow'
                : 'text-neutral-400 hover:text-white',
            ]"
          >
            Join Organization
          </button>
          <button
            @click="orgAction = 'create'"
            type="button"
            :class="[
              'flex-1 text-center py-2.5 rounded-lg text-sm font-medium transition-all',
              orgAction === 'create'
                ? 'bg-primary-500 text-white shadow'
                : 'text-neutral-400 hover:text-white',
            ]"
          >
            Create Organization
          </button>
        </div>

        <div class="space-y-5">
          <!-- CREATE ORG FORM -->
          <div v-if="orgAction === 'create'" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-neutral-300 mb-2">
                New Organization Name
              </label>
              <input
                type="text"
                v-model="newOrgName"
                placeholder="e.g. Bansal Group"
                class="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <!-- Storage Type -->
            <div>
              <label class="block text-sm font-medium text-neutral-300 mb-3">Storage Type</label>
              <div class="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  @click="orgType = 's3'"
                  :class="orgType === 's3'
                    ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                    : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600'"
                  class="flex flex-col items-center gap-2 p-4 rounded-xl border text-sm font-medium transition-all"
                >
                  <Icon name="lucide:database" class="w-6 h-6" />
                  <span>Platform</span>
                  <span class="text-xs font-normal opacity-70">S3-backed</span>
                </button>
                <button
                  type="button"
                  @click="orgType = 'gdrive'"
                  :class="orgType === 'gdrive'
                    ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                    : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600'"
                  class="flex flex-col items-center gap-2 p-4 rounded-xl border text-sm font-medium transition-all"
                >
                  <Icon name="lucide:hard-drive" class="w-6 h-6" />
                  <span>Google Drive</span>
                  <span class="text-xs font-normal opacity-70">Your Drive folder</span>
                </button>
                <button
                  type="button"
                  @click="orgType = 'byos'"
                  :class="orgType === 'byos'
                    ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                    : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600'"
                  class="flex flex-col items-center gap-2 p-4 rounded-xl border text-sm font-medium transition-all"
                >
                  <Icon name="lucide:cloud-upload" class="w-6 h-6" />
                  <span>Cloud Storage</span>
                  <span class="text-xs font-normal opacity-70">Your own bucket</span>
                </button>
              </div>
            </div>

            <!-- BYOS Inline Wizard -->
            <div v-if="orgType === 'byos'" class="space-y-4">
              <!-- Step 1: Provider selector -->
              <div>
                <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">1. Choose Provider</p>
                <div class="grid grid-cols-3 gap-2">
                  <button
                    v-for="prov in [{ id: 'aws', label: 'AWS S3', icon: 'simple-icons:amazons3' }, { id: 'r2', label: 'Cloudflare R2', icon: 'simple-icons:cloudflare' }, { id: 'gcs', label: 'Google Cloud', icon: 'simple-icons:googlecloud' }]"
                    :key="prov.id"
                    type="button"
                    @click="byosProvider = prov.id as any"
                    :class="byosProvider === prov.id
                      ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                      : 'border-neutral-700 bg-neutral-800/60 text-neutral-400 hover:border-neutral-600'"
                    class="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-medium transition-all"
                  >
                    <Icon :name="prov.icon" class="w-5 h-5" />
                    <span>{{ prov.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Step 2: Credentials form -->
              <div class="space-y-3">
                <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500">2. Enter Credentials</p>

                <!-- Bucket Name (shared) -->
                <div>
                  <label class="block text-xs font-medium text-neutral-400 mb-1.5">Bucket Name</label>
                  <input
                    v-model="byosBucketName"
                    type="text"
                    placeholder="e.g. my-dam-bucket"
                    class="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-neutral-600"
                  />
                </div>

                <!-- AWS S3 & R2 fields -->
                <template v-if="byosProvider === 'aws' || byosProvider === 'r2'">
                  <div>
                    <label class="block text-xs font-medium text-neutral-400 mb-1.5">Access Key ID</label>
                    <input
                      v-model="byosAccessKeyId"
                      type="text"
                      placeholder="AKIAIOSFODNN7EXAMPLE"
                      autocomplete="off"
                      class="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-neutral-600 font-mono"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-neutral-400 mb-1.5">Secret Access Key</label>
                    <input
                      v-model="byosSecretAccessKey"
                      type="password"
                      placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                      autocomplete="new-password"
                      class="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-neutral-600 font-mono"
                    />
                  </div>
                  <div v-if="byosProvider === 'aws'">
                    <label class="block text-xs font-medium text-neutral-400 mb-1.5">Region</label>
                    <input
                      v-model="byosRegion"
                      type="text"
                      placeholder="us-east-1"
                      class="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-neutral-600 font-mono"
                    />
                  </div>
                  <div v-if="byosProvider === 'r2'">
                    <label class="block text-xs font-medium text-neutral-400 mb-1.5">
                      Endpoint URL
                      <span class="text-neutral-600 font-normal">&nbsp;(from your R2 dashboard)</span>
                    </label>
                    <input
                      v-model="byosEndpoint"
                      type="url"
                      placeholder="https://<account-id>.r2.cloudflarestorage.com"
                      class="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-neutral-600 font-mono"
                    />
                  </div>
                </template>


                <!-- GCS — 3-mode switcher -->
                <template v-if="byosProvider === 'gcs'">
                  <!-- Mode tabs -->
                  <div class="space-y-3">
                    <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500">2. Choose Connection Method</p>
                    <div class="grid grid-cols-3 gap-2">
                      <button
                        v-for="m in [{ id: 'c', label: 'Auto-discover', icon: 'lucide:sparkles' }, { id: 'a', label: 'Manual Project', icon: 'lucide:key-round' }, { id: 'b', label: 'Service Account', icon: 'lucide:file-json' }]"
                        :key="m.id"
                        type="button"
                        @click="gcsMode = m.id as any"
                        :class="[
                          'flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl border text-xs font-medium transition-all',
                          gcsMode === m.id
                            ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                            : 'border-neutral-700 bg-neutral-800/60 text-neutral-400 hover:border-neutral-600'
                        ]"
                      >
                        <Icon :name="m.icon" class="w-4 h-4" />
                        <span>{{ m.label }}</span>
                      </button>
                    </div>
                  </div>

                  <!-- ── Option A: OAuth + manual project ID ── -->
                  <div v-if="gcsMode === 'a'" class="space-y-3">
                    <!-- Connect button -->
                    <div v-if="!gcsOAuthConnected">
                      <button
                        type="button"
                        @click="connectGcsOAuth('a')"
                        :disabled="gcsOAuthConnecting"
                        class="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all"
                      >
                        <Icon v-if="gcsOAuthConnecting" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
                        <Icon v-else name="logos:google-icon" class="w-4 h-4" />
                        {{ gcsOAuthConnecting ? 'Connecting...' : 'Connect with Google' }}
                      </button>
                      <p class="text-xs text-neutral-500 mt-1.5">Grants read/write access to your GCS buckets.</p>
                    </div>
                    <div v-else class="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <div class="w-2 h-2 rounded-full bg-green-400"></div>
                      <span class="text-xs text-green-400 font-medium">Google account connected</span>
                      <button @click="connectGcsOAuth('a')" class="ml-auto text-xs text-neutral-500 hover:text-neutral-300">Reconnect</button>
                    </div>

                    <!-- Project ID input -->
                    <div v-if="gcsOAuthConnected">
                      <label class="block text-xs font-medium text-neutral-400 mb-1.5">GCP Project ID</label>
                      <div class="flex gap-2">
                        <input
                          v-model="gcsManualProjectId"
                          type="text"
                          placeholder="my-project-123456"
                          class="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-neutral-600"
                        />
                        <button
                          type="button"
                          @click="loadGcsBuckets(gcsManualProjectId)"
                          :disabled="!gcsManualProjectId.trim() || gcsLoadingBuckets"
                          class="px-4 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm rounded-lg transition-all whitespace-nowrap"
                        >
                          <Icon v-if="gcsLoadingBuckets" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
                          <span v-else>List Buckets</span>
                        </button>
                      </div>
                    </div>

                    <!-- Bucket list -->
                    <div v-if="gcsBuckets.length > 0" class="border border-neutral-700 rounded-xl bg-neutral-950 overflow-hidden">
                      <p class="px-3 py-2 text-xs font-medium text-neutral-400 border-b border-neutral-800">Select a bucket:</p>
                      <div class="max-h-40 overflow-y-auto divide-y divide-neutral-900">
                        <div
                          v-for="b in gcsBuckets" :key="b.name"
                          @click="gcsSelectedBucket = b.name; byosBucketName = b.name"
                          :class="[
                            'flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all',
                            gcsSelectedBucket === b.name ? 'bg-primary-500/10 border-l-2 border-primary-500 text-white' : 'hover:bg-neutral-800/50 text-neutral-400'
                          ]"
                        >
                          <Icon name="lucide:database" class="w-3.5 h-3.5 flex-shrink-0" />
                          <span class="text-sm flex-1 truncate">{{ b.name }}</span>
                          <span class="text-xs text-neutral-600">{{ b.location }}</span>
                          <Icon v-if="gcsSelectedBucket === b.name" name="lucide:check-circle-2" class="w-4 h-4 text-primary-400" />
                        </div>
                      </div>
                    </div>
                    <p v-if="gcsBucketsError" class="text-xs text-red-400">{{ gcsBucketsError }}</p>
                  </div>

                  <!-- ── Option B: Service Account JSON paste ── -->
                  <div v-if="gcsMode === 'b'" class="space-y-3">
                    <div>
                      <label class="block text-xs font-medium text-neutral-400 mb-1.5">
                        Paste your Service Account JSON key
                        <span class="text-neutral-600 font-normal ml-1">(auto-parses all fields)</span>
                      </label>
                      <textarea
                        v-model="gcsJsonKey"
                        @input="parseGcsJson"
                        rows="5"
                        placeholder='{ "type": "service_account", "project_id": "...", ... }'
                        class="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-neutral-600 font-mono resize-none"
                      />
                    </div>
                    <!-- Parsed preview -->
                    <div v-if="gcsProjectId || gcsClientEmail" class="p-3 bg-neutral-800/60 border border-neutral-700 rounded-lg space-y-1.5">
                      <p class="text-xs font-semibold text-green-400 flex items-center gap-1.5"><Icon name="lucide:check-circle" class="w-3.5 h-3.5" /> Key parsed successfully</p>
                      <p class="text-xs text-neutral-400">Project: <span class="text-neutral-200">{{ gcsProjectId }}</span></p>
                      <p class="text-xs text-neutral-400">Account: <span class="text-neutral-200 font-mono text-[10px]">{{ gcsClientEmail }}</span></p>
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-neutral-400 mb-1.5">Bucket Name</label>
                      <input v-model="byosBucketName" type="text" placeholder="my-dam-bucket"
                        class="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-neutral-600" />
                    </div>
                    <!-- Verify button for Option B -->
                    <button
                      type="button" @click="verifyByosCredentials"
                      :disabled="byosVerifying || byosVerified || !gcsClientEmail"
                      :class="[
                        'w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all',
                        byosVerified ? 'bg-green-600/20 border border-green-500/40 text-green-400 cursor-default'
                          : byosVerifying ? 'bg-neutral-700 text-neutral-400 cursor-wait'
                          : 'bg-primary-600 hover:bg-primary-500 text-white'
                      ]"
                    >
                      <Icon v-if="byosVerifying" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
                      <Icon v-else-if="byosVerified" name="lucide:check-circle-2" class="w-4 h-4" />
                      <Icon v-else name="lucide:shield-check" class="w-4 h-4" />
                      {{ byosVerifying ? 'Verifying...' : byosVerified ? 'Verified ✓' : 'Test & Verify Credentials' }}
                    </button>
                    <p v-if="byosVerifyError" class="text-xs text-red-400">{{ byosVerifyError }}</p>
                  </div>

                  <!-- ── Option C: OAuth + auto-discover projects ── -->
                  <div v-if="gcsMode === 'c'" class="space-y-3">
                    <!-- Connect button -->
                    <div v-if="!gcsOAuthConnected">
                      <button
                        type="button"
                        @click="connectGcsOAuth('c')"
                        :disabled="gcsOAuthConnecting"
                        class="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all"
                      >
                        <Icon v-if="gcsOAuthConnecting" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
                        <Icon v-else name="logos:google-icon" class="w-4 h-4" />
                        {{ gcsOAuthConnecting ? 'Connecting...' : 'Connect with Google' }}
                      </button>
                      <p class="text-xs text-neutral-500 mt-1.5">Grants Cloud Platform access to list your projects and buckets automatically.</p>
                    </div>
                    <div v-else class="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <div class="w-2 h-2 rounded-full bg-green-400"></div>
                      <span class="text-xs text-green-400 font-medium">Google account connected</span>
                      <button @click="connectGcsOAuth('c')" class="ml-auto text-xs text-neutral-500 hover:text-neutral-300">Reconnect</button>
                    </div>

                    <!-- Project dropdown (auto-populated) -->
                    <div v-if="gcsOAuthConnected">
                      <div v-if="gcsLoadingProjects" class="flex items-center gap-2 py-2 text-xs text-neutral-400">
                        <Icon name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" /> Loading your GCP projects...
                      </div>
                      <div v-else-if="gcsProjectsError" class="text-xs text-red-400">{{ gcsProjectsError }}</div>
                      <div v-else-if="gcsProjects.length > 0">
                        <label class="block text-xs font-medium text-neutral-400 mb-1.5">Select Project</label>
                        <select v-model="gcsSelectedProject"
                          class="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                          <option value="" disabled>Choose a GCP project</option>
                          <option v-for="p in gcsProjects" :key="p.projectId" :value="p.projectId">{{ p.name }} ({{ p.projectId }})</option>
                        </select>
                      </div>
                    </div>

                    <!-- Bucket dropdown (auto-populated after project selection) -->
                    <div v-if="gcsSelectedProject">
                      <div v-if="gcsLoadingBuckets" class="flex items-center gap-2 py-2 text-xs text-neutral-400">
                        <Icon name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" /> Loading buckets...
                      </div>
                      <div v-else-if="gcsBucketsError" class="text-xs text-red-400">{{ gcsBucketsError }}</div>
                      <div v-else-if="gcsBuckets.length > 0">
                        <label class="block text-xs font-medium text-neutral-400 mb-1.5">Select Bucket</label>
                        <div class="border border-neutral-700 rounded-xl bg-neutral-950 overflow-hidden">
                          <div class="max-h-40 overflow-y-auto divide-y divide-neutral-900">
                            <div
                              v-for="b in gcsBuckets" :key="b.name"
                              @click="gcsSelectedBucket = b.name; byosBucketName = b.name"
                              :class="[
                                'flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all',
                                gcsSelectedBucket === b.name ? 'bg-primary-500/10 border-l-2 border-primary-500 text-white' : 'hover:bg-neutral-800/50 text-neutral-400'
                              ]"
                            >
                              <Icon name="lucide:database" class="w-3.5 h-3.5 flex-shrink-0" />
                              <span class="text-sm flex-1 truncate">{{ b.name }}</span>
                              <span class="text-xs text-neutral-600">{{ b.location }}</span>
                              <Icon v-if="gcsSelectedBucket === b.name" name="lucide:check-circle-2" class="w-4 h-4 text-primary-400" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>

              </div>

              <!-- Step 3: Verify & CORS Guide -->
              <div class="space-y-2">
                <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500">3. Verify Connection</p>

                <!-- Verify button -->
                <button
                  type="button"
                  @click="verifyByosCredentials"
                  :disabled="byosVerifying || byosVerified"
                  :class="[
                    'w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all',
                    byosVerified
                      ? 'bg-green-600/20 border border-green-500/40 text-green-400 cursor-default'
                      : byosVerifying
                        ? 'bg-neutral-700 text-neutral-400 cursor-wait'
                        : 'bg-primary-600 hover:bg-primary-500 text-white'
                  ]"
                >
                  <Icon v-if="byosVerifying" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
                  <Icon v-else-if="byosVerified" name="lucide:check-circle-2" class="w-4 h-4" />
                  <Icon v-else name="lucide:shield-check" class="w-4 h-4" />
                  <span>{{ byosVerifying ? 'Verifying...' : byosVerified ? 'Credentials Verified ✓' : 'Test & Verify Credentials' }}</span>
                </button>

                <!-- Error message -->
                <div v-if="byosVerifyError" class="flex items-start gap-2 p-3 bg-red-950/30 border border-red-500/30 rounded-lg">
                  <Icon name="lucide:alert-circle" class="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p class="text-xs text-red-400">{{ byosVerifyError }}</p>
                </div>
              </div>

              <!-- CORS Guide -->
              <div class="border border-amber-500/20 rounded-xl overflow-hidden">
                <button
                  type="button"
                  @click="byosShowCorsGuide = !byosShowCorsGuide"
                  class="w-full flex items-center justify-between px-4 py-3 bg-amber-950/20 hover:bg-amber-950/30 transition-colors"
                >
                  <div class="flex items-center gap-2">
                    <Icon name="lucide:triangle-alert" class="w-4 h-4 text-amber-400" />
                    <span class="text-xs font-semibold text-amber-400">Required: Configure CORS on your bucket</span>
                  </div>
                  <Icon :name="byosShowCorsGuide ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="w-4 h-4 text-amber-400" />
                </button>
                <div v-show="byosShowCorsGuide" class="p-4 space-y-3 bg-neutral-950/50 border-t border-amber-500/10">
                  <p class="text-xs text-neutral-400">For direct browser uploads to work, add this CORS rule to your bucket. Without it, uploads will be blocked.</p>

                  <!-- AWS S3 / R2 CORS -->
                  <div v-if="byosProvider === 'aws' || byosProvider === 'r2'">
                    <p class="text-xs font-semibold text-neutral-300 mb-1.5">AWS S3 / Cloudflare R2 — Bucket CORS Policy (JSON)</p>
                    <pre class="bg-neutral-900 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-300 overflow-x-auto whitespace-pre">[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]</pre>
                    <p class="text-xs text-neutral-500 mt-1.5">Replace <code class="text-primary-400">*</code> in AllowedOrigins with your app's domain for production.</p>
                  </div>

                  <!-- GCS CORS -->
                  <div v-if="byosProvider === 'gcs'">
                    <p class="text-xs font-semibold text-neutral-300 mb-1.5">Google Cloud Storage — CORS (JSON for <code class="text-primary-400">gcloud storage buckets update</code>)</p>
                    <pre class="bg-neutral-900 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-300 overflow-x-auto whitespace-pre">[{
  "origin": ["*"],
  "method": ["PUT"],
  "responseHeader": ["Content-Type"],
  "maxAgeSeconds": 3600
}]</pre>
                    <p class="text-xs text-neutral-500 mt-1.5">Run: <code class="text-primary-400">gcloud storage buckets update gs://BUCKET_NAME --cors-file=cors.json</code></p>
                  </div>
                </div>
              </div>
            </div>

            <!-- GDrive Inline Connection Flow -->
            <div v-if="orgType === 'gdrive'" class="space-y-3">
              <div class="border border-neutral-700 rounded-xl overflow-hidden">
                <!-- Not connected -->
                <div v-if="!gdriveConnected" class="p-4 space-y-3">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <Icon name="lucide:hard-drive" class="text-blue-400 w-5 h-5" />
                    </div>
                    <div>
                      <p class="text-sm font-medium text-white">Connect Google Drive</p>
                      <p class="text-xs text-neutral-400">Authorize access and pick your organization folder</p>
                    </div>
                  </div>
                  <p v-if="gdriveError" class="text-xs text-red-400">{{ gdriveError }}</p>
                  <button
                    type="button"
                    @click="connectGDrive"
                    :disabled="gdriveConnecting"
                    class="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all"
                  >
                    <Icon v-if="gdriveConnecting" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
                    <Icon v-else name="lucide:link" class="w-4 h-4" />
                    {{ gdriveConnecting ? 'Connecting...' : 'Connect Google Account' }}
                  </button>
                </div>

                <!-- Connected: show folder picker -->
                <div v-else class="divide-y divide-neutral-700/50">
                  <!-- Connection status bar -->
                  <div class="flex items-center justify-between px-4 py-2.5 bg-green-500/5">
                    <div class="flex items-center gap-2">
                      <div class="w-2 h-2 rounded-full bg-green-400"></div>
                      <span class="text-xs font-medium text-green-400">Google Drive Connected</span>
                    </div>
                    <button @click="connectGDrive" class="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
                      Reconnect
                    </button>
                  </div>

                  <!-- Folder search + list -->
                  <div class="p-3 space-y-2">
                    <p class="text-xs font-medium text-neutral-400 mb-2">Select a folder for your organization:</p>
                    <input
                      v-model="gdriveSearchQ"
                      placeholder="Search folders..."
                      class="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-neutral-600"
                    />
                    <div class="border border-neutral-800 rounded-lg bg-neutral-950 max-h-40 overflow-y-auto divide-y divide-neutral-900">
                      <div v-if="gdriveLoadingFolders" class="p-6 flex justify-center">
                        <Icon name="lucide:loader-2" class="w-5 h-5 animate-spin text-primary-500" />
                      </div>
                      <div v-else-if="filteredGdriveFolders.length === 0" class="p-4 text-center text-neutral-500 text-xs italic">
                        No folders found.
                      </div>
                      <div
                        v-for="folder in filteredGdriveFolders"
                        :key="folder.id"
                        @click="selectedGDriveFolder = folder"
                        :class="[
                          'flex items-center gap-2.5 p-3 cursor-pointer transition-all',
                          selectedGDriveFolder?.id === folder.id
                            ? 'bg-primary-500/10 border-l-2 border-primary-500 text-white'
                            : 'hover:bg-neutral-800/50 text-neutral-400 hover:text-neutral-200'
                        ]"
                      >
                        <Icon name="lucide:folder" class="w-4 h-4 flex-shrink-0" :class="selectedGDriveFolder?.id === folder.id ? 'text-primary-400' : 'text-neutral-500'" />
                        <span class="text-sm truncate">{{ folder.name }}</span>
                        <Icon v-if="selectedGDriveFolder?.id === folder.id" name="lucide:check-circle-2" class="w-4 h-4 ml-auto text-primary-400 flex-shrink-0" />
                      </div>
                    </div>
                    <p v-if="selectedGDriveFolder" class="text-xs text-primary-400 flex items-center gap-1.5">
                      <Icon name="lucide:folder-check" class="w-3.5 h-3.5" />
                      Selected: <strong>{{ selectedGDriveFolder.name }}</strong>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Status banners -->
            <div v-if="orgType === 's3'" class="p-3 bg-primary-950/20 border border-primary-500/20 rounded-lg text-xs text-primary-400">
              <Icon name="lucide:clock" class="inline mr-1 size-4" />
              Your request will be reviewed by a Super Admin. You'll be notified once approved.
            </div>
            <div v-else-if="orgType === 'gdrive' && !selectedGDriveFolder" class="p-3 bg-blue-950/20 border border-blue-500/20 rounded-lg text-xs text-blue-400">
              <Icon name="lucide:info" class="inline mr-1 size-4" />
              Connect your Google Drive and select a folder before submitting.
            </div>
            <div v-else-if="orgType === 'gdrive' && selectedGDriveFolder" class="p-3 bg-green-950/20 border border-green-500/20 rounded-lg text-xs text-green-400">
              <Icon name="lucide:check-circle" class="inline mr-1 size-4" />
              Folder ready. Submit your organization request for Super Admin approval.
            </div>
            <div v-else-if="orgType === 'byos' && !canSubmit" class="p-3 bg-amber-950/20 border border-amber-500/20 rounded-lg text-xs text-amber-400">
              <Icon name="lucide:info" class="inline mr-1 size-4" />
              <span v-if="byosProvider === 'gcs' && gcsMode !== 'b'">Connect your Google account and select a bucket to continue.</span>
              <span v-else>Complete and verify your storage credentials above before submitting.</span>
            </div>
            <div v-else-if="orgType === 'byos' && canSubmit" class="p-3 bg-green-950/20 border border-green-500/20 rounded-lg text-xs text-green-400">
              <Icon name="lucide:check-circle" class="inline mr-1 size-4" />
              Storage ready. Submit your organization request for Super Admin approval.
            </div>
          </div>

          <!-- JOIN ORG FORM -->
          <div v-else class="space-y-5">
            <!-- Select Organization -->
            <div>
              <label class="block text-sm font-medium text-neutral-300 mb-2">
                Organization
              </label>
              <select
                v-model="selectedOrgId"
                class="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="" disabled>Select an organization</option>
                <option v-for="org in organizationsList" :key="org.id" :value="org.id">
                  {{ org.name }}
                </option>
              </select>
            </div>

            <!-- Dynamic Department Selector -->
            <div v-if="selectedOrgId">
              <label class="block text-sm font-medium text-neutral-300 mb-2">
                Department
              </label>
              <select
                v-model="selectedDept"
                class="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="" disabled>Select department</option>
                <option v-for="dept in getDeptOptions" :key="dept.value" :value="dept.value">
                  {{ dept.label }}
                </option>
              </select>
            </div>

            <!-- Role Selector -->
            <div v-if="selectedOrgId">
              <label class="block text-sm font-medium text-neutral-300 mb-2">
                Your Role
              </label>
              <div v-if="rolesList.length === 0" class="text-xs text-neutral-450 italic">
                No roles found for this organization.
              </div>
              <div v-else class="grid grid-cols-1 gap-2">
                <label
                  v-for="role in rolesList"
                  :key="role.id"
                  :class="[
                    'flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all',
                    selectedRole === role.id
                      ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                      : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600',
                  ]"
                >
                  <input type="radio" v-model="selectedRole" :value="role.id" class="hidden" />
                  <div class="flex-1">
                    <p class="text-sm font-medium">{{ role.label }}</p>
                  </div>
                  <div
                    :class="[
                      'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                      selectedRole === role.id ? 'border-primary-500' : 'border-neutral-600',
                    ]"
                  >
                    <div v-if="selectedRole === role.id" class="w-2 h-2 rounded-full bg-primary-500" />
                  </div>
                </label>
              </div>
            </div>
          </div>

          <!-- Error -->
          <p v-if="error" class="text-red-400 text-sm text-center font-medium">{{ error }}</p>

          <!-- Submit -->
          <UButton
            class="w-full justify-center"
            color="primary"
            variant="solid"
            size="xl"
            :loading="loading"
            :disabled="!canSubmit"
            @click="handleSubmit"
          >
            {{ orgAction === "create" ? "Create & Set Up" : "Submit for Approval" }}
          </UButton>
        </div>
      </div>
      </div>
      <!-- /LEFT COLUMN -->

      <!-- RIGHT COLUMN — Contextual Help Guide (only when Cloud Storage BYOS is active) -->
      <div v-if="orgAction === 'create' && orgType === 'byos'" class="hidden lg:block">
        <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl sticky top-8">
          <div class="flex items-center gap-2 mb-5">
            <Icon name="lucide:book-open" class="w-5 h-5 text-primary-400" />
            <h2 class="text-sm font-semibold text-white">How to get your credentials</h2>
          </div>

          <!-- AWS S3 guide -->
          <div v-if="byosProvider === 'aws'" class="space-y-4">
            <div class="flex items-center gap-2 mb-3">
              <div class="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Icon name="logos:aws" class="w-4 h-4" />
              </div>
              <span class="text-xs font-semibold text-amber-400">Amazon S3</span>
            </div>
            <ol class="space-y-3">
              <li v-for="(step, i) in [
                { title: 'Sign in to AWS Console', desc: 'Go to console.aws.amazon.com and log in with your AWS account.' },
                { title: 'Create an IAM User', desc: 'Navigate to IAM → Users → Create User. Give it a name like dam-uploads.' },
                { title: 'Attach Permissions', desc: 'On the Permissions step, attach the AmazonS3FullAccess policy (or a custom policy scoped to your bucket).' },
                { title: 'Create Access Keys', desc: 'Go to the user → Security credentials → Create access key. Select Application running outside AWS. Download the CSV.' },
                { title: 'Create your S3 Bucket', desc: 'Go to S3 → Create bucket. Note the bucket name and the AWS region (e.g. us-east-1).' },
              ]" :key="i" class="flex gap-3">
                <div class="w-5 h-5 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center flex-shrink-0 text-xs font-bold text-neutral-400 mt-0.5">{{ i + 1 }}</div>
                <div>
                  <p class="text-xs font-semibold text-neutral-200">{{ step.title }}</p>
                  <p class="text-xs text-neutral-500 mt-0.5">{{ step.desc }}</p>
                </div>
              </li>
            </ol>
            <a href="https://console.aws.amazon.com/iam/" target="_blank" class="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors">
              <Icon name="lucide:external-link" class="w-3.5 h-3.5" /> Open AWS IAM Console
            </a>
          </div>

          <!-- Cloudflare R2 guide -->
          <div v-if="byosProvider === 'r2'" class="space-y-4">
            <div class="flex items-center gap-2 mb-3">
              <div class="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Icon name="logos:cloudflare-icon" class="w-4 h-4" />
              </div>
              <span class="text-xs font-semibold text-orange-400">Cloudflare R2</span>
            </div>
            <ol class="space-y-3">
              <li v-for="(step, i) in [
                { title: 'Sign in to Cloudflare', desc: 'Go to dash.cloudflare.com and log in to your account.' },
                { title: 'Create an R2 Bucket', desc: 'In the sidebar, go to R2 Object Storage → Create bucket. Note your bucket name.' },
                { title: 'Get your Account ID', desc: 'On the R2 overview page, find your Account ID in the top-right. Your endpoint will be: https://<account-id>.r2.cloudflarestorage.com' },
                { title: 'Create an API Token', desc: 'Click Manage R2 API Tokens → Create API Token. Select Edit permissions. Save your Access Key ID and Secret Access Key.' },
                { title: 'Enter credentials', desc: 'Paste the bucket name, access key ID, secret access key, and endpoint URL into the form.' },
              ]" :key="i" class="flex gap-3">
                <div class="w-5 h-5 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center flex-shrink-0 text-xs font-bold text-neutral-400 mt-0.5">{{ i + 1 }}</div>
                <div>
                  <p class="text-xs font-semibold text-neutral-200">{{ step.title }}</p>
                  <p class="text-xs text-neutral-500 mt-0.5">{{ step.desc }}</p>
                </div>
              </li>
            </ol>
            <a href="https://dash.cloudflare.com/?to=/:account/r2" target="_blank" class="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors">
              <Icon name="lucide:external-link" class="w-3.5 h-3.5" /> Open Cloudflare R2 Dashboard
            </a>
          </div>

          <!-- GCS guides — changes based on mode -->
          <div v-if="byosProvider === 'gcs'" class="space-y-4">
            <div class="flex items-center gap-2 mb-3">
              <div class="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Icon name="logos:google-cloud" class="w-4 h-4" />
              </div>
              <span class="text-xs font-semibold text-blue-400">Google Cloud Storage</span>
            </div>

            <!-- Mode A -->
            <template v-if="gcsMode === 'a'">
              <p class="text-xs text-neutral-400 mb-3">You'll connect your Google account and enter your Project ID manually.</p>
              <ol class="space-y-3">
                <li v-for="(step, i) in [
                  { title: 'Click Connect with Google', desc: 'This opens the Google sign-in screen. Use the same account that owns your GCP project.' },
                  { title: 'Approve storage access', desc: 'Google will ask to access your Cloud Storage. Click Allow — this only grants access to your GCS buckets, not your emails or other data.' },
                  { title: 'Find your Project ID', desc: 'In Google Cloud Console (console.cloud.google.com), open the project picker in the top-left. Your Project ID is shown below the project name (e.g. my-project-123456).' },
                  { title: 'Enter Project ID & list buckets', desc: 'Paste your Project ID and click List Buckets. All buckets in that project will appear.' },
                  { title: 'Select your bucket', desc: 'Click the bucket you want to use for your organization\'s file storage.' },
                ]" :key="i" class="flex gap-3">
                  <div class="w-5 h-5 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center flex-shrink-0 text-xs font-bold text-neutral-400 mt-0.5">{{ i + 1 }}</div>
                  <div>
                    <p class="text-xs font-semibold text-neutral-200">{{ step.title }}</p>
                    <p class="text-xs text-neutral-500 mt-0.5">{{ step.desc }}</p>
                  </div>
                </li>
              </ol>
              <a href="https://console.cloud.google.com/" target="_blank" class="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors">
                <Icon name="lucide:external-link" class="w-3.5 h-3.5" /> Open GCP Console
              </a>
            </template>

            <!-- Mode B -->
            <template v-if="gcsMode === 'b'">
              <p class="text-xs text-neutral-400 mb-3">Use a Service Account JSON key — no OAuth required.</p>
              <ol class="space-y-3">
                <li v-for="(step, i) in [
                  { title: 'Open Google Cloud Console', desc: 'Go to console.cloud.google.com and select your project.' },
                  { title: 'Go to Service Accounts', desc: 'Navigate to IAM & Admin → Service Accounts → Create Service Account.' },
                  { title: 'Name & assign a role', desc: 'Give it a name (e.g. dam-uploader). On the role step, assign Storage Admin or Storage Object Creator.' },
                  { title: 'Download the JSON key', desc: 'Click the service account → Keys tab → Add Key → Create new key → JSON. A .json file will download.' },
                  { title: 'Paste the JSON here', desc: 'Open the downloaded file in a text editor, select all, and paste it into the text area. All fields will auto-fill.' },
                  { title: 'Enter your bucket name', desc: 'Go to Cloud Storage → Buckets to find your bucket name, then enter it in the Bucket Name field.' },
                ]" :key="i" class="flex gap-3">
                  <div class="w-5 h-5 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center flex-shrink-0 text-xs font-bold text-neutral-400 mt-0.5">{{ i + 1 }}</div>
                  <div>
                    <p class="text-xs font-semibold text-neutral-200">{{ step.title }}</p>
                    <p class="text-xs text-neutral-500 mt-0.5">{{ step.desc }}</p>
                  </div>
                </li>
              </ol>
              <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" class="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors">
                <Icon name="lucide:external-link" class="w-3.5 h-3.5" /> Open Service Accounts
              </a>
            </template>

            <!-- Mode C -->
            <template v-if="gcsMode === 'c'">
              <p class="text-xs text-neutral-400 mb-3">Fully automatic — your projects and buckets will load after sign-in.</p>
              <ol class="space-y-3">
                <li v-for="(step, i) in [
                  { title: 'Click Connect with Google', desc: 'Use the same Google account that owns your GCP project.' },
                  { title: 'Approve Cloud Platform access', desc: 'Google will ask for broader cloud access to list your projects. Click Allow. This is safe and scoped to read-only project listing + GCS bucket access.' },
                  { title: 'Select your GCP project', desc: 'After connecting, a dropdown will appear with all GCP projects linked to your account. Choose the one that contains your bucket.' },
                  { title: 'Select your bucket', desc: 'After picking a project, all its GCS buckets will load automatically. Click the one you want to use.' },
                ]" :key="i" class="flex gap-3">
                  <div class="w-5 h-5 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center flex-shrink-0 text-xs font-bold text-neutral-400 mt-0.5">{{ i + 1 }}</div>
                  <div>
                    <p class="text-xs font-semibold text-neutral-200">{{ step.title }}</p>
                    <p class="text-xs text-neutral-500 mt-0.5">{{ step.desc }}</p>
                  </div>
                </li>
              </ol>
              <div class="mt-3 p-3 bg-blue-950/30 border border-blue-500/20 rounded-lg">
                <p class="text-xs text-blue-400"><Icon name="lucide:info" class="inline w-3.5 h-3.5 mr-1" />This method requires a GCP project linked to your Google account. If you haven't created a GCP project yet, use Option B (Service Account) instead.</p>
              </div>
            </template>
          </div>

          <!-- CORS reminder for all providers -->
          <div class="mt-6 pt-5 border-t border-neutral-800">
            <button
              type="button"
              @click="byosShowCorsGuide = !byosShowCorsGuide"
              class="w-full flex items-center justify-between text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
            >
              <span class="flex items-center gap-1.5"><Icon name="lucide:triangle-alert" class="w-3.5 h-3.5" /> CORS setup required</span>
              <Icon :name="byosShowCorsGuide ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="w-3.5 h-3.5" />
            </button>
            <div v-show="byosShowCorsGuide" class="mt-3 space-y-2">
              <p class="text-xs text-neutral-400">For direct browser uploads to work, add a CORS rule to your bucket:</p>
              <div v-if="byosProvider === 'aws' || byosProvider === 'r2'">
                <p class="text-xs font-semibold text-neutral-300 mb-1">S3 / R2 — CORS JSON</p>
                <pre class="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-300 overflow-x-auto">[{"AllowedHeaders":["*"],"AllowedMethods":["PUT"],"AllowedOrigins":["*"],"ExposeHeaders":["ETag"]}]</pre>
              </div>
              <div v-if="byosProvider === 'gcs'">
                <p class="text-xs font-semibold text-neutral-300 mb-1">GCS — CORS JSON</p>
                <pre class="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-300 overflow-x-auto">[{"origin":["*"],"method":["PUT"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]</pre>
                <p class="text-xs text-neutral-500 mt-1">Run: <code class="text-primary-400">gcloud storage buckets update gs://BUCKET --cors-file=cors.json</code></p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- /RIGHT COLUMN -->
    </div>
  </div>
</template>
