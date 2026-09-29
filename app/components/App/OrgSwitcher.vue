<script setup lang="ts">
import { ref, computed } from "vue";
import { useBucket } from "~/composables/useBucket";
import { useToast } from "~/composables/useToast";

const toast = useToast();
const { bucket } = useBucket();
const route = useRoute();
const bucketName = computed(() => (route.params.bucket as string) || bucket.value?.name || "org");

const isOpen = ref(false);
const searchQuery = ref("");
const switchingId = ref<string | null>(null);

// Modal state for creating a new client organization
const isCreateModalOpen = ref(false);
const creatingOrg = ref(false);
const newOrgForm = ref({
  name: "",
  orgType: "s3" as "s3" | "gdrive"
});

// Fetch user's organizations
const { data: orgData, refresh: refreshOrgs, status } = await useFetch<{
  currentOrganizationId: string;
  organizations: Array<{
    id: string;
    name: string;
    orgType: "s3" | "gdrive";
    status: string;
    role: string;
    isCurrent: boolean;
  }>;
}>("/api/organizations/my-orgs", {
  lazy: true
});

const currentOrg = computed(() => {
  return (
    orgData.value?.organizations?.find((o) => o.isCurrent) ||
    orgData.value?.organizations?.[0] ||
    null
  );
});

const filteredOrgs = computed(() => {
  const list = orgData.value?.organizations || [];
  if (!searchQuery.value.trim()) return list;
  const q = searchQuery.value.toLowerCase().trim();
  return list.filter((o) => o.name.toLowerCase().includes(q));
});

const selectOrg = async (orgId: string) => {
  if (switchingId.value || orgId === currentOrg.value?.id) {
    isOpen.value = false;
    return;
  }
  switchingId.value = orgId;
  try {
    const res: any = await $fetch("/api/organizations/switch", {
      method: "POST",
      body: { organizationId: orgId },
    });
    toast.add({
      title: "Workspace Switched",
      description: `Now viewing ${res.organizationName || "client"} workspace.`,
      color: "success",
    });
    isOpen.value = false;
    // Hard navigate to workspace root to completely reset cache and folder context
    window.location.href = `/${bucketName.value}`;
  } catch (err: any) {
    toast.add({
      title: "Could not switch client",
      description: err?.data?.message || err?.message || "Please try again.",
      color: "error",
    });
    switchingId.value = null;
  }
};

const handleCreateOrg = async () => {
  if (!newOrgForm.value.name.trim() || creatingOrg.value) return;
  creatingOrg.value = true;
  try {
    const res: any = await $fetch("/api/organizations/create", {
      method: "POST",
      body: {
        name: newOrgForm.value.name.trim(),
        orgType: newOrgForm.value.orgType,
      },
    });
    toast.add({
      title: "Client Organization Created",
      description: `Welcome to ${res.name}! Your clean workspace is ready.`,
      color: "success",
    });
    isCreateModalOpen.value = false;
    newOrgForm.value = { name: "", orgType: "s3" };
    // Hard navigate to new clean workspace
    window.location.href = `/${bucketName.value}`;
  } catch (err: any) {
    toast.add({
      title: "Failed to create client",
      description: err?.data?.message || err?.message || "Please try again.",
      color: "error",
    });
  } finally {
    creatingOrg.value = false;
  }
};
</script>

