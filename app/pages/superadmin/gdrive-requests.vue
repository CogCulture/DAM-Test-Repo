<script setup lang="ts">
import { useToast } from "~/composables/useToast";
definePageMeta({ layout: "superadmin", middleware: "superadmin" });

const toast = useToast();
const { data: requests, refresh } = await useFetch<any[]>("/api/superadmin/gdrive-requests");
const processing = ref<string | null>(null);

const handleAction = async (id: string, action: "approve" | "reject") => {
  processing.value = id;
  try {
    await $fetch(`/api/superadmin/gdrive-requests/${id}/approve`, {
      method: "POST",
      body: { action },
    });
    toast.add({
      title: action === "approve" ? "GDrive connection approved!" : "GDrive request rejected",
      color: action === "approve" ? "success" : "warning",
    });
    refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error", color: "error" });
  } finally {
    processing.value = null;
  }
};

const formatDate = (d: any) => {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
</script>

<template>
  <div class="p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Google Drive Requests</h1>
        <p class="text-slate-400 text-sm mt-1">Approve or reject Google Drive folder hosting requests across all organizations</p>
      </div>
      <button @click="refresh" class="text-slate-400 hover:text-white px-3 py-2 rounded-xl hover:bg-white/5 transition-all">
        <Icon name="lucide:refresh-cw" class="w-4 h-4" />
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="!requests?.length" class="flex flex-col items-center justify-center py-24">
      <div class="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
        <Icon name="lucide:hard-drive" class="w-8 h-8 text-blue-400/50" />
      </div>
      <p class="text-white font-medium mb-1">No pending GDrive requests</p>
      <p class="text-slate-500 text-sm">All Google Drive hosting requests have been reviewed.</p>
    </div>

    <!-- Cards -->
    <div v-else class="space-y-4">
      <div
        v-for="req in requests"
        :key="req.id"
        class="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6 hover:border-[#2e2e44] transition-all"
      >
        <div class="flex items-start justify-between gap-6">
          <div class="flex items-center gap-4 flex-1 min-w-0">
            <!-- User avatar -->
            <img v-if="req.userAvatar" :src="req.userAvatar" :alt="req.userName" class="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
            <div v-else class="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Icon name="lucide:hard-drive" class="w-5 h-5 text-blue-400" />
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs bg-blue-500/10 text-blue-400 font-semibold px-2 py-0.5 rounded-full border border-blue-500/20">
                  Google Drive
                </span>
              </div>
              <h3 class="text-white font-semibold text-base">
                {{ req.folderName || 'Unnamed Folder' }}
              </h3>
              <p class="text-sm text-slate-400">
                By <span class="text-slate-200 font-medium">{{ req.userName }}</span> · {{ req.userEmail }}
              </p>
              <p class="text-xs text-slate-600 font-mono mt-1">Folder ID: {{ req.folderId }}</p>
              <p class="text-xs text-slate-600 mt-0.5">Requested {{ formatDate(req.createdAt) }}</p>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-3 flex-shrink-0">
            <button
              @click="handleAction(req.id, 'reject')"
              :disabled="processing === req.id"
              class="flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-red-400 border border-[#1e1e2e] hover:border-red-500/30 px-3 py-2 rounded-xl transition-all disabled:opacity-50"
            >
              <Icon name="lucide:x" class="w-4 h-4" />
              Reject
            </button>
            <button
              @click="handleAction(req.id, 'approve')"
              :disabled="processing === req.id"
              class="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl transition-all disabled:opacity-50"
            >
              <Icon v-if="processing === req.id" name="lucide:loader" class="w-4 h-4 animate-spin" />
              <Icon v-else name="lucide:check" class="w-4 h-4" />
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
