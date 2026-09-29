<script setup lang="ts">
import { ref, computed } from "vue";
import { damModalUi } from "~/utils/damModal";

const props = defineProps<{
  files: IFile[];
  sharing?: boolean;
}>();

const emit = defineEmits(["update"]);
const email = ref("");
const invitee = ref<Invitee[]>([]);
const members = ref<Member[]>([]);
const emailError = ref("");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const addInvitee = () => {
  emailError.value = "";
  const trimmed = email.value.trim();
  if (!trimmed) return;

  if (!emailRegex.test(trimmed)) {
    emailError.value = "Please enter a valid email address (e.g. user@company.com).";
    return;
  }

  // Prevent duplicates
  if (invitee.value.some((i) => i.email.toLowerCase() === trimmed.toLowerCase())) {
    emailError.value = "This email is already added to the invite list.";
    return;
  }

  invitee.value.push({
    email: trimmed,
    role: "viewer",
  });
  email.value = "";
};

const removeInvitee = (index: number) => {
  invitee.value.splice(index, 1);
};

const canSubmit = computed(() => {
  return invitee.value.length > 0 || (email.value.trim() !== "" && emailRegex.test(email.value.trim()));
});

const onUpdate = () => {
  if (email.value.trim() && emailRegex.test(email.value.trim())) {
    addInvitee();
  }
  if (invitee.value.length > 0) {
    emit("update", invitee.value);
  }
};
</script>

<template>
  <UModal
    v-if="files.length > 0"
    :open="true"
    :title="`Share ${files.length} item${files.length > 1 ? 's' : ''}`"
    description="Invite team members by email to access these files."
    :ui="damModalUi"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <!-- Input row with Add button -->
        <div class="flex items-center gap-2">
          <UInput
            v-model="email"
            type="email"
            placeholder="Type person's email address..."
            class="flex-1"
            autocomplete="off"
            @keydown.enter.prevent="addInvitee"
          />
          <UButton
            color="primary"
            variant="soft"
            icon="lucide:user-plus"
            :disabled="!email.trim()"
            @click="addInvitee"
          >
            Add
          </UButton>
        </div>

        <p v-if="emailError" class="text-xs text-red-400 font-medium">{{ emailError }}</p>

        <!-- Invitee list -->
        <div v-if="invitee.length > 0" class="flex flex-col gap-2 p-3 bg-neutral-900/60 border border-neutral-800 rounded-xl">
          <div class="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Invited People</div>
          <div
            v-for="(member, index) in invitee"
            :key="index"
            class="flex items-center justify-between p-2 rounded-lg bg-neutral-800/80 border border-neutral-700/60"
          >
            <div class="flex items-center gap-2 text-sm text-white">
              <UIcon name="lucide:mail" class="size-4 text-indigo-400" />
              <span>{{ member.email }}</span>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="lucide:x"
              @click="removeInvitee(index)"
            />
          </div>
        </div>

        <template v-if="members.length > 0">
          <h3 class="font-semibold text-sm text-neutral-300">People with access</h3>
          <div class="flex flex-col gap-1">
            <Member
              v-for="(member, index) in members"
              :key="index"
              :member="member"
            />
          </div>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex items-center justify-between w-full">
        <span class="text-xs text-neutral-500">
          {{ invitee.length }} recipient{{ invitee.length === 1 ? '' : 's' }} added
        </span>
        <UButton
          :disabled="!canSubmit || sharing"
          :loading="sharing"
          color="primary"
          variant="solid"
          icon="lucide:send"
          @click="onUpdate"
        >
          Confirm & Share
        </UButton>
      </div>
    </template>
  </UModal>
</template>