<template>
  <div class="relative shrink-0">
    <!-- Trigger Button -->
    <button
      type="button"
      class="group flex h-10 items-center gap-2 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] px-3 text-xs font-semibold text-[var(--dam-ink)] transition-all hover:border-primary-500/50 hover:bg-[var(--dam-panel)] shadow-xs cursor-pointer max-w-[220px] sm:max-w-[260px]"
      :title="`Current Client Workspace: ${currentOrg?.name || 'Organization'}`"
      @click="isOpen = !isOpen"
    >
      <div class="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-500 group-hover:bg-primary-500 group-hover:text-white transition-colors">
        <Icon name="lucide:building-2" class="size-3.5" />
      </div>

      <div class="flex flex-col text-left min-w-0 flex-1">
        <span class="text-[9px] font-extrabold uppercase tracking-widest text-[var(--dam-muted)] leading-tight">
          Client Workspace
        </span>
        <span class="truncate text-xs font-bold text-[var(--dam-ink)] leading-tight">
          {{ currentOrg?.name || 'Select Client' }}
        </span>
      </div>

      <Icon
        name="lucide:chevrons-up-down"
        class="size-3.5 shrink-0 text-[var(--dam-muted)] transition-transform duration-200"
        :class="{ 'rotate-180 text-primary-500': isOpen }"
      />
    </button>

    <!-- Backdrop -->
    <div
      v-if="isOpen"
      class="fixed inset-0 z-40"
      @click="isOpen = false"
    />

    <!-- Dropdown Menu -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="absolute left-0 top-12 z-50 w-72 sm:w-80 rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] p-2.5 shadow-2xl backdrop-blur-md space-y-2"
        @click.stop
      >
        <!-- Header & Search -->
        <div class="space-y-2 border-b border-[var(--dam-line)] pb-2 px-1">
          <div class="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-[var(--dam-muted)]">
            <span>Client Workspaces</span>
            <span class="text-primary-500">{{ orgData?.organizations?.length || 0 }} total</span>
          </div>

          <div class="relative">
            <Icon name="lucide:search" class="absolute left-2.5 top-2.5 size-3.5 text-[var(--dam-muted)]" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search clients..."
              class="w-full rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] pl-8 pr-3 py-1.5 text-xs text-[var(--dam-ink)] placeholder-[var(--dam-muted)] outline-none focus:border-primary-500 transition-all"
            />
          </div>
        </div>

        <!-- Organizations List -->
        <div class="max-h-56 overflow-y-auto space-y-1 pr-0.5">
          <div v-if="filteredOrgs.length === 0" class="py-6 text-center text-xs text-[var(--dam-muted)]">
            No matching client organizations.
          </div>

          <button
            v-for="org in filteredOrgs"
            :key="org.id"
            type="button"
            class="flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer group"
            :class="org.isCurrent
              ? 'bg-primary-500/10 text-primary-500 font-bold border border-primary-500/30'
              : 'hover:bg-[var(--dam-panel-raised)] text-[var(--dam-ink)] border border-transparent'"
            :disabled="switchingId === org.id"
            @click="selectOrg(org.id)"
          >
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
              <div
                class="flex size-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold"
                :class="org.isCurrent
                  ? 'border-primary-500/40 bg-primary-500 text-white'
                  : 'border-[var(--dam-line)] bg-[var(--dam-panel-raised)] text-[var(--dam-muted)] group-hover:text-primary-500'"
              >
                {{ org.name.charAt(0).toUpperCase() }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold text-[var(--dam-ink)] leading-tight">{{ org.name }}</p>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="text-[9px] uppercase tracking-wider text-[var(--dam-muted)]">{{ org.orgType === 'gdrive' ? 'Google Drive' : 'Platform S3' }}</span>
                  <span class="size-1 rounded-full bg-[var(--dam-muted)]/50"></span>
                  <span class="text-[9px] text-[var(--dam-muted)] capitalize">{{ org.role }}</span>
                </div>
              </div>
            </div>

            <div v-if="switchingId === org.id" class="size-4 shrink-0 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            <Icon
              v-else-if="org.isCurrent"
              name="lucide:check-circle"
              class="size-4 shrink-0 text-primary-500"
            />
          </button>
        </div>

        <!-- Add New Client Organization Button -->
        <div class="border-t border-[var(--dam-line)] pt-2 px-1">
          <button
            type="button"
            class="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 hover:bg-primary-600 px-3 py-2 text-xs font-bold text-white transition-all shadow-xs cursor-pointer"
            @click="isCreateModalOpen = true; isOpen = false"
          >
            <Icon name="lucide:plus" class="size-4" />
            <span>Add New Client Organization</span>
          </button>
        </div>
      </div>
    </Transition>

    <!-- Create Organization Modal -->
    <UModal v-model:open="isCreateModalOpen">
      <template #content>
        <div class="p-6 space-y-5 bg-[var(--dam-panel-solid)] text-[var(--dam-ink)] rounded-2xl border border-[var(--dam-line)] shadow-2xl max-w-md mx-auto">
          <div class="flex items-center justify-between border-b border-[var(--dam-line)] pb-4">
            <div class="flex items-center gap-2.5">
              <div class="flex size-9 items-center justify-center rounded-xl bg-primary-500/10 text-primary-500 border border-primary-500/20">
                <Icon name="lucide:building-2" class="size-5" />
              </div>
              <div>
                <h3 class="text-base font-bold text-[var(--dam-ink)]">New Client Organization</h3>
                <p class="text-xs text-[var(--dam-muted)]">Create a completely isolated workspace for a client</p>
              </div>
            </div>
            <button
              type="button"
              class="text-[var(--dam-muted)] hover:text-[var(--dam-ink)] transition"
              @click="isCreateModalOpen = false"
            >
              <Icon name="lucide:x" class="size-5" />
            </button>
          </div>

          <form @submit.prevent="handleCreateOrg" class="space-y-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold uppercase tracking-wider text-[var(--dam-muted)]">
                Client / Organization Name
              </label>
              <input
                v-model="newOrgForm.name"
                type="text"
                placeholder="e.g. Nike, Acme Corp, Red Bull"
                required
                autofocus
                class="w-full rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel)] px-3.5 py-2.5 text-sm font-medium text-[var(--dam-ink)] outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all shadow-xs"
              />
              <p class="text-[11px] text-[var(--dam-muted)]">
                This organization will have its own independent asset library and zero data leakage.
              </p>
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-semibold uppercase tracking-wider text-[var(--dam-muted)]">
                Storage Destination
              </label>
              <div class="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  class="flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-semibold transition cursor-pointer"
                  :class="newOrgForm.orgType === 's3'
                    ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400 ring-1 ring-primary-500'
                    : 'border-[var(--dam-line)] bg-[var(--dam-panel-raised)] text-[var(--dam-ink)] hover:border-primary-500/40'"
                  @click="newOrgForm.orgType = 's3'"
                >
                  <Icon name="lucide:hard-drive" class="size-4 text-primary-500 shrink-0" />
                  <div>
                    <p class="leading-tight">Platform S3</p>
                    <p class="text-[10px] text-[var(--dam-muted)] font-normal mt-0.5">High performance</p>
                  </div>
                </button>

                <button
                  type="button"
                  class="flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-semibold transition cursor-pointer"
                  :class="newOrgForm.orgType === 'gdrive'
                    ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400 ring-1 ring-primary-500'
                    : 'border-[var(--dam-line)] bg-[var(--dam-panel-raised)] text-[var(--dam-ink)] hover:border-primary-500/40'"
                  @click="newOrgForm.orgType = 'gdrive'"
                >
                  <Icon name="logos:google-drive" class="size-4 shrink-0" />
                  <div>
                    <p class="leading-tight">Google Drive</p>
                    <p class="text-[10px] text-[var(--dam-muted)] font-normal mt-0.5">Direct sync</p>
                  </div>
                </button>
              </div>
            </div>

            <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--dam-line)]">
              <button
                type="button"
                class="px-4 py-2 rounded-xl border border-[var(--dam-line)] text-xs font-semibold text-[var(--dam-ink)] hover:bg-[var(--dam-panel-raised)] transition"
                @click="isCreateModalOpen = false"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="creatingOrg || !newOrgForm.name.trim()"
                class="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary-500 hover:bg-primary-600 text-xs font-bold text-white transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <div v-if="creatingOrg" class="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <Icon v-else name="lucide:plus" class="size-4" />
                <span>{{ creatingOrg ? 'Creating...' : 'Create & Open Workspace' }}</span>
              </button>
            </div>
          </form>
        </div>
      </template>
    </UModal>
  </div>
</template>
