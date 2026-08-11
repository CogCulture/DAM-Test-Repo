<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRole } from "~/composables/useRole";
import { useToast } from "~/composables/useToast";

const { isAdmin } = useRole();
if (!isAdmin.value) {
  navigateTo("/");
}

const toast = useToast();
const loading = ref(true);
const departments = ref<any[]>([]);
const deptHeads = ref<Record<string, any>>({});
const invites = ref<any[]>([]);

// Modal state
const isInviteModalOpen = ref(false);
const selectedDeptForInvite = ref<any>(null);
const inviteEmail = ref("");
const sendingInvite = ref(false);
const generatedInviteUrl = ref("");

const fetchDepartments = async () => {
  loading.value = true;
  try {
    const data: any = await $fetch("/api/organizations/settings");
    departments.value = data.departments || [];
    
    // Fetch users to map department heads
    const usersList: any = await $fetch("/api/admin/users");
    const heads: Record<string, any> = {};
    for (const u of (usersList.data || usersList || [])) {
      if (u.role === "dept_head" && u.departmentId) {
        heads[u.departmentId] = u;
      }
    }
    deptHeads.value = heads;

    // Fetch invites
    await fetchInvites();
  } catch (e) {
    toast.add({ title: "Failed to load departments data", color: "error" });
  } finally {
    loading.value = false;
  }
};

const fetchInvites = async () => {
  try {
    const data: any = await $fetch("/api/admin/invites");
    invites.value = Array.isArray(data) ? data : (data?.invites || []);
  } catch (e) {
    console.error("Failed to load invites:", e);
    invites.value = [];
  }
};

const openInviteModal = (dept: any) => {
  selectedDeptForInvite.value = dept;
  inviteEmail.value = "";
  generatedInviteUrl.value = "";
  isInviteModalOpen.value = true;
};

const sendInvite = async () => {
  if (!inviteEmail.value.trim() || !selectedDeptForInvite.value) return;
  sendingInvite.value = true;
  try {
    const res: any = await $fetch(`/api/admin/departments/${selectedDeptForInvite.value.id}/invite`, {
      method: "POST",
      body: { email: inviteEmail.value.trim() }
    });
    generatedInviteUrl.value = res.inviteUrl;
    toast.add({ title: "Invitation link generated successfully", color: "success" });
    await fetchInvites();
  } catch (e: any) {
    toast.add({ title: e?.data?.message || "Failed to generate invite.", color: "error" });
  } finally {
    sendingInvite.value = false;
  }
};

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.add({ title: "Link copied to clipboard!", color: "success" });
};

onMounted(fetchDepartments);
</script>

