<script setup lang="ts">
const props = defineProps<{
  file: IFile;
  submitRename: (name: string) => Promise<void>;
}>();
const name = ref<string>(props.file.name);
const submitting = ref(false);
const submitError = ref("");
const emit = defineEmits(["close"]);

const validationError = computed(() => {
  const value = name.value.trim();
  if (!value) return "A name is required.";
  if (value.length > 255) return "Use 255 characters or fewer.";
  if (value === "." || value === "..") return "Choose a different name.";
  if (/[<>:"/\\|?*\u0000-\u001F]/.test(value)) return 'Names cannot contain < > : " / \\ | ? * characters.';
  if (/[. ]$/.test(value)) return "Names cannot end with a period or space.";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(value)) return "That name is reserved by the operating system.";
  return "";
});
const canSubmit = computed(() => !validationError.value && name.value.trim() !== props.file.name);

const onSubmit = async () => {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  submitError.value = "";
  try {
    await props.submitRename(name.value.trim());
  } catch (error: any) {
    submitError.value = error?.message || "The asset could not be renamed. Please try again.";
  } finally {
    submitting.value = false;
  }
};
const onOpenChange = (value: boolean) => {
  if (!value) emit("close", false);
};
</script>

<template>
  <UModal
    :title="`Rename ${file.name}`"
    :description="`Choose a new name for this ${file.type}.`"
    :dismissible="!submitting"
    :ui="{
      overlay: 'z-[90] bg-slate-950/60 backdrop-blur-[2px]',
      content: 'z-[100] w-[min(30rem,calc(100vw-2rem))] max-w-md overflow-hidden rounded-2xl border border-[var(--dam-line-strong)] bg-[var(--dam-panel-solid)] text-[var(--dam-ink)] opacity-100 shadow-2xl ring-0',
      header: 'border-b border-[var(--dam-line)] bg-[var(--dam-panel-solid)] px-6 py-5',
      body: 'bg-[var(--dam-panel-solid)] px-6 py-6',
      footer: 'flex justify-end gap-2 border-t border-[var(--dam-line)] bg-[var(--dam-panel-raised)] px-6 py-4',
    }"
    @update:open="onOpenChange"
  >
    <template #body>
      <UAlert
        v-if="submitError"
        title="Rename failed"
        :description="submitError"
        color="error"
        variant="soft"
        icon="lucide:circle-alert"
        class="mb-4"
      />
      <UFormField :label="`New ${file.type} name`" :error="validationError || undefined" help="Use 1-255 characters. The original file extension may be changed." class="w-full">
        <UInput
          v-model="name"
          class="w-full"
          size="lg"
          autofocus
          :disabled="submitting"
          :placeholder="`Enter a new ${file.type} name`"
          @keyup.enter="onSubmit"
        />
      </UFormField>
    </template>

    <template #footer>
      <UButton
        type="button"
        color="neutral"
        variant="outline"
        class="min-w-24 justify-center"
        :disabled="submitting"
        @click="emit('close', false)"
      >
        Cancel
      </UButton>
      <UButton
        type="button"
        color="primary"
        variant="solid"
        class="min-w-24 justify-center"
        :disabled="!canSubmit || submitting"
        :loading="submitting"
        @click="onSubmit"
      >
        Update
      </UButton>
    </template>
  </UModal>
</template>
