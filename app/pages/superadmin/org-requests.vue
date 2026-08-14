<script setup lang="ts">
import { useToast } from "~/composables/useToast";
definePageMeta({ layout: "superadmin", middleware: "superadmin" });

const toast = useToast();
const { data: requests, refresh } = await useFetch<any[]>("/api/superadmin/org-requests");
const processing = ref<string | null>(null);
const rejectNote = ref("");
const rejectingId = ref<string | null>(null);

const handleAction = async (id: string, action: "approve" | "reject") => {
  processing.value = id;
  try {
    await $fetch(`/api/superadmin/org-requests/${id}/approve`, {
      method: "POST",
      body: { action, reviewNote: action === "reject" ? rejectNote.value : undefined },
    });
    toast.add({
      title: action === "approve" ? "Organization approved and created!" : "Request rejected",
      color: action === "approve" ? "success" : "warning",
    });
    rejectingId.value = null;
    rejectNote.value = "";
    refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error", color: "error" });
  } finally {
    processing.value = null;
  }
};

const formatDate = (d: any) => {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
</script>

<template>
  <div class="p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Organization Requests</h1>
        <p class="text-slate-400 text-sm mt-1">Approve or reject new organization creation requests</p>
      </div>
      <button @click="refresh" class="text-slate-400 hover:text-white px-3 py-2 rounded-xl hover:bg-white/5 transition-all">
        <Icon name="lucide:refresh-cw" class="w-4 h-4" />
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="!requests?.length" class="flex flex-col items-center justify-center py-24">
      <div class="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
        <Icon name="lucide:inbox" class="w-8 h-8 text-violet-400/50" />
      </div>
      <p class="text-white font-medium mb-1">No pending requests</p>
      <p class="text-slate-500 text-sm">All organization requests have been processed.</p>
    </div>

    <!-- Request cards -->
    <div v-else class="space-y-4">
      <div
        v-for="req in requests"
        :key="req.id"
        class="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6 hover:border-[#2e2e44] transition-all"
      >
        <div class="flex items-start justify-between gap-6">
          <div class="flex items-center gap-4 flex-1 min-w-0">
            <!-- Avatar -->
            <img v-if="req.userAvatar" :src="req.userAvatar" :alt="req.userName" class="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
            <div v-else class="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
              <span class="text-violet-400 font-bold text-lg">{{ req.userName?.[0]?.toUpperCase() }}</span>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <h3 class="text-white font-semibold text-base">{{ req.orgName }}</h3>
                <span
                  :class="req.orgType === 'gdrive'
                    ? 'bg-blue-500/15 text-blue-400 border-blue-500/20'
                    : 'bg-slate-500/15 text-slate-400 border-slate-500/20'"
                  class="text-xs font-medium px-2 py-0.5 rounded-full border"
                >{{ req.orgType === 'gdrive' ? 'Google Drive' : 'Platform Storage' }}</span>
              </div>
              <p class="text-sm text-slate-400">Requested by <span class="text-slate-200 font-medium">{{ req.userName }}</span> ({{ req.userEmail }})</p>
              <p class="text-xs text-slate-600 mt-1">{{ formatDate(req.createdAt) }}</p>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-3 flex-shrink-0">
            <button
              v-if="rejectingId !== req.id"
              @click="rejectingId = req.id"
              :disabled="processing === req.id"
              class="flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-red-400 border border-[#1e1e2e] hover:border-red-500/30 px-3 py-2 rounded-xl transition-all disabled:opacity-50"
            >
              <Icon name="lucide:x" class="w-4 h-4" />
              Reject
            </button>
            <button
              @click="handleAction(req.id, 'approve')"
              :disabled="processing === req.id"
              class="flex items-center gap-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-xl transition-all disabled:opacity-50"
            >
              <Icon v-if="processing === req.id" name="lucide:loader" class="w-4 h-4 animate-spin" />
              <Icon v-else name="lucide:check" class="w-4 h-4" />
              Approve
            </button>
          </div>
        </div>

        <!-- Reject note panel -->
        <div v-if="rejectingId === req.id" class="mt-4 pt-4 border-t border-[#1e1e2e]">
          <label class="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Rejection Reason (optional)</label>
          <textarea
            v-model="rejectNote"
            rows="2"
            placeholder="Reason for rejection..."
            class="w-full bg-[#0a0a10] border border-[#252535] rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-red-500/50 resize-none"
          />
          <div class="flex gap-2 mt-3">
            <button @click="rejectingId = null; rejectNote = ''" class="text-xs text-slate-400 hover:text-white px-3 py-2 rounded-xl hover:bg-white/5 transition-all">Cancel</button>
            <button
              @click="handleAction(req.id, 'reject')"
              :disabled="processing === req.id"
              class="text-xs font-medium text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500 px-4 py-2 rounded-xl transition-all disabled:opacity-50"
            >
              Confirm Rejection
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
