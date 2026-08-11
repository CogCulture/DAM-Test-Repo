<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { getRoleLabel } from "~~/shared/constants/roles";

const { isAdmin } = useRole();
if (!isAdmin.value) navigateTo("/");

const toast = useToast();
const loading = ref(true);
const saving = ref(false);
const search = ref("");
const selectedUserId = ref("");
const users = ref<any[]>([]);
const departments = ref<any[]>([]);
const rolePermissions = ref<any[]>([]);
const overrides = ref<any[]>([]);
const grants = ref<any[]>([]);

const permissionDefinitions = [
  { key: "canView", label: "View and browse", icon: "lucide:eye" },
  { key: "canDownload", label: "Download", icon: "lucide:download" },
  { key: "canUpload", label: "Upload", icon: "lucide:upload" },
  { key: "canCreateFolder", label: "Create folders", icon: "lucide:folder-plus" },
  { key: "canRename", label: "Rename", icon: "lucide:pencil" },
  { key: "canDelete", label: "Delete", icon: "lucide:trash-2" },
  { key: "canShare", label: "Share and publish", icon: "lucide:share-2" },
  { key: "canEditMetadata", label: "Edit metadata", icon: "lucide:tags" },
  { key: "canUseRag", label: "Run RAG processing", icon: "lucide:bot" },
];

const selectedUser = computed(() => users.value.find((user) => user.id === selectedUserId.value));
const filteredUsers = computed(() => {
  const query = search.value.trim().toLowerCase();
  return users.value.filter((user) => user.role !== "admin" && (!query ||
    user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)));
});

const form = ref({ permissions: {} as Record<string, boolean | null>, allDepartmentAccess: false, departmentIds: [] as string[] });

const roleDefault = (key: string) => {
  const user = selectedUser.value;
  if (!user) return false;
  const department = rolePermissions.value.find((permission) => permission.role === user.role && permission.departmentId === user.departmentId);
  const global = rolePermissions.value.find((permission) => permission.role === user.role && permission.departmentId === "global");
  return department?.[key] ?? global?.[key] ?? false;
};

const effectiveValue = (key: string) => form.value.permissions[key] ?? roleDefault(key);
const departmentName = (id?: string) => departments.value.find((department) => department.id === id)?.name || "Unassigned";
const availableDepartments = computed(() => departments.value.filter((department) => department.id !== selectedUser.value?.departmentId));

const selectUser = (userId: string) => {
  selectedUserId.value = userId;
  const override = overrides.value.find((item) => item.userId === userId);
  form.value = {
    permissions: Object.fromEntries(permissionDefinitions.map(({ key }) => [key, override?.[key] ?? null])),
    allDepartmentAccess: !!override?.allDepartmentAccess,
    departmentIds: grants.value.filter((grant) => grant.userId === userId).map((grant) => grant.departmentId),
  };
};

