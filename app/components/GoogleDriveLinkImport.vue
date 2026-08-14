<script setup lang="ts">
import { useFolder } from "~/composables/useFolder";
import { useRole } from "~/composables/useRole";
import { useToast } from "~/composables/useToast";

const route = useRoute();
const { folder } = useFolder();
const { orgType } = useRole();
const toast = useToast();
const link = ref("");
const name = ref("");
const saving = ref(false);
const emit = defineEmits(["success"]);
const filesRefreshTrigger = useState<number>("files-refresh-trigger", () => 0);
const currentParentId = computed(() => {
  const routeId = Array.isArray(route.params.id)
    ? route.params.id[route.params.id.length - 1]
    : route.params.id;
  return folder.value?.id || (typeof routeId === "string" && routeId ? routeId : "root");
});

const canSubmit = computed(() => {
  try {
    const url = new URL(link.value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return false;
    return true;
  } catch {
    return false;
  }
});

const saveLink = async () => {
  if (!canSubmit.value || saving.value) return;
  saving.value = true;
  try {
    const endpoint = orgType.value === "gdrive"
      ? "/api/gdrive/import-url"
      : `/api/files/${String(route.params.bucket || "org")}/import-url`;
    const result: any = await $fetch(endpoint, {
      method: "POST",
      body: {
        url: link.value.trim(),
        filename: name.value.trim() || undefined,
        parentId: currentParentId.value,
      },
    });
    link.value = "";
    name.value = "";
    filesRefreshTrigger.value++;
    emit("success");
    toast.add({
      title: "File imported",
      description: `Saved the actual file as ${result?.import?.finalName || "a managed DAM asset"}.`,
      color: "green",
    });
  } catch (error: any) {
    toast.add({
      title: "Could not import file",
      description: error?.data?.message || error?.message || "Check the link and try again.",
      color: "red",
    });
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <form class="mt-3 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] p-3 shadow-[var(--dam-shadow-soft)]" @submit.prevent="saveLink">
    <div class="mb-2 flex items-center gap-2">
      <Icon name="logos:google-drive" class="size-4" />
      <div>
        <p class="text-xs font-bold text-[var(--dam-ink)]">Import a file from a link</p>
        <p class="text-[10px] text-[var(--dam-muted)]">DAM securely copies the actual file into your organization's managed storage.</p>
      </div>
    </div>
    <div class="grid min-w-0 grid-cols-1 gap-2">
      <UInput v-model="link" type="url" placeholder="Paste a public HTTP(S) or Google Drive file URL" aria-label="Public file URL" class="min-w-0" />
      <UInput v-model="name" placeholder="Optional filename override" aria-label="Imported filename" class="min-w-0" />
      <UButton type="submit" icon="lucide:download" label="Import actual file" color="primary" :loading="saving" :disabled="!canSubmit" class="w-full justify-center" />
    </div>
  </form>
</template>
