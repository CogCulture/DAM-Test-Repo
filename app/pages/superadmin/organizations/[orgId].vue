<script setup lang="ts">
import { useToast } from "~/composables/useToast";
definePageMeta({ layout: "superadmin", middleware: "superadmin" });

const route = useRoute();
const orgId = route.params.orgId as string;
const toast = useToast();

const { data: org, refresh, pending } = await useFetch<any>(`/api/superadmin/organizations/${orgId}`);

const actionLoading = ref(false);
const selectedNomenclatureDepartment = ref("");
const nomenclatureLoading = ref(false);
const nomenclatureSaving = ref(false);
const nomenclaturePolicy = ref<any>(null);

const nomenclatureDepartmentOptions = computed(() => (org.value?.departments || []).map((department: any) => ({
  label: department.name,
  value: department.id,
})));

const loadNomenclature = async () => {
  if (!selectedNomenclatureDepartment.value) {
    nomenclaturePolicy.value = null;
    return;
  }
  nomenclatureLoading.value = true;
  try {
    nomenclaturePolicy.value = await $fetch(
      `/api/superadmin/organizations/${orgId}/nomenclature/${selectedNomenclatureDepartment.value}`,
    );
  } catch (error: any) {
    toast.add({ title: "Nomenclature could not be loaded", description: error?.data?.message || error?.message, color: "error" });
  } finally {
    nomenclatureLoading.value = false;
  }
};

const saveNomenclature = async () => {
  if (!selectedNomenclatureDepartment.value || !nomenclaturePolicy.value) return;
  nomenclatureSaving.value = true;
  try {
    await $fetch(`/api/superadmin/organizations/${orgId}/nomenclature/${selectedNomenclatureDepartment.value}`, {
      method: "PUT",
      body: nomenclaturePolicy.value,
    });
    toast.add({ title: "Nomenclature saved", description: "New DAM uploads will use this department policy.", color: "success" });
    await loadNomenclature();
  } catch (error: any) {
    toast.add({ title: "Nomenclature could not be saved", description: error?.data?.message || error?.message, color: "error" });
  } finally {
    nomenclatureSaving.value = false;
  }
};

watch(() => org.value?.departments, (departments) => {
  if (!selectedNomenclatureDepartment.value && departments?.length) {
    selectedNomenclatureDepartment.value = departments[0].id;
  }
}, { immediate: true });
watch(selectedNomenclatureDepartment, loadNomenclature);

// Feature flags — kept as a separate reactive copy for editing
const featureKeys = ["nomenclature", "hierarchy", "userPermissions", "templateFolders"] as const;
type FeatureKey = typeof featureKeys[number];

const features = reactive({
  nomenclature: true,
  hierarchy: true,
  userPermissions: true,
  templateFolders: true,
});

// Sync when org data loads
watchEffect(() => {
  if (org.value?.features) {
    for (const k of featureKeys) {
      features[k] = org.value.features[k] ?? true;
    }
  }
});

const featureLabels: Record<FeatureKey, { label: string; icon: string; desc: string }> = {
  nomenclature: { label: "Nomenclature Rules", icon: "lucide:tag", desc: "Controls file naming conventions on upload" },
  hierarchy: { label: "Departments & Hierarchy", icon: "lucide:network", desc: "Department structure and sub-team management" },
  userPermissions: { label: "User Permissions", icon: "lucide:shield-check", desc: "Per-role permission customization by admin" },
  templateFolders: { label: "Template Folders", icon: "lucide:folder-tree", desc: "Pre-built starter folder structures" },
};

const saveFeatures = async () => {
  actionLoading.value = true;
  try {
    await $fetch(`/api/superadmin/organizations/${orgId}/features`, {
      method: "PUT",
      body: { ...features },
    });
    toast.add({ title: "Features updated", description: "Changes saved successfully", color: "success" });
    await refresh();
  } catch (e: any) {
    toast.add({ title: "Save failed", description: e?.data?.message ?? "Unknown error", color: "error" });
  } finally {
    actionLoading.value = false;
  }
};