const fetchData = async () => {
  loading.value = true;
  try {
    const data: any = await $fetch("/api/admin/access-control");
    users.value = data.users || [];
    departments.value = data.departments || [];
    rolePermissions.value = data.rolePermissions || [];
    overrides.value = data.overrides || [];
    grants.value = data.grants || [];
    const nextId = selectedUserId.value || users.value.find((user) => user.role !== "admin")?.id;
    if (nextId) selectUser(nextId);
  } catch (error: any) {
    toast.add({ title: error?.data?.message || "Failed to load access controls", color: "error" });
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  if (!selectedUser.value) return;
  saving.value = true;
  try {
    await $fetch("/api/admin/access-control", {
      method: "PUT",
      body: { userId: selectedUser.value.id, ...form.value },
    });
    toast.add({ title: "Access updated", description: `Permissions saved for ${selectedUser.value.name}.`, color: "success" });
    await fetchData();
  } catch (error: any) {
    toast.add({ title: error?.data?.message || "Failed to save access", color: "error" });
  } finally {
    saving.value = false;
  }
};

onMounted(fetchData);
</script>

<template>
  <AppMain title="Access Control">
    <div v-if="loading" class="flex min-h-[50vh] items-center justify-center">
      <Icon name="lucide:loader-circle" class="size-8 animate-spin text-primary-500" />
    </div>

    <div v-else class="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside class="overflow-hidden rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel)] shadow-[var(--dam-shadow-soft)]">
        <div class="border-b border-[var(--dam-line)] p-4">
          <h2 class="text-base font-bold text-[var(--dam-ink)]">Organization users</h2>
          <p class="mt-1 text-xs text-[var(--dam-muted)]">Choose a person to configure.</p>
          <UInput v-model="search" icon="lucide:search" placeholder="Search users" class="mt-4 w-full" />
        </div>
        <div class="max-h-[62vh] overflow-y-auto p-2">
          <button
            v-for="user in filteredUsers"
            :key="user.id"
            type="button"
            :class="[
              'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
              selectedUserId === user.id ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'hover:bg-[var(--dam-panel-raised)]',
            ]"
            @click="selectUser(user.id)"
          >
            <UAvatar :src="user.avatar || undefined" :alt="user.name" size="sm" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold text-[var(--dam-ink)]">{{ user.name }}</span>
              <span class="block truncate text-xs text-[var(--dam-muted)]">{{ getRoleLabel(user.role) }} · {{ departmentName(user.departmentId) }}</span>
            </span>
          </button>
          <p v-if="!filteredUsers.length" class="p-6 text-center text-sm text-[var(--dam-muted)]">No users found.</p>
        </div>
      </aside>

      <section v-if="selectedUser" class="space-y-6">
        <div class="flex flex-col gap-4 rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel)] p-5 shadow-[var(--dam-shadow-soft)] sm:flex-row sm:items-center">
          <UAvatar :src="selectedUser.avatar || undefined" :alt="selectedUser.name" size="lg" />
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-xl font-bold text-[var(--dam-ink)]">{{ selectedUser.name }}</h2>
            <p class="truncate text-sm text-[var(--dam-muted)]">{{ selectedUser.email }}</p>
            <p class="mt-1 text-xs font-semibold text-primary-600 dark:text-primary-400">{{ getRoleLabel(selectedUser.role) }} · {{ departmentName(selectedUser.departmentId) }}</p>
          </div>
          <UButton icon="lucide:save" :loading="saving" @click="save">Save access</UButton>
        </div>

        <div class="rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel)] p-5 shadow-[var(--dam-shadow-soft)]">
          <div class="mb-4">
            <h3 class="text-base font-bold text-[var(--dam-ink)]">Service permissions</h3>
            <p class="mt-1 text-sm text-[var(--dam-muted)]">Inherit follows the user’s department role. Explicit allow or deny takes priority.</p>
          </div>
          <div class="divide-y divide-[var(--dam-line)]">
            <div v-for="permission in permissionDefinitions" :key="permission.key" class="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
              <div class="flex min-w-0 flex-1 items-center gap-3">
                <span class="grid size-9 place-items-center rounded-xl bg-[var(--dam-panel-raised)] text-[var(--dam-muted)]"><Icon :name="permission.icon" class="size-4" /></span>
                <div>
                  <p class="text-sm font-semibold text-[var(--dam-ink)]">{{ permission.label }}</p>
                  <p class="text-xs text-[var(--dam-muted)]">Effective: {{ effectiveValue(permission.key) ? 'Allowed' : 'Denied' }}</p>
                </div>
              </div>
              <select v-model="form.permissions[permission.key]" class="h-10 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] px-3 text-sm font-semibold text-[var(--dam-ink)]">
                <option :value="null">Inherit role</option>
                <option :value="true">Allow</option>
                <option :value="false">Deny</option>
              </select>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel)] p-5 shadow-[var(--dam-shadow-soft)]">
          <h3 class="text-base font-bold text-[var(--dam-ink)]">Department scope</h3>
          <p class="mt-1 text-sm text-[var(--dam-muted)]">Their home department is always included. Grant only the additional areas they need.</p>
          <label class="mt-5 flex items-center justify-between gap-4 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] p-4">
            <span><span class="block text-sm font-semibold text-[var(--dam-ink)]">All organization departments</span><span class="block text-xs text-[var(--dam-muted)]">Automatically includes current and future departments.</span></span>
            <USwitch v-model="form.allDepartmentAccess" />
          </label>
          <div v-if="!form.allDepartmentAccess" class="mt-4 grid gap-3 sm:grid-cols-2">
            <label v-for="department in availableDepartments" :key="department.id" class="flex items-center gap-3 rounded-xl border border-[var(--dam-line)] p-3 text-sm font-semibold text-[var(--dam-ink)]">
              <UCheckbox v-model="form.departmentIds" :value="department.id" />
              {{ department.name }}
            </label>
          </div>
          <p class="mt-4 text-xs text-[var(--dam-muted)]">Always included: {{ departmentName(selectedUser.departmentId) }}</p>
        </div>
      </section>
    </div>
  </AppMain>
</template>

