<script setup lang="ts">
const { isAdmin } = useRole();
if (!isAdmin.value) {
  navigateTo("/");
}

const toast = useToast();
const router = useRouter();

// ─── Types ────────────────────────────────────────────────────────────────────

type RootFolder = { id: string; name: string; path: string; count: number };

// ─── State ────────────────────────────────────────────────────────────────────

const rootFolders = ref<RootFolder[]>([]);
const clients = ref<RootFolder[]>([]);
const loadingFolders = ref(false);
const creatingTemplate = ref<string | null>(null);
const newClientName = ref("");
const addingClient = ref(false);
const showAddClient = ref(false);

// ─── Templates Definition ─────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: "clients",
    label: "Clients",
    folderName: "Clients",
    description:
      "A managed client folder. Each client gets: Brand Assets, Corporate, KT, Monthly Reports, Projects, SM Calendars.",
    icon: "lucide:users",
    gradient: "from-blue-500/15 to-blue-600/5",
    border: "border-blue-500/25 hover:border-blue-400/50",
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
    badgeBg: "bg-blue-500/10",
  },
  {
    id: "onboarding",
    label: "Onboarding",
    folderName: "Onboarding",
    description:
      "Onboarding kit with Company Standard Templates, Cultural Integration, and Welcome Materials.",
    icon: "lucide:graduation-cap",
    gradient: "from-emerald-500/15 to-emerald-600/5",
    border: "border-emerald-500/25 hover:border-emerald-400/50",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    badgeBg: "bg-emerald-500/10",
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
    badgeBg: "bg-violet-500/10",
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
    badgeBg: "bg-amber-500/10",
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
    badgeBg: "bg-rose-500/10",
  },
];

// ─── Computed ─────────────────────────────────────────────────────────────────

const existingNames = computed(() => new Set(rootFolders.value.map((f) => f.name)));
const clientsFolder = computed(() => rootFolders.value.find((f) => f.name === "Clients"));

// ─── Data Fetching ────────────────────────────────────────────────────────────