const toggleStatus = async () => {
  const newStatus = org.value?.status === "active" ? "suspended" : "active";
  actionLoading.value = true;
  try {
    await $fetch(`/api/superadmin/organizations/${orgId}/status`, {
      method: "PUT",
      body: { status: newStatus },
    });
    toast.add({ title: `Organization ${newStatus}`, color: newStatus === "active" ? "success" : "warning" });
    await refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error", color: "error" });
  } finally {
    actionLoading.value = false;
  }
};

const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const formatDate = (d: any) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const roleColors: Record<string, string> = {
  admin: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  dept_head: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  team_lead: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  team_member: "text-slate-300 bg-slate-500/10 border-slate-500/20",
  intern: "text-amber-400 bg-amber-500/10 border-amber-500/20",
};

const approvalColors: Record<string, string> = {
  active: "text-emerald-400 bg-emerald-500/10",
  pending: "text-amber-400 bg-amber-500/10",
  pending_org: "text-orange-400 bg-orange-500/10",
  rejected: "text-red-400 bg-red-500/10",
  needs_profile: "text-slate-400 bg-slate-500/10",
};

const memberSearch = ref("");
const filteredMembers = computed(() => {
  if (!org.value?.members) return [];
  const q = memberSearch.value.toLowerCase();
  if (!q) return org.value.members;
  return org.value.members.filter((m: any) =>
    m.name?.toLowerCase().includes(q) ||
    m.email?.toLowerCase().includes(q) ||
    m.role?.toLowerCase().includes(q)
  );
});
</script>

