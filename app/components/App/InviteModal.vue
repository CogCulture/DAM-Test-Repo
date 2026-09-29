<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useToast } from "~/composables/useToast";
import { useCopy } from "~/composables/useCopy";

const props = defineProps<{
  modelValue?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const open = computed({
  get: () => props.modelValue ?? false,
  set: (val: boolean) => emit("update:modelValue", val),
});

const toast = useToast();
const { copy } = useCopy();

const { user } = useUserSession();
const email = ref("");
const selectedDept = ref("");
const selectedRole = ref("team_member");
const loading = ref(false);
const resultInviteUrl = ref("");
const sentViaSmtp = ref(false);
const step = ref<"form" | "success">("form");

const availableRoles = computed(() => {
  const roles = [
    { id: "team_member", label: "Team Member", desc: "Can view, upload, and download assets" },
    { id: "team_lead", label: "Team Lead", desc: "Can manage assets, folders, and share" },
    { id: "dept_head", label: "Department Head", desc: "Can manage department, nomenclature, and approvals" },
    { id: "guest", label: "Guest", desc: "Restricted read-only / guest access" },
  ];
  if (user.value?.role === "admin") {
    roles.unshift({ id: "admin", label: "Admin", desc: "Full organization administration" });
  }
  return roles;
});

// Fetch departments for selection
const departments = ref<any[]>([]);
const fetchingDepts = ref(false);

const fetchDepartments = async () => {
  fetchingDepts.value = true;
  try {
    const list = await $fetch<any[]>("/api/departments/list");
    departments.value = list || [];
  } catch (err) {
    console.error("Failed to load departments:", err);
  } finally {
    fetchingDepts.value = false;
  }
};

onMounted(() => {
  fetchDepartments();
});

watch(open, (isOpen) => {
  if (isOpen) {
    fetchDepartments();
  }
});

const sendInvite = async () => {
  if (!email.value || !email.value.trim()) {
    toast.add({ title: "Email required", description: "Please enter a valid email address.", color: "error" });
    return;
  }
  loading.value = true;
  try {
    const res = await $fetch<{ success: boolean; inviteUrl: string; sentViaSmtp: boolean; message: string }>(
      "/api/organizations/invite",
      {
        method: "POST",
        body: {
          email: email.value.trim(),
          departmentId: selectedDept.value || undefined,
          role: selectedRole.value,
        },
      }
    );
    resultInviteUrl.value = res.inviteUrl;
    sentViaSmtp.value = res.sentViaSmtp;
    step.value = "success";
    toast.add({
      title: "Invitation Created!",
      description: res.sentViaSmtp
        ? `Invitation email sent to ${email.value} via SMTP.`
        : `Invitation created for ${email.value}.`,
      color: "success",
    });
  } catch (e: any) {
    toast.add({
      title: "Invitation failed",
      description: e?.data?.message || e?.message || "Could not send invitation.",
      color: "error",
    });
  } finally {
    loading.value = false;
  }
};

const copyLink = () => {
  if (resultInviteUrl.value) {
    copy(resultInviteUrl.value);
    toast.add({ title: "Invite link copied to clipboard!", color: "success" });
  }
};

const resetModal = () => {
  email.value = "";
  selectedDept.value = "";
  selectedRole.value = "team_member";
  resultInviteUrl.value = "";
  sentViaSmtp.value = false;
  step.value = "form";
  open.value = false;
};
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-slate-950/60 backdrop-blur-xs" @click="resetModal" />

        <!-- Dialog Container -->
        <div
          class="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] p-6 text-[var(--dam-ink)] shadow-2xl transition-all"
        >
          <!-- Close button -->
          <button
            @click="resetModal"
            class="absolute top-4 right-4 p-2 rounded-xl text-[var(--dam-muted)] hover:text-[var(--dam-ink)] hover:bg-[var(--dam-panel-raised)] transition-colors cursor-pointer"
          >
            <Icon name="lucide:x" class="size-5" />
          </button>

          <!-- Step 1: Input Form -->
          <div v-if="step === 'form'" class="space-y-5">
            <div class="flex items-center gap-3">
              <div class="size-11 rounded-2xl bg-primary-500/10 border border-primary-500/25 flex items-center justify-center shrink-0">
                <Icon name="lucide:mail-plus" class="size-6 text-primary-500" />
              </div>
              <div>
                <h3 class="text-lg font-bold text-[var(--dam-ink)]">Invite Member to Organization</h3>
                <p class="text-xs text-[var(--dam-muted)] mt-0.5">
                  Send an email invitation to collaborate in your organization workspace.
                </p>
              </div>
            </div>

            <!-- Form -->
            <div class="space-y-4 pt-2">
              <div>
                <label class="block text-xs font-semibold uppercase tracking-wider text-[var(--dam-muted)] mb-1.5">
                  Recipient Email Address <span class="text-rose-500">*</span>
                </label>
                <div class="relative">
                  <Icon name="lucide:mail" class="absolute left-3.5 top-3.5 size-4 text-[var(--dam-muted)]" />
                  <input
                    v-model="email"
                    type="email"
                    placeholder="e.g. colleague@company.com"
                    class="w-full rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel)] pl-10 pr-4 py-2.5 text-sm text-[var(--dam-ink)] placeholder-[var(--dam-muted)] outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all shadow-xs"
                    @keydown.enter="sendInvite"
                  />
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold uppercase tracking-wider text-[var(--dam-muted)] mb-1.5">
                  Department (Optional)
                </label>
                <div class="relative">
                  <Icon name="lucide:building-2" class="absolute left-3.5 top-3.5 size-4 text-[var(--dam-muted)] pointer-events-none" />
                  <select
                    v-model="selectedDept"
                    class="w-full appearance-none rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel)] pl-10 pr-10 py-2.5 text-sm text-[var(--dam-ink)] outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all cursor-pointer shadow-xs"
                  >
                    <option value="" class="bg-[var(--dam-panel-solid)] text-[var(--dam-ink)]">No Department (Global)</option>
                    <option
                      v-for="dept in departments"
                      :key="dept.id"
                      :value="dept.id"
                      class="bg-[var(--dam-panel-solid)] text-[var(--dam-ink)]"
                    >
                      {{ dept.name }}
                    </option>
                  </select>
                  <Icon name="lucide:chevron-down" class="absolute right-3.5 top-3.5 size-4 text-[var(--dam-muted)] pointer-events-none" />
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold uppercase tracking-wider text-[var(--dam-muted)] mb-1.5">
                  Assigned Role <span class="text-rose-500">*</span>
                </label>
                <div class="relative">
                  <Icon name="lucide:shield" class="absolute left-3.5 top-3.5 size-4 text-[var(--dam-muted)] pointer-events-none" />
                  <select
                    v-model="selectedRole"
                    class="w-full appearance-none rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel)] pl-10 pr-10 py-2.5 text-sm text-[var(--dam-ink)] outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all cursor-pointer shadow-xs"
                  >
                    <option
                      v-for="role in availableRoles"
                      :key="role.id"
                      :value="role.id"
                      class="bg-[var(--dam-panel-solid)] text-[var(--dam-ink)]"
                    >
                      {{ role.label }} — {{ role.desc }}
                    </option>
                  </select>
                  <Icon name="lucide:chevron-down" class="absolute right-3.5 top-3.5 size-4 text-[var(--dam-muted)] pointer-events-none" />
                </div>
                <p class="text-[11px] text-[var(--dam-muted)] mt-1.5 pl-1">
                  The invited member will automatically receive this role when they accept the invitation.
                </p>
              </div>
            </div>

            <!-- Submit button -->
            <div class="flex items-center justify-end gap-3 pt-4 border-t border-[var(--dam-line)]">
              <button
                @click="resetModal"
                class="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--dam-muted)] hover:text-[var(--dam-ink)] hover:bg-[var(--dam-panel-raised)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                @click="sendInvite"
                :disabled="loading || !email.trim()"
                class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-bold text-xs shadow-md shadow-primary-500/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                <div v-if="loading" class="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <Icon v-else name="lucide:send" class="size-4" />
                Send Invitation Email
              </button>
            </div>
          </div>

          <!-- Step 2: Success Confirmation -->
          <div v-else-if="step === 'success'" class="py-4 text-center space-y-4">
            <div
              :class="[
                'size-16 rounded-full flex items-center justify-center mx-auto',
                sentViaSmtp
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-500'
                  : 'bg-primary-500/15 border border-primary-500/30 text-primary-500'
              ]"
            >
              <Icon :name="sentViaSmtp ? 'lucide:mail-check' : 'lucide:link-2'" class="size-8" />
            </div>
            <div>
              <h3 class="text-xl font-bold text-[var(--dam-ink)]">
                {{ sentViaSmtp ? "Invitation Email Sent!" : "Invitation Link Created" }}
              </h3>
              <p class="text-xs text-[var(--dam-muted)] mt-1.5 max-w-sm mx-auto leading-relaxed">
                <span v-if="sentViaSmtp">
                  An invitation email was successfully sent over SMTP to <strong class="text-[var(--dam-ink)]">{{ email }}</strong>.
                </span>
                <span v-else>
                  SMTP mail server is not configured, so no email was sent directly. Copy and send the link below to <strong class="text-[var(--dam-ink)]">{{ email }}</strong>:
                </span>
              </p>
            </div>

            <!-- Copyable Invite URL -->
            <div class="rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel)] p-3 flex items-center gap-2 text-left">
              <input
                type="text"
                readonly
                :value="resultInviteUrl"
                class="flex-1 bg-transparent text-xs font-mono text-[var(--dam-ink)] outline-none truncate select-all"
              />
              <button
                @click="copyLink"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-500/15 hover:bg-primary-500/25 text-xs font-semibold text-primary-500 transition-colors shrink-0 cursor-pointer"
              >
                <Icon name="lucide:copy" class="size-3.5" />
                Copy Link
              </button>
            </div>

            <div class="pt-2">
              <button
                @click="resetModal"
                class="w-full py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
