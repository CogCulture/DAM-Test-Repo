<script setup lang="ts">
defineProps<{
  member: Member | Invitee;
}>();
const memberRoles = [
  { value: "viewer", label: "Viewer" },
  { value: "editor", label: "Editor" },
];
</script>
<template>
  <div
    class="flex items-center gap-2 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
  >
    <UAvatar :alt="member.name || member.email" size="lg" />
    <div class="flex flex-col">
      <span v-if="member.name" class="font-semibold text-sm">{{
        member.name
      }}</span>
      <span class="text-sm text-gray-500">{{ member.email }}</span>
    </div>
    <USelect
      v-if="member.role === 'owner'"
      :disabled="true"
      :items="['Owner']"
      modelValue="Owner"
      class="ml-auto min-w-36"
    />
    <USelect
      v-else
      :items="memberRoles"
      v-model="member.role"
      class="ml-auto min-w-36"
    />
  </div>
</template>
