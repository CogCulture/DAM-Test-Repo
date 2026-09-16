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
  <form class="flex flex-col gap-2.5 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] p-3 shadow-inner" @submit.prevent="saveLink">
    <div class="flex items-center gap-2">
      <Icon name="logos:google-drive" class="size-4 shrink-0" />
      <div>
        <p class="text-xs font-semibold text-[var(--dam-ink)]">Import file from public link or Drive</p>
        <p class="text-[10px] text-[var(--dam-muted)]">Copies the target file directly into your managed DAM storage.</p>
      </div>
    </div>
    <div class="grid min-w-0 grid-cols-1 gap-2 mt-0.5">
      <UInput v-model="link" type="url" placeholder="Paste HTTP(S) or Google Drive file URL..." aria-label="Public file URL" class="w-full" size="sm" />
      <UInput v-model="name" placeholder="Optional filename override" aria-label="Imported filename" class="w-full" size="sm" />
      <UButton type="submit" icon="lucide:download" label="Import File" color="primary" variant="solid" size="sm" :loading="saving" :disabled="!canSubmit" class="w-full justify-center rounded-xl font-semibold mt-0.5" />
    </div>
  </form>
</template>
