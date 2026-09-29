<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRole } from "~/composables/useRole";
import { useToast } from "~/composables/useToast";

const { isAdmin } = useRole();

const toast = useToast();
const router = useRouter();

type RootFolder = { id: string; name: string; path: string; count: number };

const rootFolders = ref<RootFolder[]>([]);
const clients = ref<RootFolder[]>([]);
const loadingFolders = ref(false);
const creatingTemplate = ref<string | null>(null);
const newClientName = ref("");
const addingClient = ref(false);
const showAddClient = ref(false);

const TEMPLATES = [
  {
    id: "clients",
    label: "Clients",
    folderName: "Clients",
    description: "A managed client folder. Each client gets: Brand Assets, Corporate, KT, Monthly Reports, Projects, SM Calendars.",
    icon: "lucide:users",
    gradient: "from-blue-500/15 to-blue-600/5",
    border: "border-blue-500/25 hover:border-blue-400/50",
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
  },
  {
    id: "onboarding",
    label: "Onboarding",
    folderName: "Onboarding",
    description: "Onboarding kit with Company Standard Templates, Cultural Integration, and Welcome Materials.",
    icon: "lucide:graduation-cap",
    gradient: "from-emerald-500/15 to-emerald-600/5",
    border: "border-emerald-500/25 hover:border-emerald-400/50",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
  },
  {
    id: "projects",
    label: "Projects",
    folderName: "Projects",
    description: "Project management folder with Active, Completed, and Archives sub-sections.",
    icon: "lucide:folder-kanban",
    gradient: "from-violet-500/15 to-violet-600/5",
    border: "border-violet-500/25 hover:border-violet-400/50",
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-400",
  },
  {
    id: "finance",
    label: "Finance",
    folderName: "Finance",
    description: "Finance folder with Invoices, Reports, and Budgets.",
    icon: "lucide:bar-chart-2",
    gradient: "from-amber-500/15 to-amber-600/5",
    border: "border-amber-500/25 hover:border-amber-400/50",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
  },
  {
    id: "hr",
    label: "HR",
    folderName: "HR",
    description: "Human Resources folder with Policies, Hiring, and Performance Reviews.",
    icon: "lucide:briefcase",
    gradient: "from-rose-500/15 to-rose-600/5",
    border: "border-rose-500/25 hover:border-rose-400/50",
    iconBg: "bg-rose-500/10",
    iconColor: "text-rose-400",
  },
];

const existingNames = computed(() => new Set((rootFolders.value || []).map((f) => f.name)));
const clientsFolder = computed(() => (rootFolders.value || []).find((f) => f && f.name === "Clients"));

const fetchRootFolders = async () => {
  loadingFolders.value = true;
  try {
    const res = await $fetch<{ folders: RootFolder[] }>("/api/admin/template-folders");
    rootFolders.value = res?.folders || [];
  } catch (e: any) {
    console.error("Failed to load template folders:", e);
    toast.add({ title: "Failed to load folder data", color: "error" });
    rootFolders.value = [];
  } finally {
    loadingFolders.value = false;
  }
};

const fetchClients = async (folderId: string) => {
  try {
    const res = await $fetch<{ data: any[] }>(`/api/files/list/org/${folderId}`, {
      query: { page: 1, sortBy: "name", order: "asc" },
    });
    clients.value = (res.data || []).filter((f: any) => f.type === "folder");
  } catch {
    clients.value = [];
  }
};

watch(
  clientsFolder,
  (folder) => {
    if (folder) fetchClients(folder.id);
  },
  { immediate: true }
);

onMounted(() => {
  if (import.meta.client && !isAdmin.value) {
    navigateTo("/");
    return;
  }
  fetchRootFolders();
});

