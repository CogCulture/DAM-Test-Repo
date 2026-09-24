<script setup lang="ts">
import { ref, computed } from "vue";
import { damModalUi } from "~/utils/damModal";

const props = defineProps<{
  file: IFile;
  publishing: boolean;
}>();

const emit = defineEmits(["update", "close"]);

const domain = ref<string>("");
const visibility = ref<string>(props.file?.visibility && props.file.visibility !== "inherit" ? props.file.visibility : "public");

const visibilityOptions = [
  { label: "Public", value: "public", icon: "lucide:globe" },
  { label: "Private", value: "private", icon: "lucide:lock" },
  { label: "Inherit", value: "inherit", icon: "lucide:corner-down-right" },
];

const selectedIcon = computed(() => {
  return visibilityOptions.find((item) => item.value === visibility.value)?.icon || "lucide:globe";
});

const onConfirm = () => {
  emit("update", { visibility: visibility.value, domain: domain.value });
};

const onClose = () => {
  emit("close");
};
</script>

<template>
  <UModal
    v-if="file"
    :title="`Publish '${file.name}'`"
    :description="`Published item will be available to everyone via a public link.`"
    :dismissible="!publishing"
    :ui="damModalUi"
    @update:open="(val: boolean) => { if (!val) onClose(); }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <!-- Visibility Selector -->
        <div class="flex flex-row items-center justify-between gap-4">
          <label class="text-sm font-medium min-w-24 text-[var(--dam-ink)]">Visibility</label>
          <USelect
            :icon="selectedIcon"
            v-model="visibility"
            :items="visibilityOptions"
            variant="outline"
            class="w-full"
          />
        </div>

        <template v-if="visibility === 'public' && file.type === 'folder'">
          <div class="text-xs text-[var(--dam-ink-muted)]">
            If you want to publish this folder as a website, specify a domain.
          </div>
          <div class="flex flex-row items-center justify-between gap-4">
            <label class="text-sm font-medium min-w-24 text-[var(--dam-ink)]">Domain</label>
            <UInput
              v-model="domain"
              type="url"
              placeholder="e.g. docs.mybrand.com"
              class="w-full"
            />
          </div>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          @click="onClose"
        >
          Cancel
        </UButton>
        <UButton
          :loading="publishing"
          color="primary"
          variant="solid"
          icon="lucide:globe"
          @click="onConfirm"
        >
          Publish
        </UButton>
      </div>
    </template>
  </UModal>
</template>
