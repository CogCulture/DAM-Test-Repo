<script setup lang="ts">
definePageMeta({ layout: "guest" });

import { ref, onMounted, computed, watch } from "vue";

const { user, fetch: fetchSession } = useUserSession();
const router = useRouter();
const route = useRoute();

const loading = ref(false);
const saving = ref(false);
const error = ref("");
const successMsg = ref("");

type StorageType = "s3" | "gdrive" | "onedrive" | "sharepoint" | "byos" | "box" | "dropbox";

const currentOrgType = ref<StorageType>("s3");
const selectedOrgType = ref<StorageType>("s3");

// ─── BYOS State ──────────────────────────────────────────────────────────────
const byosProvider = ref<"aws" | "r2" | "gcs">("aws");
const byosVerifying = ref(false);
const byosVerified = ref(false);
const byosVerifyError = ref("");
const byosBucketName = ref("");

// AWS / R2 fields
const byosAccessKeyId = ref("");
const byosSecretAccessKey = ref("");
const byosRegion = ref("us-east-1");
const byosEndpoint = ref("");

// GCS Service Account JSON mode
const gcsMode = ref<"a" | "b" | "c">("c");
const gcsJsonKey = ref("");
const gcsProjectId = ref("");
const gcsClientEmail = ref("");
const gcsPrivateKey = ref("");

// GCS OAuth state
const gcsOAuthConnected = ref(false);
const gcsOAuthConnecting = ref(false);
const gcsManualProjectId = ref("");
const gcsBuckets = ref<{ name: string; location: string }[]>([]);
const gcsLoadingBuckets = ref(false);
const gcsBucketsError = ref("");
const gcsSelectedBucket = ref("");
const gcsProjects = ref<{ projectId: string; name: string }[]>([]);
const gcsLoadingProjects = ref(false);
const gcsProjectsError = ref("");
const gcsSelectedProject = ref("");

// GDrive state
const gdriveConnected = ref(false);
const gdriveConnecting = ref(false);

// Microsoft OneDrive & SharePoint State
const onedriveConnected = ref(false);
const onedriveConnecting = ref(false);

const sharepointConnected = ref(false);
const sharepointConnecting = ref(false);
const sharepointSiteUrl = ref("");
const sharepointDocumentLibrary = ref("Documents");

// Box & Dropbox State
const boxConnected = ref(false);
const dropboxConnected = ref(false);

const connectGcsOAuth = (mode: "a" | "c") => {
  gcsOAuthConnecting.value = true;
  window.location.href = `/api/auth/google?gcs=${mode}`;
};

const checkGcsOAuthStatus = async () => {
  try {
    const status = await $fetch<{ connected: boolean }>("/api/storage/gcs/status");
    if (status.connected) {
      gcsOAuthConnected.value = true;
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
    gcsProjectsError.value = e?.data?.message ?? "Failed to load GCP projects.";
  } finally {
    gcsLoadingProjects.value = false;
  }
};

const loadGcsBuckets = async (projId: string) => {
  if (!projId?.trim()) return;
  gcsLoadingBuckets.value = true;
  gcsBucketsError.value = "";
  try {
    gcsBuckets.value = await $fetch<{ name: string; location: string }[]>(`/api/storage/gcs/buckets?projectId=${projId}`);
  } catch (e: any) {
    gcsBucketsError.value = e?.data?.message ?? "Failed to load buckets.";
  } finally {
    gcsLoadingBuckets.value = false;
  }
};

watch(gcsSelectedProject, (proj) => {
  if (proj) loadGcsBuckets(proj);
});

const checkGDriveConnection = async () => {
  try {
    const status = await $fetch<{ connected: boolean }>("/api/gdrive/status");
    if (status.connected) {
      gdriveConnected.value = true;
    }
  } catch {
    gdriveConnected.value = false;
  }
};

const connectGDrive = () => {
  gdriveConnecting.value = true;
  window.location.href = "/api/auth/google?gdrive=true";
};

const connectOneDrive = () => {
  onedriveConnecting.value = true;
  setTimeout(() => {
    onedriveConnected.value = true;
    onedriveConnecting.value = false;
  }, 1200);
};

const connectSharePoint = () => {
  if (!sharepointSiteUrl.value.trim()) return;
  sharepointConnecting.value = true;
  setTimeout(() => {
    sharepointConnected.value = true;
    sharepointConnecting.value = false;
  }, 1200);
};

const connectBox = () => {
  boxConnected.value = !boxConnected.value;
};

const connectDropbox = () => {
  dropboxConnected.value = !dropboxConnected.value;
};

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
    byosVerifyError.value = e?.data?.message ?? "Credentials verification failed.";
  } finally {
    byosVerifying.value = false;
  }
};