const createTemplate = async (templateId: string) => {
  if (creatingTemplate.value) return;
  creatingTemplate.value = templateId;
  try {
    const res = (await $fetch("/api/admin/template-folders", {
      method: "POST",
      body: { template: templateId },
    })) as any;
              toast.add({
                title: `"${res.rootFolder}" folder created`,
                description: "Folder structure has been set up in organization storage.",
                color: "success",
              });
    const refreshTrigger = useState("files-refresh-trigger", () => 0);
    refreshTrigger.value++;
    await fetchRootFolders();
    if (templateId === "clients" && clientsFolder.value) {
      await fetchClients(clientsFolder.value.id);
    }
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Failed to create folder", color: "error" });
  } finally {
    creatingTemplate.value = null;
  }
};

const addClient = async () => {
  if (!newClientName.value.trim()) return;
  if (!clientsFolder.value) {
    toast.add({ title: "Create the Clients folder first.", color: "warning" });
    return;
  }
  addingClient.value = true;
  try {
    const res = (await $fetch("/api/admin/template-folders", {
      method: "POST",
      body: { template: "clients_add_client", clientName: newClientName.value.trim() },
    })) as any;
    toast.add({
      title: `Client "${res.clientName}" added`,
      description: "Brand Assets, Corporate, KT, Monthly Reports, Projects, SM Calendars created.",
      color: "success",
    });
    const refreshTrigger = useState("files-refresh-trigger", () => 0);
    refreshTrigger.value++;
    newClientName.value = "";
    showAddClient.value = false;
    await fetchRootFolders();
    if (clientsFolder.value) await fetchClients(clientsFolder.value.id);
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Failed to add client", color: "error" });
  } finally {
    addingClient.value = false;
  }
};

const goToFolder = (folderId: string) => {
  if (folderId) {
    const route = useRoute();
    const activeBucket = (route.params.bucket as string) || "org";
    router.push(`/${activeBucket}/${folderId}`);
  }
};
</script>