<template>
  <div class="p-8 space-y-6">
    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center py-32">
      <Icon name="lucide:loader" class="animate-spin w-8 h-8 text-slate-500" />
    </div>

    <template v-else>
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-center gap-3">
          <NuxtLink to="/superadmin/organizations" class="text-slate-400 hover:text-white transition-colors mt-1">
            <Icon name="lucide:arrow-left" class="w-5 h-5" />
          </NuxtLink>
          <div>
            <div class="flex items-center gap-3 flex-wrap">
              <h1 class="text-2xl font-bold text-white">{{ org?.name }}</h1>
              <span
                :class="org?.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'"
                class="text-xs font-semibold px-2.5 py-1 rounded-full border"
              >{{ org?.status }}</span>
              <span
                :class="org?.orgType === 'gdrive' ? 'bg-blue-500/15 text-blue-400 border-blue-500/20' : 'bg-slate-500/15 text-slate-400 border-slate-500/20'"
                class="text-xs font-semibold px-2.5 py-1 rounded-full border"
              >{{ org?.orgType === 'gdrive' ? '🔗 Google Drive' : '💾 Platform Storage' }}</span>
            </div>
            <p class="text-slate-400 text-sm mt-1">
              {{ org?.memberCount ?? 0 }} member{{ org?.memberCount !== 1 ? 's' : '' }} ·
              {{ org?.fileCount ?? 0 }} files ·
              {{ formatBytes(org?.storageBytes ?? 0) }} ·
              Created {{ formatDate(org?.createdAt) }}
            </p>
          </div>
        </div>
        <button
          @click="toggleStatus"
          :disabled="actionLoading"
          :class="org?.status === 'active'
            ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
            : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'"
          class="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border transition-all disabled:opacity-50 flex-shrink-0"
        >
          <Icon :name="org?.status === 'active' ? 'lucide:pause-circle' : 'lucide:play-circle'" class="w-4 h-4" />
          {{ org?.status === "active" ? "Suspend Org" : "Reactivate Org" }}
        </button>
      </div>

      <!-- Stats row -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4">
          <p class="text-xs text-slate-500 mb-1">Total Members</p>
          <p class="text-2xl font-bold text-white">{{ org?.memberCount ?? 0 }}</p>
        </div>
        <div class="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4">
          <p class="text-xs text-slate-500 mb-1">Files Stored</p>
          <p class="text-2xl font-bold text-white">{{ org?.fileCount ?? 0 }}</p>
        </div>
        <div class="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4">
          <p class="text-xs text-slate-500 mb-1">Storage Used</p>
          <p class="text-2xl font-bold text-white">{{ formatBytes(org?.storageBytes ?? 0) }}</p>
        </div>
        <div class="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4">
          <p class="text-xs text-slate-500 mb-1">Departments</p>
          <p class="text-2xl font-bold text-white">{{ org?.departments?.length ?? 0 }}</p>
        </div>
      </div>

      <section v-if="org?.departments?.length" class="rounded-2xl border border-[#1e1e2e] bg-[#0d0d14] p-5">
        <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 class="flex items-center gap-2 font-semibold text-white"><Icon name="lucide:tags" class="size-4 text-violet-400" />DAM nomenclature</h2>
            <p class="mt-1 text-xs text-slate-500">Define and enforce file and folder names for each department.</p>
          </div>
          <div class="w-full sm:w-72">
            <label class="mb-1 block text-xs font-medium text-slate-400">Department</label>
            <USelect v-model="selectedNomenclatureDepartment" :items="nomenclatureDepartmentOptions" value-key="value" label-key="label" class="w-full" />
          </div>
        </div>
        <div v-if="nomenclatureLoading" class="flex justify-center py-10"><Icon name="lucide:loader" class="size-6 animate-spin text-violet-400" /></div>
        <NomenclatureEditor v-else-if="nomenclaturePolicy" :policy="nomenclaturePolicy" :saving="nomenclatureSaving" @save="saveNomenclature" />
      </section>

      <!-- Main grid -->
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <!-- LEFT: Feature Flags + GDrive Info -->
        <div class="xl:col-span-1 space-y-5">
          <!-- Feature Flags Card -->
          <div class="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-5">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h2 class="text-white font-semibold">Feature Access</h2>
                <p class="text-xs text-slate-500 mt-0.5">Toggle features for this organization</p>
              </div>
              <button
                @click="saveFeatures"
                :disabled="actionLoading"
                class="flex items-center gap-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
              >
                <Icon v-if="actionLoading" name="lucide:loader" class="w-3.5 h-3.5 animate-spin" />
                <Icon v-else name="lucide:save" class="w-3.5 h-3.5" />
                Save
              </button>
            </div>

            <div class="space-y-2">
              <div
                v-for="key in featureKeys"
                :key="key"
                class="flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all"
                :class="features[key]
                  ? 'bg-violet-500/5 border-violet-500/20 hover:border-violet-500/40'
                  : 'bg-[#0a0a10] border-[#1a1a25] hover:border-[#2a2a35]'"
                @click="features[key] = !features[key]"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <div :class="features[key] ? 'bg-violet-500/20 text-violet-400' : 'bg-slate-800 text-slate-500'"
                    class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all">
                    <Icon :name="featureLabels[key].icon" class="w-3.5 h-3.5" />
                  </div>
                  <div class="min-w-0">
                    <p :class="features[key] ? 'text-white' : 'text-slate-500'" class="text-sm font-medium transition-colors">
                      {{ featureLabels[key].label }}
                    </p>
                    <p class="text-xs text-slate-600 truncate">{{ featureLabels[key].desc }}</p>
                  </div>
                </div>
                <!-- Toggle pill -->
                <div
                  :class="features[key] ? 'bg-violet-500' : 'bg-[#252535]'"
                  class="relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ml-2"
                  @click.stop="features[key] = !features[key]"
                >
                  <span
                    :class="features[key] ? 'translate-x-5' : 'translate-x-1'"
                    class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- GDrive info if applicable -->
          <div v-if="org?.gdriveStatus" class="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-5">
            <h2 class="text-white font-semibold mb-3 flex items-center gap-2">
              <Icon name="lucide:hard-drive" class="text-blue-400 w-4 h-4" />
              Google Drive
            </h2>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-slate-500">Status</span>
                <span
                  :class="org.gdriveStatus === 'approved' ? 'text-emerald-400' : org.gdriveStatus === 'pending' ? 'text-amber-400' : 'text-red-400'"
                  class="font-medium capitalize"
                >{{ org.gdriveStatus }}</span>
              </div>
              <div v-if="org.gdriveFolderName" class="flex justify-between">
                <span class="text-slate-500">Folder</span>
                <span class="text-white font-medium truncate ml-2">{{ org.gdriveFolderName }}</span>
              </div>
            </div>
          </div>

          <!-- Departments -->
          <div v-if="org?.departments?.length" class="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-5">
            <h2 class="text-white font-semibold mb-3 flex items-center gap-2">
              <Icon name="lucide:network" class="text-slate-400 w-4 h-4" />
              Departments ({{ org.departments.length }})
            </h2>
            <div class="space-y-1.5 max-h-52 overflow-y-auto">
              <div
                v-for="dept in org.departments"
                :key="dept.id"
                class="flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg hover:bg-white/5"
              >
                <Icon :name="dept.parentId ? 'lucide:corner-down-right' : 'lucide:layers'" class="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <span class="text-slate-300">{{ dept.name }}</span>
                <span v-if="dept.parentId" class="text-xs text-slate-600 ml-auto">sub-dept</span>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Members -->
        <div class="xl:col-span-2 bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-5">
          <div class="flex items-center justify-between mb-4 gap-3">
            <h2 class="text-white font-semibold flex items-center gap-2">
              <Icon name="lucide:users" class="text-slate-400 w-4 h-4" />
              Members
              <span class="text-xs text-slate-500 font-normal">({{ org?.memberCount ?? 0 }})</span>
            </h2>
            <input
              v-model="memberSearch"
              placeholder="Search members..."
              class="bg-[#0a0a10] border border-[#1e1e2e] rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 w-40 transition-all"
            />
          </div>

          <!-- No members -->
          <div v-if="!filteredMembers.length" class="flex flex-col items-center justify-center py-16 text-slate-500">
            <Icon name="lucide:user-x" class="w-10 h-10 mb-3 opacity-30" />
            <p class="text-sm">{{ memberSearch ? 'No members match your search' : 'No members in this organization' }}</p>
          </div>

          <!-- Members table -->
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-[#1e1e2e]">
                  <th class="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3 pr-4">Member</th>
                  <th class="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3 pr-4">Role</th>
                  <th class="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3 pr-4">Department</th>
                  <th class="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3 pr-4">Status</th>
                  <th class="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">Joined</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#1a1a25]">
                <tr v-for="member in filteredMembers" :key="member.id" class="hover:bg-white/5 transition-colors group">
                  <!-- Member info -->
                  <td class="py-3 pr-4">
                    <div class="flex items-center gap-3">
                      <div class="relative flex-shrink-0">
                        <img
                          v-if="member.avatar"
                          :src="member.avatar"
                          :alt="member.name"
                          class="w-9 h-9 rounded-xl object-cover"
                        />
                        <div
                          v-else
                          class="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold"
                          :class="member.role === 'admin' ? 'bg-violet-500/20 text-violet-400' : 'bg-slate-700 text-slate-300'"
                        >
                          {{ member.name?.[0]?.toUpperCase() ?? '?' }}
                        </div>
                        <!-- Provider badge -->
                        <div v-if="member.provider" class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#0d0d14] flex items-center justify-center">
                          <Icon
                            :name="member.provider === 'google' ? 'simple-icons:google' : 'simple-icons:github'"
                            class="w-2.5 h-2.5"
                          />
                        </div>
                      </div>
                      <div class="min-w-0">
                        <p class="text-white font-medium truncate">{{ member.name }}</p>
                        <p class="text-xs text-slate-500 truncate">{{ member.email }}</p>
                      </div>
                    </div>
                  </td>

                  <!-- Role -->
                  <td class="py-3 pr-4">
                    <span
                      :class="roleColors[member.role] ?? 'text-slate-400 bg-slate-500/10 border-slate-500/20'"
                      class="text-xs font-semibold px-2.5 py-1 rounded-full border capitalize whitespace-nowrap"
                    >{{ member.role?.replace('_', ' ') }}</span>
                  </td>

                  <!-- Department -->
                  <td class="py-3 pr-4">
                    <span v-if="member.departmentName" class="text-xs text-slate-300">{{ member.departmentName }}</span>
                    <span v-else class="text-xs text-slate-600">—</span>
                  </td>

                  <!-- Approval Status -->
                  <td class="py-3 pr-4">
                    <span
                      :class="approvalColors[member.approvalStatus] ?? 'text-slate-400 bg-slate-500/10'"
                      class="text-xs font-medium px-2 py-0.5 rounded-full capitalize whitespace-nowrap"
                    >{{ member.approvalStatus?.replace('_', ' ') }}</span>
                  </td>

                  <!-- Joined date -->
                  <td class="py-3">
                    <span class="text-xs text-slate-500 whitespace-nowrap">{{ formatDate(member.createdAt) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