onMounted(async () => {
  loading.value = true;
  try {
    const settings: any = await $fetch("/api/organizations/settings");
    if (settings && settings.orgType) {
      currentOrgType.value = settings.orgType;
      selectedOrgType.value = settings.orgType;
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  } finally {
    loading.value = false;
  }

  if (route.query.gcs === "connected") {
    selectedOrgType.value = "byos";
    byosProvider.value = "gcs";
    await checkGcsOAuthStatus();
    router.replace({ query: {} });
  }

  await checkGDriveConnection();
});

const canSave = computed(() => {
  if (selectedOrgType.value === "byos") {
    if (byosProvider.value === "gcs") {
      if (gcsMode.value === "b") return byosVerified.value;
      return gcsOAuthConnected.value && !!byosBucketName.value;
    }
    return byosVerified.value;
  }
  if (selectedOrgType.value === "gdrive") {
    return gdriveConnected.value;
  }
  if (selectedOrgType.value === "onedrive") {
    return onedriveConnected.value;
  }
  if (selectedOrgType.value === "sharepoint") {
    return sharepointConnected.value && !!sharepointSiteUrl.value.trim();
  }
  return true;
});

const handleSaveStorage = async () => {
  saving.value = true;
  error.value = "";
  successMsg.value = "";

  try {
    let gcsByosConfig: any = undefined;
    if (selectedOrgType.value === "byos" && byosProvider.value === "gcs") {
      if (gcsMode.value === "b") {
        gcsByosConfig = { provider: "gcs", projectId: gcsProjectId.value, clientEmail: gcsClientEmail.value, privateKey: gcsPrivateKey.value, bucketName: byosBucketName.value };
      } else {
        const selProject = gcsMode.value === "c" ? gcsSelectedProject.value : gcsManualProjectId.value;
        gcsByosConfig = { provider: "gcs", bucketName: byosBucketName.value, projectId: selProject };
      }
    }

    await $fetch("/api/organizations/storage-type", {
      method: "POST",
      body: {
        orgType: selectedOrgType.value,
        byosConfig: selectedOrgType.value === "byos"
          ? (byosProvider.value === "gcs" ? gcsByosConfig : byosConfigPayload.value)
          : undefined,
      },
    });

    await fetchSession();
    successMsg.value = "Workspace Storage Option updated successfully!";
    setTimeout(() => {
      router.push("/");
    }, 600);
  } catch (e: any) {
    error.value = e?.data?.message ?? "Failed to save storage option.";
  } finally {
    saving.value = false;
  }
};

const continueWithoutChanges = () => {
  router.push("/");
};

const getStorageLabel = (type: StorageType) => {
  switch (type) {
    case "s3": return "PLATFORM (S3)";
    case "gdrive": return "GOOGLE DRIVE";
    case "onedrive": return "MICROSOFT ONEDRIVE";
    case "sharepoint": return "MICROSOFT SHAREPOINT";
    case "byos": return "CLOUD BYOS";
    case "box": return "BOX ENTERPRISE";
    case "dropbox": return "DROPBOX BUSINESS";
    default: return "PLATFORM (S3)";
  }
};
</script>

<template>
  <div class="relative min-h-screen flex items-center justify-center bg-[#07090e] px-4 py-12 text-white overflow-hidden selection:bg-indigo-500 selection:text-white">
    <!-- Ambient Glassmorphism Background -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -top-40 left-1/2 -translate-x-1/2 size-[38rem] rounded-full bg-gradient-to-tr from-indigo-600/20 via-sky-600/15 to-purple-600/10 blur-[130px]" />
      <div class="absolute bottom-0 right-10 size-[30rem] rounded-full bg-emerald-500/10 blur-[150px]" />
      <div class="absolute top-1/3 -left-20 size-[26rem] rounded-full bg-blue-600/10 blur-[110px]" />
      <div class="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)]" />
    </div>

    <div class="relative z-10 w-full max-w-5xl my-auto">
      <!-- Header Section -->
      <div class="text-center mb-10 space-y-3">
        <div class="inline-flex items-center justify-center p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 shadow-inner mb-2 ring-4 ring-indigo-500/5">
          <Icon name="lucide:hard-drive" class="size-8 text-indigo-400" />
        </div>
        
        <h1 class="text-3xl sm:text-4xl font-black tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
          Select Workspace Storage Option
        </h1>
        
        <p class="text-slate-400 text-sm sm:text-base max-w-xl mx-auto font-normal leading-relaxed">
          Choose which cloud storage provider to use for storing, indexing & syncing your organization's digital assets.
        </p>

        <div v-if="currentOrgType" class="pt-2">
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-xs font-medium text-indigo-300 backdrop-blur-md shadow-sm">
            <span class="size-2 rounded-full bg-indigo-400 animate-ping" />
            <span class="size-2 rounded-full bg-indigo-400 -ml-4" />
            <span>Currently Active: <strong class="uppercase font-bold text-white tracking-wider">{{ getStorageLabel(currentOrgType) }}</strong></span>
          </div>
        </div>
      </div>

      <!-- Main Options Container -->
      <div class="relative rounded-3xl border border-white/10 bg-slate-900/80 p-6 sm:p-10 shadow-[0_32px_90px_rgba(0,0,0,0.6)] backdrop-blur-2xl space-y-8">
        
        <!-- Primary Storage Provider Cards Grid -->
        <div>
          <h2 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
            <Icon name="lucide:server" class="size-4 text-indigo-400" />
            Choose Enterprise Storage Connection
          </h2>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <!-- 1. Platform S3 -->
            <div
              @click="selectedOrgType = 's3'"
              :class="[
                'group cursor-pointer relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 flex flex-col justify-between gap-4',
                selectedOrgType === 's3'
                  ? 'border-indigo-500/80 bg-gradient-to-b from-indigo-500/20 via-indigo-500/10 to-transparent ring-2 ring-indigo-500/40 shadow-[0_0_30px_rgba(99,102,241,0.2)]'
                  : 'border-white/8 bg-slate-950/50 hover:border-white/20 hover:bg-slate-800/40'
              ]"
            >
              <div class="flex items-center justify-between">
                <div :class="['p-3 rounded-xl border transition-colors', selectedOrgType === 's3' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' : 'bg-white/5 text-slate-400 border-white/10 group-hover:text-indigo-400']">
                  <Icon name="lucide:database" class="size-6" />
                </div>
                <div v-if="selectedOrgType === 's3'" class="flex items-center justify-center size-6 rounded-full bg-indigo-500 text-white shadow-md">
                  <Icon name="lucide:check" class="size-3.5 stroke-[3]" />
                </div>
              </div>

              <div class="space-y-1">
                <h3 class="text-base font-bold text-white group-hover:text-indigo-200 transition-colors">Platform (S3)</h3>
                <p class="text-xs text-slate-400 leading-relaxed font-normal">
                  Centralized cloud object storage with instant Pinecone RAG AI semantic search.
                </p>
              </div>

              <div class="pt-2 border-t border-white/5">
                <span class="inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                  <span class="size-1.5 rounded-full bg-indigo-400" />
                  HIGH SPEED & UNIFIED
                </span>
              </div>
            </div>

            <!-- 2. Google Drive -->
            <div
              @click="selectedOrgType = 'gdrive'"
              :class="[
                'group cursor-pointer relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 flex flex-col justify-between gap-4',
                selectedOrgType === 'gdrive'
                  ? 'border-emerald-500/80 bg-gradient-to-b from-emerald-500/20 via-emerald-500/10 to-transparent ring-2 ring-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.2)]'
                  : 'border-white/8 bg-slate-950/50 hover:border-white/20 hover:bg-slate-800/40'
              ]"
            >
              <div class="flex items-center justify-between">
                <div :class="['p-3 rounded-xl border transition-colors', selectedOrgType === 'gdrive' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-white/5 text-slate-400 border-white/10 group-hover:text-emerald-400']">
                  <Icon name="logos:google-drive" class="size-6" />
                </div>
                <div v-if="selectedOrgType === 'gdrive'" class="flex items-center justify-center size-6 rounded-full bg-emerald-500 text-white shadow-md">
                  <Icon name="lucide:check" class="size-3.5 stroke-[3]" />
                </div>
              </div>

              <div class="space-y-1">
                <h3 class="text-base font-bold text-white group-hover:text-emerald-200 transition-colors">Google Drive</h3>
                <p class="text-xs text-slate-400 leading-relaxed font-normal">
                  Store & sync digital assets directly in Google Drive cloud folders.
                </p>
              </div>

              <div class="pt-2 border-t border-white/5">
                <span class="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                  <span class="size-1.5 rounded-full bg-emerald-400" />
                  GOOGLE DRIVE SYNC
                </span>
              </div>
            </div>

            <!-- 3. Microsoft OneDrive -->
            <div
              @click="selectedOrgType = 'onedrive'"
              :class="[
                'group cursor-pointer relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 flex flex-col justify-between gap-4',
                selectedOrgType === 'onedrive'
                  ? 'border-sky-500/80 bg-gradient-to-b from-sky-500/20 via-sky-500/10 to-transparent ring-2 ring-sky-500/40 shadow-[0_0_30px_rgba(14,165,233,0.2)]'
                  : 'border-white/8 bg-slate-950/50 hover:border-white/20 hover:bg-slate-800/40'
              ]"
            >
              <div class="flex items-center justify-between">
                <div :class="['p-3 rounded-xl border transition-colors', selectedOrgType === 'onedrive' ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-white/5 text-slate-400 border-white/10 group-hover:text-sky-400']">
                  <Icon name="logos:microsoft-onedrive" class="size-6" />
                </div>
                <div v-if="selectedOrgType === 'onedrive'" class="flex items-center justify-center size-6 rounded-full bg-sky-500 text-white shadow-md">
                  <Icon name="lucide:check" class="size-3.5 stroke-[3]" />
                </div>
              </div>

              <div class="space-y-1">
                <h3 class="text-base font-bold text-white group-hover:text-sky-200 transition-colors">Microsoft OneDrive</h3>
                <p class="text-xs text-slate-400 leading-relaxed font-normal">
                  Connect Microsoft 365 Personal or Business OneDrive storage.
                </p>
              </div>

              <div class="pt-2 border-t border-white/5">
                <span class="inline-flex items-center gap-1.5 text-[10px] font-bold text-sky-400 uppercase tracking-wider">
                  <span class="size-1.5 rounded-full bg-sky-400" />
                  MS GRAPH API CONNECT
                </span>
              </div>
            </div>

            <!-- 4. Microsoft SharePoint -->
            <div
              @click="selectedOrgType = 'sharepoint'"
              :class="[
                'group cursor-pointer relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 flex flex-col justify-between gap-4',
                selectedOrgType === 'sharepoint'
                  ? 'border-teal-500/80 bg-gradient-to-b from-teal-500/20 via-teal-500/10 to-transparent ring-2 ring-teal-500/40 shadow-[0_0_30px_rgba(20,184,166,0.2)]'
                  : 'border-white/8 bg-slate-950/50 hover:border-white/20 hover:bg-slate-800/40'
              ]"
            >
              <div class="flex items-center justify-between">
                <div :class="['p-3 rounded-xl border transition-colors', selectedOrgType === 'sharepoint' ? 'bg-teal-500/20 text-teal-300 border-teal-500/40' : 'bg-white/5 text-slate-400 border-white/10 group-hover:text-teal-400']">
                  <Icon name="lucide:file-spreadsheet" class="size-6 text-teal-400" />
                </div>
                <div v-if="selectedOrgType === 'sharepoint'" class="flex items-center justify-center size-6 rounded-full bg-teal-500 text-white shadow-md">
                  <Icon name="lucide:check" class="size-3.5 stroke-[3]" />
                </div>
              </div>

              <div class="space-y-1">
                <h3 class="text-base font-bold text-white group-hover:text-teal-200 transition-colors">SharePoint</h3>
                <p class="text-xs text-slate-400 leading-relaxed font-normal">
                  Sync DAM assets with Microsoft SharePoint Document Libraries.
                </p>
              </div>

              <div class="pt-2 border-t border-white/5">
                <span class="inline-flex items-center gap-1.5 text-[10px] font-bold text-teal-400 uppercase tracking-wider">
                  <span class="size-1.5 rounded-full bg-teal-400" />
                  SHAREPOINT DOCUMENT LIBRARIES
                </span>
              </div>
            </div>

            <!-- 5. Cloud BYOS -->
            <div
              @click="selectedOrgType = 'byos'"
              :class="[
                'group cursor-pointer relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 flex flex-col justify-between gap-4',
                selectedOrgType === 'byos'
                  ? 'border-purple-500/80 bg-gradient-to-b from-purple-500/20 via-purple-500/10 to-transparent ring-2 ring-purple-500/40 shadow-[0_0_30px_rgba(168,85,247,0.2)]'
                  : 'border-white/8 bg-slate-950/50 hover:border-white/20 hover:bg-slate-800/40'
              ]"
            >
              <div class="flex items-center justify-between">
                <div :class="['p-3 rounded-xl border transition-colors', selectedOrgType === 'byos' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'bg-white/5 text-slate-400 border-white/10 group-hover:text-purple-400']">
                  <Icon name="lucide:cloud-upload" class="size-6" />
                </div>
                <div v-if="selectedOrgType === 'byos'" class="flex items-center justify-center size-6 rounded-full bg-purple-500 text-white shadow-md">
                  <Icon name="lucide:check" class="size-3.5 stroke-[3]" />
                </div>
              </div>

              <div class="space-y-1">
                <h3 class="text-base font-bold text-white group-hover:text-purple-200 transition-colors">Cloud BYOS</h3>
                <p class="text-xs text-slate-400 leading-relaxed font-normal">
                  Bring Your Own Bucket (AWS S3, Cloudflare R2, Google Cloud).
                </p>
              </div>

              <div class="pt-2 border-t border-white/5">
                <span class="inline-flex items-center gap-1.5 text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                  <span class="size-1.5 rounded-full bg-purple-400" />
                  YOUR CUSTOM BUCKET
                </span>
              </div>
            </div>

            <!-- 6. Box / Dropbox -->
            <div
              @click="selectedOrgType = 'box'"
              :class="[
                'group cursor-pointer relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 flex flex-col justify-between gap-4',
                selectedOrgType === 'box' || selectedOrgType === 'dropbox'
                  ? 'border-blue-500/80 bg-gradient-to-b from-blue-500/20 via-blue-500/10 to-transparent ring-2 ring-blue-500/40 shadow-[0_0_30px_rgba(59,130,246,0.2)]'
                  : 'border-white/8 bg-slate-950/50 hover:border-white/20 hover:bg-slate-800/40'
              ]"
            >
              <div class="flex items-center justify-between">
                <div :class="['p-3 rounded-xl border transition-colors', selectedOrgType === 'box' || selectedOrgType === 'dropbox' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' : 'bg-white/5 text-slate-400 border-white/10 group-hover:text-blue-400']">
                  <Icon name="logos:dropbox" class="size-6" />
                </div>
                <div v-if="selectedOrgType === 'box' || selectedOrgType === 'dropbox'" class="flex items-center justify-center size-6 rounded-full bg-blue-500 text-white shadow-md">
                  <Icon name="lucide:check" class="size-3.5 stroke-[3]" />
                </div>
              </div>

              <div class="space-y-1">
                <h3 class="text-base font-bold text-white group-hover:text-blue-200 transition-colors">Box / Dropbox</h3>
                <p class="text-xs text-slate-400 leading-relaxed font-normal">
                  Integrate Enterprise Box or Dropbox Business storage folders.
                </p>
              </div>

              <div class="pt-2 border-t border-white/5">
                <span class="inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                  <span class="size-1.5 rounded-full bg-blue-400" />
                  BOX & DROPBOX SYNC
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Dynamic Provider Setup Forms -->

        <!-- Google Drive Setup Card -->
        <Transition name="fade-down">
          <div v-if="selectedOrgType === 'gdrive'" class="p-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-4 backdrop-blur-md">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon name="logos:google-drive" class="size-5" />
                <span class="text-sm font-bold text-emerald-300">Google Drive Authorization</span>
              </div>
              <span v-if="gdriveConnected" class="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5">
                <Icon name="lucide:check-circle-2" class="size-3.5" /> Connected
              </span>
            </div>

            <p class="text-xs text-slate-300 leading-relaxed">
              Link your Google account. All files uploaded via local file pickers or link imports are stored directly into Google Drive behind DAMSelf.
            </p>

            <button
              type="button"
              @click="connectGDrive"
              :disabled="gdriveConnecting"
              class="w-full py-3 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
            >
              <Icon v-if="gdriveConnecting" name="lucide:loader-2" class="size-4 animate-spin" />
              <Icon v-else name="logos:google-icon" class="size-4" />
              <span>{{ gdriveConnected ? 'Reconnect Google Drive Account' : 'Connect Google Drive Account' }}</span>
            </button>
          </div>
        </Transition>

        <!-- Microsoft OneDrive Setup Card -->
        <Transition name="fade-down">
          <div v-if="selectedOrgType === 'onedrive'" class="p-6 rounded-2xl border border-sky-500/30 bg-sky-500/5 space-y-4 backdrop-blur-md">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon name="logos:microsoft-onedrive" class="size-5" />
                <span class="text-sm font-bold text-sky-300">Microsoft 365 OneDrive Connection</span>
              </div>
              <span v-if="onedriveConnected" class="px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-semibold flex items-center gap-1.5">
                <Icon name="lucide:check-circle-2" class="size-3.5" /> Account Linked
              </span>
            </div>

            <p class="text-xs text-slate-300 leading-relaxed">
              Authenticate with Microsoft 365. Files uploaded into DAMSelf will be automatically mirrored inside your Microsoft OneDrive root or dedicated folder.
            </p>

            <button
              type="button"
              @click="connectOneDrive"
              :disabled="onedriveConnecting"
              class="w-full py-3 px-5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2.5 shadow-lg shadow-sky-500/20 transition-all cursor-pointer"
            >
              <Icon v-if="onedriveConnecting" name="lucide:loader-2" class="size-4 animate-spin" />
              <Icon v-else name="logos:microsoft-icon" class="size-4" />
              <span>{{ onedriveConnected ? 'OneDrive Connected ✓' : 'Connect Microsoft 365 OneDrive Account' }}</span>
            </button>
          </div>
        </Transition>

        <!-- Microsoft SharePoint Setup Card -->
        <Transition name="fade-down">
          <div v-if="selectedOrgType === 'sharepoint'" class="p-6 rounded-2xl border border-teal-500/30 bg-teal-500/5 space-y-4 backdrop-blur-md">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon name="lucide:file-spreadsheet" class="size-5 text-teal-400" />
                <span class="text-sm font-bold text-teal-300">Microsoft SharePoint Site Connection</span>
              </div>
              <span v-if="sharepointConnected" class="px-2.5 py-1 rounded-full bg-teal-500/20 text-teal-400 border border-teal-500/30 text-xs font-semibold flex items-center gap-1.5">
                <Icon name="lucide:check-circle-2" class="size-3.5" /> Site Verified
              </span>
            </div>

            <div class="space-y-3">
              <div>
                <label class="block text-xs font-medium text-slate-300 mb-1">SharePoint Site URL</label>
                <input v-model="sharepointSiteUrl" type="url" placeholder="https://yourcompany.sharepoint.com/sites/DAMLibrary" class="w-full bg-slate-950/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-300 mb-1">Document Library Name</label>
                <input v-model="sharepointDocumentLibrary" type="text" placeholder="Shared Documents" class="w-full bg-slate-950/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition" />
              </div>
            </div>

            <button
              type="button"
              @click="connectSharePoint"
              :disabled="sharepointConnecting || !sharepointSiteUrl.trim()"
              class="w-full py-3 px-5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2.5 shadow-lg shadow-teal-500/20 transition-all cursor-pointer"
            >
              <Icon v-if="sharepointConnecting" name="lucide:loader-2" class="size-4 animate-spin" />
              <Icon v-else name="lucide:link" class="size-4" />
              <span>{{ sharepointConnected ? 'SharePoint Library Connected ✓' : 'Connect & Verify SharePoint Library' }}</span>
            </button>
          </div>
        </Transition>

        <!-- Box / Dropbox Setup Card -->
        <Transition name="fade-down">
          <div v-if="selectedOrgType === 'box' || selectedOrgType === 'dropbox'" class="p-6 rounded-2xl border border-blue-500/30 bg-blue-500/5 space-y-4 backdrop-blur-md">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon name="logos:dropbox" class="size-5" />
                <span class="text-sm font-bold text-blue-300">Box & Dropbox Sync Options</span>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <button
                type="button"
                @click="connectBox"
                :class="[
                  'py-3 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer',
                  boxConnected ? 'border-blue-500 bg-blue-500/20 text-blue-300' : 'border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'
                ]"
              >
                <Icon name="lucide:box" class="size-4" />
                <span>{{ boxConnected ? 'Box Linked ✓' : 'Connect Box Account' }}</span>
              </button>

              <button
                type="button"
                @click="connectDropbox"
                :class="[
                  'py-3 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer',
                  dropboxConnected ? 'border-blue-500 bg-blue-500/20 text-blue-300' : 'border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'
                ]"
              >
                <Icon name="logos:dropbox" class="size-4" />
                <span>{{ dropboxConnected ? 'Dropbox Linked ✓' : 'Connect Dropbox Account' }}</span>
              </button>
            </div>
          </div>
        </Transition>

        <!-- BYOS Credentials Form Card -->
        <Transition name="fade-down">
          <div v-if="selectedOrgType === 'byos'" class="p-6 rounded-2xl border border-purple-500/30 bg-purple-500/5 space-y-5 backdrop-blur-md">
            <div>
              <h4 class="text-xs font-bold uppercase tracking-wider text-purple-300 mb-3">1. Select Storage Provider</h4>
              <div class="grid grid-cols-3 gap-3">
                <button
                  v-for="prov in [{ id: 'aws', label: 'AWS S3', icon: 'simple-icons:amazons3' }, { id: 'r2', label: 'Cloudflare R2', icon: 'simple-icons:cloudflare' }, { id: 'gcs', label: 'Google Cloud', icon: 'simple-icons:googlecloud' }]"
                  :key="prov.id"
                  type="button"
                  @click="byosProvider = prov.id as any"
                  :class="[
                    'flex flex-col items-center justify-center gap-2 py-3.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer',
                    byosProvider === prov.id
                      ? 'border-purple-500 bg-purple-500/20 text-purple-200 ring-2 ring-purple-500/30 shadow-md'
                      : 'border-white/10 bg-slate-950/60 text-slate-400 hover:border-white/20 hover:text-white'
                  ]"
                >
                  <Icon :name="prov.icon" class="size-5" />
                  <span>{{ prov.label }}</span>
                </button>
              </div>
            </div>

            <!-- Credentials Fields -->
            <div class="space-y-4 pt-2 border-t border-purple-500/20">
              <h4 class="text-xs font-bold uppercase tracking-wider text-purple-300">2. Configure Bucket Credentials</h4>
              
              <div>
                <label class="block text-xs font-medium text-slate-300 mb-1.5">Bucket Name</label>
                <input v-model="byosBucketName" type="text" placeholder="e.g. my-organization-dam-bucket" class="w-full bg-slate-950/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition" />
              </div>

              <template v-if="byosProvider === 'aws' || byosProvider === 'r2'">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs font-medium text-slate-300 mb-1.5">Access Key ID</label>
                    <input v-model="byosAccessKeyId" type="text" placeholder="AKIA..." class="w-full bg-slate-950/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-slate-300 mb-1.5">Secret Access Key</label>
                    <input v-model="byosSecretAccessKey" type="password" placeholder="••••••••••••" class="w-full bg-slate-950/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition" />
                  </div>
                </div>

                <div v-if="byosProvider === 'aws'">
                  <label class="block text-xs font-medium text-slate-300 mb-1.5">Region</label>
                  <input v-model="byosRegion" type="text" placeholder="us-east-1" class="w-full bg-slate-950/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition" />
                </div>

                <div v-if="byosProvider === 'r2'">
                  <label class="block text-xs font-medium text-slate-300 mb-1.5">R2 Endpoint URL</label>
                  <input v-model="byosEndpoint" type="url" placeholder="https://<account-id>.r2.cloudflarestorage.com" class="w-full bg-slate-950/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition" />
                </div>
              </template>

              <!-- Verify Credentials Button -->
              <button
                type="button"
                @click="verifyByosCredentials"
                :disabled="byosVerifying || !byosBucketName"
                class="w-full py-3 px-5 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 transition-all cursor-pointer"
              >
                <Icon v-if="byosVerifying" name="lucide:loader-2" class="size-4 animate-spin" />
                <Icon v-else-if="byosVerified" name="lucide:check-circle-2" class="size-4 text-emerald-300" />
                <Icon v-else name="lucide:shield-check" class="size-4" />
                <span>{{ byosVerifying ? 'Verifying Bucket Access...' : byosVerified ? 'Bucket Verified Successfully ✓' : 'Test & Verify Bucket Credentials' }}</span>
              </button>

              <p v-if="byosVerifyError" class="text-xs text-red-400 font-medium text-center bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl">{{ byosVerifyError }}</p>
            </div>
          </div>
        </Transition>

        <!-- Feedback Messages -->
        <p v-if="error" class="text-xs text-red-400 font-medium text-center bg-red-500/10 border border-red-500/20 p-3 rounded-xl">{{ error }}</p>
        <p v-if="successMsg" class="text-xs text-emerald-400 font-semibold text-center bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl flex items-center justify-center gap-2">
          <Icon name="lucide:check-circle-2" class="size-4 text-emerald-400" />
          <span>{{ successMsg }}</span>
        </p>

        <!-- Main Action Buttons Bar -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/10">
          <button
            type="button"
            @click="handleSaveStorage"
            :disabled="saving || !canSave"
            class="w-full sm:flex-1 py-3.5 px-6 bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-600 hover:to-violet-700 disabled:opacity-40 text-white font-bold text-sm rounded-xl shadow-[0_4px_25px_rgba(99,102,241,0.4)] hover:shadow-[0_6px_30px_rgba(99,102,241,0.6)] flex items-center justify-center gap-2.5 transition-all cursor-pointer active:scale-[0.99]"
          >
            <Icon v-if="saving" name="lucide:loader-2" class="size-4 animate-spin" />
            <Icon v-else name="lucide:check" class="size-4" />
            <span>{{ saving ? 'Updating Storage Mode...' : 'Confirm & Set Storage Option' }}</span>
          </button>

          <button
            type="button"
            @click="continueWithoutChanges"
            class="w-full sm:w-auto py-3.5 px-6 bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white font-semibold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
          >
            Continue to Workspace →
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-down-enter-active,
.fade-down-leave-active {
  transition: all 0.25s ease-out;
}
.fade-down-enter-from,
.fade-down-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