<template>
  <AppMain title="Department Management">
    <div v-if="loading" class="flex items-center justify-center min-h-[50vh]">
      <Icon name="lucide:loader" class="animate-spin size-8 text-neutral-400" />
    </div>

    <div v-else class="space-y-8 max-w-5xl">
      <!-- Departments Listing -->
      <section class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 space-y-6">
        <div>
          <h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
            <Icon name="lucide:network" class="text-primary size-5" />
            Departments & Heads
          </h2>
          <p class="text-sm text-neutral-500 mt-1">
            Invite and manage department heads to govern each department's folder domain.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div 
            v-for="dept in departments" 
            :key="dept.id"
            class="bg-neutral-50 dark:bg-neutral-950 p-5 border border-neutral-200 dark:border-neutral-800 rounded-xl flex flex-col justify-between space-y-4"
          >
            <div class="flex justify-between items-start">
              <div>
                <h3 class="text-base font-bold text-neutral-800 dark:text-neutral-200">{{ dept.name }}</h3>
                <span v-if="dept.parentId" class="text-xs text-neutral-500 bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded-full mt-1 inline-block">
                  Sub-department
                </span>
              </div>
              
              <div v-if="deptHeads[dept.id]" class="flex items-center space-x-2">
                <img v-if="deptHeads[dept.id].avatar" :src="deptHeads[dept.id].avatar" class="w-8 h-8 rounded-full border border-neutral-700" />
                <div class="text-right">
                  <div class="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{{ deptHeads[dept.id].name }}</div>
                  <div class="text-[10px] text-neutral-500">{{ deptHeads[dept.id].email }}</div>
                </div>
              </div>
              <span v-else class="text-xs font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-full">
                No Head Assigned
              </span>
            </div>

            <div class="flex justify-between items-center pt-2 border-t border-neutral-200 dark:border-neutral-800/80">
              <span class="text-xs text-neutral-500">
                Type: GDrive Department Folder
              </span>
              
              <UButton 
                v-if="!deptHeads[dept.id]"
                color="primary" 
                variant="solid" 
                size="sm"
                icon="lucide:mail-plus"
                @click="openInviteModal(dept)"
              >
                Invite Head
              </UButton>
              <span v-else class="text-xs font-semibold text-green-500 flex items-center gap-1">
                <Icon name="lucide:check-circle" class="size-4" /> Active Head
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Pending Invitations -->
      <section v-if="invites && invites.length > 0" class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 space-y-4">
        <h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
          <Icon name="lucide:clock" class="text-amber-500 size-5" />
          Pending Invitations
        </h2>

        <div class="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
          <table class="w-full text-sm text-left">
            <thead class="bg-neutral-50 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 uppercase text-xs font-semibold border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th class="px-4 py-3">Email</th>
                <th class="px-4 py-3">Department</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-200 dark:divide-neutral-800">
              <tr v-for="invite in invites" :key="invite.id" class="hover:bg-neutral-50/50 dark:hover:bg-neutral-950/50">
                <td class="px-4 py-3 font-medium text-neutral-800 dark:text-neutral-200">{{ invite.email }}</td>
                <td class="px-4 py-3 text-neutral-500">
                  {{ departments.find(d => d.id === invite.departmentId)?.name || 'Unknown' }}
                </td>
                <td class="px-4 py-3">
                  <span class="text-xs px-2.5 py-0.5 rounded-full" :class="invite.status === 'pending' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'">
                    {{ invite.status }}
                  </span>
                </td>
                <td class="px-4 py-3 text-right">
                  <UButton
                    v-if="invite.status === 'pending'"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="lucide:copy"
                    @click="copyToClipboard(invite.inviteUrl)"
                  >
                    Copy Link
                  </UButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- Invite Head Modal -->
    <UModal v-model="isInviteModalOpen">
      <div class="p-6 space-y-4 text-white">
        <div class="flex justify-between items-center">
          <h3 class="text-lg font-bold">Invite Department Head</h3>
          <UButton color="neutral" variant="ghost" icon="lucide:x" @click="isInviteModalOpen = false" />
        </div>
        <p class="text-sm text-neutral-400">
          Invite a manager to govern the <strong>{{ selectedDeptForInvite?.name }}</strong> department.
        </p>

        <div v-if="!generatedInviteUrl" class="space-y-4">
          <UFormField label="Invitee's Email Address">
            <UInput v-model="inviteEmail" placeholder="manager@company.com" class="w-full bg-slate-800" />
          </UFormField>
          
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="isInviteModalOpen = false">Cancel</UButton>
            <UButton color="primary" variant="solid" :loading="sendingInvite" @click="sendInvite">
              Generate Invite Link
            </UButton>
          </div>
        </div>

        <div v-else class="space-y-4">
          <div class="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl space-y-2">
            <p class="text-sm font-semibold text-indigo-300">Invite Link Generated (Option B)</p>
            <p class="text-xs text-indigo-200/80">Copy this link and share it with the department head manually:</p>
            
            <div class="flex items-center gap-2 mt-2">
              <input 
                readonly 
                :value="generatedInviteUrl" 
                class="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-indigo-300"
              />
              <UButton 
                color="primary" 
                variant="solid" 
                size="sm"
                icon="lucide:copy" 
                @click="copyToClipboard(generatedInviteUrl)"
              />
            </div>
          </div>

          <div class="flex justify-end">
            <UButton color="primary" variant="solid" @click="isInviteModalOpen = false">Done</UButton>
          </div>
        </div>
      </div>
    </UModal>
  </AppMain>
</template>