const fetchRootFolders = async () => {
  loadingFolders.value = true;
  try {
    const res = await $fetch<{ folders: RootFolder[] }>("/api/admin/template-folders");
    rootFolders.value = res.folders;
  } catch (e: any) {
    toast.add({ title: "Failed to load folder data", color: "error" });
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

onMounted(fetchRootFolders);

// ─── Actions ──────────────────────────────────────────────────────────────────

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
      description: "Folder structure has been set up in the org drive.",
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
  if (folderId) router.push(`/org/${folderId}`);
};
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-8">

    <!-- Page Header -->
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-neutral-900 dark:text-white">Template Folders</h1>
        <p class="text-neutral-500 text-sm mt-1">
          Create pre-configured folder structures in the organization's shared drive.
        </p>
      </div>
      <UBadge color="primary" variant="subtle" size="lg" icon="lucide:shield">
        Admin Only
      </UBadge>
    </div>

    <!-- Loading Skeletons -->
    <div v-if="loadingFolders" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="i in 5"
        :key="i"
        class="h-44 rounded-2xl bg-neutral-100 dark:bg-neutral-900 animate-pulse border border-neutral-200 dark:border-neutral-800"
      />
    </div>

    <div v-else class="space-y-8">

      <!-- ── Template Cards ── -->
      <section class="space-y-4">
        <h2 class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
          Available Templates
        </h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="tmpl in TEMPLATES"
            :key="tmpl.id"
            :class="[
              'relative rounded-2xl border bg-gradient-to-br p-5 transition-all duration-200',
              tmpl.gradient,
              tmpl.border,
              existingNames.has(tmpl.folderName) ? '' : 'hover:scale-[1.015] hover:shadow-lg dark:hover:shadow-black/20',
            ]"
          >
            <!-- Created pill -->
            <div
              v-if="existingNames.has(tmpl.folderName)"
              class="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25 text-xs font-medium"
            >
              <UIcon name="lucide:check-circle" class="size-3" />
              Created
            </div>

            <!-- Icon -->
            <div :class="['w-10 h-10 rounded-xl flex items-center justify-center mb-3', tmpl.iconBg, tmpl.iconColor]">
              <UIcon :name="tmpl.icon" class="size-5" />
            </div>

            <h3 class="font-semibold text-neutral-800 dark:text-neutral-100 text-base mb-1">
              {{ tmpl.label }}
            </h3>
            <p class="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed mb-4">
              {{ tmpl.description }}
            </p>

            <div class="flex gap-2">
              <UButton
                v-if="!existingNames.has(tmpl.folderName)"
                color="primary"
                variant="solid"
                size="sm"
                icon="lucide:folder-plus"
                :loading="creatingTemplate === tmpl.id"
                @click="createTemplate(tmpl.id)"
              >
                Create
              </UButton>
              <UButton
                v-else
                color="neutral"
                variant="ghost"
                size="sm"
                icon="lucide:external-link"
                @click="goToFolder(rootFolders.find(f => f.name === tmpl.folderName)?.id || '')"
              >
                Open in Drive
              </UButton>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Clients Management Panel ── -->
      <section
        v-if="clientsFolder"
        class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 space-y-5"
      >
        <!-- Header row -->
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <UIcon name="lucide:users" class="size-5 text-blue-400" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-200">Client Management</h2>
              <p class="text-xs text-neutral-500 dark:text-neutral-400">
                {{ clients.length }} client{{ clients.length !== 1 ? 's' : '' }} ·
                Each client has: Brand Assets, Corporate, KT, Monthly Reports, Projects, SM Calendars
              </p>
            </div>
          </div>
          <UButton
            color="primary"
            variant="solid"
            size="sm"
            icon="lucide:plus"
            @click="showAddClient = !showAddClient"
          >
            Add New Client
          </UButton>
        </div>

        <!-- Add client form -->
        <div
          v-if="showAddClient"
          class="bg-neutral-50 dark:bg-neutral-950 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-3"
        >
          <p class="text-sm font-medium text-neutral-700 dark:text-neutral-300">New Client Name</p>
          <div class="flex gap-2">
            <UInput
              v-model="newClientName"
              placeholder="e.g. Reach Group"
              class="flex-1"
              size="lg"
              autofocus
              @keydown.enter="addClient"
            />
            <UButton
              color="primary"
              variant="solid"
              size="lg"
              :loading="addingClient"
              @click="addClient"
            >
              Create
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="lg"
              @click="showAddClient = false; newClientName = ''"
            >
              Cancel
            </UButton>
          </div>
          <p class="text-xs text-neutral-400 dark:text-neutral-500">
            Auto-creates inside client folder:
            <span class="text-neutral-300 dark:text-neutral-400 font-medium">
              Brand Assets, Corporate, KT, Monthly Reports, Projects, SM Calendars
            </span>
          </p>
        </div>

        <!-- Client grid (mimics Google Drive style) -->
        <div v-if="clients.length === 0" class="text-center py-12 text-neutral-400 text-sm">
          <UIcon name="lucide:folder-open" class="size-12 mb-3 mx-auto opacity-30" />
          <p>No clients yet.</p>
          <p class="text-xs mt-1">Click <strong>"Add New Client"</strong> to create the first one.</p>
        </div>

        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <button
            v-for="client in clients"
            :key="client.id"
            class="group flex flex-col items-center gap-2 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 hover:border-blue-400/40 hover:bg-blue-50/5 dark:hover:bg-blue-950/10 transition-all duration-150 text-center"
            @click="goToFolder(client.id)"
          >
            <div class="w-10 h-10 rounded-lg bg-blue-500/10 group-hover:bg-blue-500/20 flex items-center justify-center transition-colors">
              <UIcon name="lucide:folder" class="size-5 text-blue-400" />
            </div>
            <span class="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate w-full leading-snug">
              {{ client.name }}
            </span>
          </button>
        </div>
      </section>

      <!-- ── Onboarding Panel ── -->
      <section
        v-if="existingNames.has('Onboarding')"
        class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <UIcon name="lucide:graduation-cap" class="size-5 text-emerald-400" />
            </div>
            <div>
              <h2 class="text-base font-semibold text-neutral-800 dark:text-neutral-200">Onboarding</h2>
              <p class="text-xs text-neutral-500">
                Contains: Company Standard Templates · Cultural Integration · Welcome Materials
              </p>
            </div>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="lucide:external-link"
            @click="goToFolder(rootFolders.find(f => f.name === 'Onboarding')?.id || '')"
          >
            Open in Drive
          </UButton>
        </div>
      </section>

    </div>
  </div>
</template>
