<script setup lang="ts">
import { ref } from "vue";
import { useToast } from "~/composables/useToast";
import { useRole } from "~/composables/useRole";

const toast = useToast();
const { isAdmin, isDeptHead } = useRole();

// Only fetch for admins or dept heads
const canReview = computed(() => isAdmin.value || isDeptHead.value);

const { data: pendingUsers, refresh } = await useFetch<any[]>("/api/admin/users/pending", {
  immediate: canReview.value,
});

const processingId = ref<string | null>(null);

const handleAction = async (userReq: any, action: "approve" | "reject") => {
  processingId.value = userReq.id;
  try {
    await $fetch(`/api/admin/users/${userReq.id}`, {
      method: "POST",
      body: { action },
    });
    toast.add({
      title: action === "approve" ? "User Approved!" : "Request Rejected",
      description: action === "approve"
        ? `${userReq.name} can now access and collaborate in your organization.`
        : `${userReq.name}'s request was rejected.`,
      color: action === "approve" ? "success" : "warning",
    });
    await refresh();
  } catch (e: any) {
    toast.add({
      title: "Action failed",
      description: e?.data?.message || e?.message || "Please try again.",
      color: "error",
    });
  } finally {
    processingId.value = null;
  }
};

const formatDate = (d?: string) => {
  if (!d) return "Recently";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatRole = (role?: string) => {
  if (!role) return "Team Member";
  const map: Record<string, string> = {
    founder: "Founder / Admin",
    admin: "Admin",
    dept_head: "Department Head",
    team_lead: "Team Lead",
    team_member: "Team Member",
    intern: "Intern / Guest",
  };
  return map[role] || role;
};
</script>

<template>
  <div
    v-if="canReview && pendingUsers && pendingUsers.length > 0"
    class="mb-6 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent p-5 shadow-xl backdrop-blur-md transition-all duration-300"
  >
    <!-- Header Row -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4 mb-4">
      <div class="flex items-center gap-3">
        <div class="size-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
          <Icon name="lucide:user-plus" class="size-5 text-amber-400" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-base font-bold text-neutral-100">Pending Organization Join Requests</h3>
            <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              {{ pendingUsers.length }} {{ pendingUsers.length === 1 ? 'request' : 'requests' }}
            </span>
          </div>
          <p class="text-xs text-neutral-400 mt-0.5">
            The following users are requesting to join your organization and collaborate with your team.
          </p>
        </div>
      </div>
      <button
        @click="refresh"
        class="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium text-neutral-300 hover:text-white transition-colors"
      >
        <Icon name="lucide:refresh-cw" class="size-3.5" />
        Refresh
      </button>
    </div>

    <!-- User Request Cards / List -->
    <div class="space-y-3">
      <div
        v-for="req in pendingUsers"
        :key="req.id"
        class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-white/8 bg-black/40 p-4 transition-all hover:border-amber-500/30"
      >
        <!-- User Info -->
        <div class="flex items-center gap-3 min-w-0">
          <img
            v-if="req.avatar"
            :src="req.avatar"
            :alt="req.name"
            class="size-11 rounded-full object-cover shrink-0 border border-white/10"
          />
          <div
            v-else
            class="size-11 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0 font-bold text-white text-base shadow-md"
          >
            {{ req.name?.[0]?.toUpperCase() || 'U' }}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-semibold text-neutral-100 truncate">{{ req.name }}</span>
              <span class="text-[11px] px-2 py-0.5 rounded-md font-medium bg-white/8 text-neutral-300 border border-white/10">
                {{ formatRole(req.role) }}
              </span>
              <span v-if="req.departmentName" class="text-[11px] px-2 py-0.5 rounded-md font-medium bg-amber-500/15 text-amber-300 border border-amber-500/20">
                {{ req.departmentName }}
              </span>
            </div>
            <p class="text-xs text-neutral-400 mt-0.5 truncate">{{ req.email }} • <span class="text-neutral-500">Requested {{ formatDate(req.createdAt) }}</span></p>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            @click="handleAction(req, 'reject')"
            :disabled="processingId === req.id"
            class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-rose-500/30 hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
          >
            <Icon name="lucide:x-circle" class="size-4" />
            Reject
          </button>
          <button
            @click="handleAction(req, 'approve')"
            :disabled="processingId === req.id"
            class="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            <div v-if="processingId === req.id" class="size-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            <Icon v-else name="lucide:check-circle-2" class="size-4" />
            Approve Request
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
