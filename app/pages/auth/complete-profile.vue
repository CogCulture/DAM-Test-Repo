<script setup lang="ts">
definePageMeta({ layout: "guest" });

import { ref, onMounted, watch } from "vue";

const { user, fetch: fetchSession } = useUserSession();
const router = useRouter();
const loading = ref(false);
const error = ref("");

const orgAction = ref<"join" | "create">("join");
const newOrgName = ref("");
const orgType = ref<"s3" | "gdrive">("s3");
const selectedOrgId = ref("");
const selectedRole = ref("");
const selectedDept = ref("");

// Lists
const organizationsList = ref<{ id: string; name: string }[]>([]);
const departmentsList = ref<{ id: string; name: string; parentId: string | null }[]>([]);

// Fetch organizations on mount
onMounted(async () => {
  try {
    organizationsList.value = await $fetch("/api/organizations");
  } catch (e) {
    console.error("Failed to load organizations:", e);
  }
});

// Watch selected organization to load its departments and roles
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

// Format departments list with child indicator
const getDeptOptions = computed(() => {
  return departmentsList.value.map((d) => ({
    label: d.parentId ? `  ↳ ${d.name}` : d.name,
    value: d.id,
  }));
});

const handleSubmit = async () => {
  if (orgAction.value === "create") {
    if (!newOrgName.value.trim()) {
      error.value = "Please enter an organization name.";
      return;
    }
  } else {
    if (!selectedOrgId.value) {
      error.value = "Please select an organization.";
      return;
    }
    if (!selectedRole.value || !selectedDept.value) {
      error.value = "Please select both a role and a department.";
      return;
    }
  }

  loading.value = true;
  error.value = "";
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
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 px-4">
    <div class="w-full max-w-md my-8">
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
              <div class="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  @click="orgType = 's3'"
                  :class="orgType === 's3'
                    ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                    : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600'"
                  class="flex flex-col items-center gap-2 p-4 rounded-xl border text-sm font-medium transition-all"
                >
                  <Icon name="lucide:database" class="w-6 h-6" />
                  <span>Platform Storage</span>
                  <span class="text-xs font-normal opacity-70">S3-backed storage</span>
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
                  <span class="text-xs font-normal opacity-70">Your own Drive folder</span>
                </button>
              </div>
              <p v-if="orgType === 'gdrive'" class="text-xs text-blue-400 mt-2 flex items-center gap-1.5">
                <Icon name="lucide:info" class="w-3.5 h-3.5 flex-shrink-0" />
                After approval, you'll connect your Google Drive account and select a folder.
              </p>
            </div>

            <div class="p-3 bg-primary-950/20 border border-primary-500/20 rounded-lg text-xs text-primary-400">
              <Icon name="lucide:clock" class="inline mr-1 size-4" />
              Your request will be reviewed by a Super Admin. You'll be notified once approved.
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
            @click="handleSubmit"
          >
            {{ orgAction === "create" ? "Create & Set Up" : "Submit for Approval" }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
