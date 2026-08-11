<script setup lang="ts">
import { damModalUi } from "~/utils/damModal";
const props = defineProps<{
  file: IFile;
  loading: boolean;
  error: string;
}>();
const name = ref<string>("duplicate-" + props.file.name);
const emit = defineEmits(["submit"]);
const onSubmit = () => {
  emit("submit", name.value);
};
</script>
<template>
  <UModal
    :title="`Copy ${file.name}`"
    :description="`Create a duplicate of this ${file.type}`"
    :ui="damModalUi"
  >
    <template #body>
      <UAlert
        v-if="error"
        title="Error"
        :description="error"
        color="error"
        variant="soft"
        icon="lucide:message-circle-warning"
        class="mb-4"
      />
      <UFormField :label="`New ${file.type} name`" class="w-full">
        <UInput v-model="name" class="w-full" />
      </UFormField>
    </template>
    <template #footer>
      <UButton
        @click="onSubmit"
        :loading="loading"
        color="primary"
        variant="solid"
        >Make Copy</UButton
      >
    </template>
  </UModal>
</template>