<template>
  <AppMain title="Client Folders" description="Create and manage pre-configured client folder structures in the organization's shared drive.">
    <div class="w-full max-w-5xl mx-auto space-y-8">
      <!-- Loading Skeletons -->
      <div v-if="loadingFolders" class="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div
          v-for="i in 5"
          :key="i"
          class="h-52 w-full rounded-2xl bg-[var(--dam-panel-solid)] p-5 border border-[var(--dam-line)] animate-pulse flex flex-col justify-between shadow-sm"
        >
          <div class="space-y-3">
            <div class="size-10 rounded-xl bg-[var(--dam-panel-raised)]" />
            <div class="h-5 w-2/5 rounded bg-[var(--dam-panel-raised)]" />
            <div class="h-3 w-4/5 rounded bg-[var(--dam-panel-raised)]" />
            <div class="h-3 w-3/5 rounded bg-[var(--dam-panel-raised)]" />
          </div>
          <div class="h-9 w-28 rounded-xl bg-[var(--dam-panel-raised)]" />
        </div>
      </div>

      <div v-else class="w-full space-y-8">
        <!-- Template Cards -->
        <section class="space-y-4">
          <h2 class="text-xs font-bold text-[var(--dam-ink-muted)] uppercase tracking-wider">
            Available Pre-Configured Templates
          </h2>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div
              v-for="tmpl in TEMPLATES"
              :key="tmpl.id"
              :class="[
                'relative rounded-2xl border bg-[var(--dam-panel-solid)] p-5 transition-all duration-200 flex flex-col justify-between shadow-sm hover:shadow-md',
                tmpl.border,
                existingNames.has(tmpl.folderName) ? 'cursor-pointer' : '',
              ]"
              @click="existingNames.has(tmpl.folderName) && goToFolder(rootFolders.find(f => f.name === tmpl.folderName)?.id || '')"
            >
              <!-- Created pill -->
              <div
                v-if="existingNames.has(tmpl.folderName)"
                class="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold"
              >
                <Icon name="lucide:check-circle" class="size-3.5" />
                Created
              </div>

              <div>
                <!-- Icon -->
                <div :class="['w-10 h-10 rounded-xl flex items-center justify-center mb-3', tmpl.iconBg, tmpl.iconColor]">
                  <Icon :name="tmpl.icon" class="size-5" />
                </div>

                <h3 class="font-bold text-[var(--dam-ink)] text-base mb-1">
                  {{ tmpl.label }}
                </h3>
                <p class="text-xs text-[var(--dam-ink-muted)] leading-relaxed mb-4">
                  {{ tmpl.description }}
                </p>
              </div>

              <div class="flex gap-2 pt-3 border-t border-[var(--dam-line)]">
                <UButton
                  v-if="!existingNames.has(tmpl.folderName)"
                  color="primary"
                  variant="solid"
                  size="sm"
                  icon="lucide:folder-plus"
                  class="rounded-xl"
                  :loading="creatingTemplate === tmpl.id"
                  @click.stop="createTemplate(tmpl.id)"
                >
                  Create Folder
                </UButton>
                <UButton
                  v-else
                  color="primary"
                  variant="soft"
                  size="sm"
                  icon="lucide:folder-open"
                  class="rounded-xl"
                  @click.stop="goToFolder(rootFolders.find(f => f.name === tmpl.folderName)?.id || '')"
                >
                  Open Folder
                </UButton>
              </div>
            </div>
          </div>
        </section>

        <!-- Clients Management Panel -->
        <section
          v-if="clientsFolder"
          class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-6 space-y-5 shadow-sm"
        >
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Icon name="lucide:users" class="size-5 text-blue-400" />
              </div>
              <div>
                <h2 class="text-lg font-bold text-[var(--dam-ink)]">Client Domain Management</h2>
                <p class="text-xs text-[var(--dam-ink-muted)]">
                  {{ clients.length }} active client{{ clients.length !== 1 ? 's' : '' }} · Includes Brand Assets, Corporate, KT, Monthly Reports, Projects, SM Calendars.
                </p>
              </div>
            </div>
            <UButton
              color="primary"
              variant="solid"
              size="sm"
              icon="lucide:plus"
              class="rounded-xl"
              @click="showAddClient = !showAddClient"
            >
              Add New Client
            </UButton>
          </div>

          <!-- Add client form -->
          <div
            v-if="showAddClient"
            class="bg-[var(--dam-bg)] rounded-xl border border-[var(--dam-line)] p-4 space-y-3"
          >
            <p class="text-xs font-bold text-[var(--dam-ink)]">New Client Name</p>
            <div class="flex gap-2">
              <input
                v-model="newClientName"
                type="text"
                placeholder="e.g. Reach Group"
                class="flex-1 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] px-4 py-2 text-sm text-[var(--dam-ink)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                @keydown.enter="addClient"
              />
              <UButton
                color="primary"
                variant="solid"
                size="md"
                class="rounded-xl"
                :loading="addingClient"
                @click="addClient"
              >
                Create
              </UButton>
              <UButton
                color="neutral"
                variant="ghost"
                size="md"
                class="rounded-xl"
                @click="showAddClient = false; newClientName = ''"
              >
                Cancel
              </UButton>
            </div>
          </div>

          <!-- Client grid -->
          <div v-if="clients.length === 0" class="text-center py-12 text-[var(--dam-ink-muted)] text-sm">
            <Icon name="lucide:folder-open" class="size-12 mb-3 mx-auto opacity-30" />
            <p>No clients created yet.</p>
          </div>

          <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <button
              v-for="client in clients"
              :key="client.id"
              class="group flex flex-col items-center gap-2 p-4 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] hover:border-indigo-500/40 hover:bg-[var(--dam-panel-raised)] transition text-center"
              @click="goToFolder(client.id)"
            >
              <div class="w-10 h-10 rounded-lg bg-indigo-500/10 group-hover:bg-indigo-500/20 flex items-center justify-center transition">
                <Icon name="lucide:folder" class="size-5 text-indigo-400" />
              </div>
              <span class="text-xs font-bold text-[var(--dam-ink)] truncate w-full">
                {{ client.name }}
              </span>
            </button>
          </div>
        </section>
      </div>
    </div>
  </AppMain>
</template>
