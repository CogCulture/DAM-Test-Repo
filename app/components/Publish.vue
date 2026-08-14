<script setup lang="ts">
import { damModalUi } from "~/utils/damModal";
const props = defineProps<{
  file: IFile;
  publishing: boolean;
}>();
const emit = defineEmits(["update"]);
const domain = ref<string>();
const visibility = ref<string>(props.file.visibility);
const onConfirm = () => {
  emit("update", { visibility: visibility.value, domain: domain.value });
};
</script>
<template>
  <UModal
    v-if="file"
    :title="`Publish '${file.name}'`"
    :description="`Published item will be available to everyone via a public link.`"
    :ui="damModalUi"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="flex flex-row items-center justify-between gap-4">
          <label class="text-sm font-light min-w-24">Visibility</label>
          <USelect
            :icon="
              visibilityOptions.find((item) => item.value === visibility)?.icon
            "
            v-model="visibility"
            :items="visibilityOptions"
            variant="outline"
            class="w-full"
          />
        </div>
        <template v-if="visibility === 'public' && file.type === 'folder'">
          <div class="text-sm font-light">
            If you want to publish as a website, set a domain for it.
          </div>
          <div class="flex flex-row items-center justify-between gap-4">
            <label class="text-sm font-light min-w-24">Domain</label>
            <UInput
              v-model="domain"
              type="url"
              placeholder="Enter Domain"
              required
              class="w-full"
            />
          </div>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex items-center justify-end w-full">
        <UButton
          :loading="publishing"
          color="primary"
          variant="solid"
          @click="onConfirm"
          >Confirm</UButton
        >
      </div>
    </template>
  </UModal>
</template>
