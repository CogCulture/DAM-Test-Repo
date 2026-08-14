<script setup lang="ts">
import { ref, onMounted } from "vue";
const { fetch: fetchSession } = useUserSession();
const router = useRouter();

const checking = ref(true);
const error = ref("");
const folderName = ref("");
const folderIsEmpty = ref(true);
const setupComplete = ref(false);

const selectedDepartments = ref<string[]>([
  "HR",
  "Finance",
  "Marketing",
  "Creative Team",
  "IT Team",
  "Business Development",
  "Client Servicing",
  "Founders Team"
]);

const defaultDepts = [
  "HR",
  "Finance",
  "Marketing",
  "Creative Team",
  "IT Team",
  "Business Development",
  "Client Servicing",
  "Founders Team"
];

const customDeptName = ref("");
const addingCustom = ref(false);
const submitting = ref(false);

const addCustomDept = () => {
  const name = customDeptName.value.trim();
  if (name && !selectedDepartments.value.includes(name)) {
    selectedDepartments.value.push(name);
  }
  customDeptName.value = "";
  addingCustom.value = false;
};

const removeDept = (name: string) => {
  selectedDepartments.value = selectedDepartments.value.filter(d => d !== name);
};

const checkStatus = async () => {
  checking.value = true;
  error.value = "";
  try {
    const data = await $fetch<{ setupComplete: boolean; folderIsEmpty: boolean; folderName: string; error?: string }>(
      "/api/admin/gdrive-setup/status"
    );
    setupComplete.value = data.setupComplete;
    folderIsEmpty.value = data.folderIsEmpty;
    folderName.value = data.folderName || "";
    if (data.error) {
      error.value = data.error;
    }

    if (setupComplete.value) {
      router.push("/");
    }
  } catch (e: any) {
    error.value = e?.data?.message || "Failed to check Google Drive folder status.";
  } finally {
    checking.value = false;
  }
};

const handleBypassSetup = async () => {
  submitting.value = true;
  try {
    await $fetch("/api/admin/gdrive-setup/complete-empty", { method: "POST" });
    await fetchSession();
    router.push("/");
  } catch (e: any) {
    error.value = e?.data?.message || "Failed to complete setup.";
  } finally {
    submitting.value = false;
  }
};

const handleCreateDepartments = async () => {
  if (selectedDepartments.value.length === 0) {
    error.value = "Please select at least one department.";
    return;
  }
  submitting.value = true;
  error.value = "";
  try {
    const payload = {
      departments: selectedDepartments.value.map(name => ({ name }))
    };
    await $fetch("/api/admin/gdrive-setup/create-departments", {
      method: "POST",
      body: payload
    });
    await fetchSession();
    // Redirect to the departments management page so they can invite heads
    router.push("/admin/departments");
  } catch (e: any) {
    error.value = e?.data?.message || "Failed to create department folders.";
  } finally {
    submitting.value = false;
  }
};

onMounted(() => {
  checkStatus();
});
</script>

<template>
  <div class="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-white font-sans selection:bg-indigo-500 selection:text-white">
    <div class="sm:mx-auto sm:w-full sm:max-w-2xl text-center">
      <div class="inline-flex items-center justify-center p-3 bg-indigo-600/10 rounded-2xl border border-indigo-500/20 mb-6 animate-pulse">
        <span class="i-lucide-hard-drive text-indigo-400 text-3xl"></span>
      </div>
      <h2 class="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent">
        Google Drive Setup Wizard
      </h2>
      <p class="mt-2 text-sm text-slate-400">
        Let's configure your organization storage on Google Drive
      </p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
      <div class="bg-slate-900/50 backdrop-blur-md py-8 px-6 shadow-2xl rounded-3xl border border-slate-800 sm:px-10 space-y-6">
        
        <!-- Loading state -->
        <div v-if="checking" class="flex flex-col items-center justify-center py-12 space-y-4">
          <div class="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p class="text-slate-400 text-sm">Checking your organization's Google Drive folder...</p>
        </div>

        <!-- Error state -->
        <div v-else-if="error" class="space-y-4">
          <div class="bg-red-500/10 border border-red-500/30 p-4 rounded-xl text-red-200 text-sm flex items-start space-x-3">
            <span class="i-lucide-alert-triangle text-red-400 text-lg shrink-0 mt-0.5"></span>
            <div>
              <p class="font-medium">Setup Error</p>
              <p class="mt-1 text-red-300/80">{{ error }}</p>
            </div>
          </div>
          <button @click="checkStatus" class="w-full flex justify-center py-3 px-4 border border-slate-700 rounded-xl text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 transition duration-150">
            Retry Connection Check
          </button>
        </div>

        <!-- Folder has content: option to bypass and display contents -->
        <div v-else-if="!folderIsEmpty" class="space-y-6">
          <div class="bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl text-amber-200 text-sm space-y-3">
            <div class="flex items-center space-x-2">
              <span class="i-lucide-folder-open text-amber-400 text-xl"></span>
              <h4 class="font-semibold text-amber-300">Existing Folder Contents Detected</h4>
            </div>
            <p class="text-amber-200/80 leading-relaxed">
              The linked Google Drive folder <span class="font-mono bg-amber-950/50 px-2 py-0.5 rounded border border-amber-500/20 text-amber-400">"{{ folderName }}"</span> is not empty.
            </p>
            <p class="text-amber-200/80 leading-relaxed text-xs">
              To avoid interfering with existing workflows, you can skip the automated department creation wizard. Users will browse files and subfolders as they are currently organized.
            </p>
          </div>

          <div class="space-y-3">
            <button @click="handleBypassSetup" :disabled="submitting" class="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition duration-150 shadow-lg shadow-indigo-600/30 disabled:opacity-50">
              <span v-if="submitting" class="i-lucide-loader-2 animate-spin mr-2"></span>
              Display Existing Folder Contents
            </button>
          </div>
        </div>

        <!-- Folder is empty: proceed with creating departments -->
        <div v-else class="space-y-6">
          <div class="bg-indigo-500/5 border border-indigo-500/20 p-5 rounded-2xl text-indigo-200 text-sm space-y-2">
            <div class="flex items-center space-x-2">
              <span class="i-lucide-folder text-indigo-400 text-xl"></span>
              <h4 class="font-semibold text-indigo-300">New & Empty Storage Folder Connected</h4>
            </div>
            <p class="text-indigo-200/80 leading-relaxed">
              Your Google Drive folder <span class="font-mono bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-500/20 text-indigo-400">"{{ folderName }}"</span> is empty. Let's create your department folder hierarchy.
            </p>
          </div>

          <div>
            <label class="block text-sm font-semibold text-slate-300 mb-3">Select Departments to Auto-Create</label>
            
            <div class="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2">
              <div 
                v-for="dept in defaultDepts" 
                :key="dept"
                @click="selectedDepartments.includes(dept) ? removeDept(dept) : selectedDepartments.push(dept)"
                class="flex items-center space-x-3 p-3 rounded-xl border cursor-pointer select-none transition"
                :class="selectedDepartments.includes(dept) ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 text-slate-400'"
              >
                <span :class="selectedDepartments.includes(dept) ? 'i-lucide-check-square text-indigo-400' : 'i-lucide-square text-slate-500'" class="text-lg shrink-0"></span>
                <span class="text-sm font-medium">{{ dept }}</span>
              </div>
            </div>

            <!-- Custom Department Input -->
            <div class="mt-4">
              <div v-if="!addingCustom">
                <button @click="addingCustom = true" type="button" class="inline-flex items-center space-x-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition">
                  <span class="i-lucide-plus text-sm"></span>
                  <span>Add Custom Department</span>
                </button>
              </div>
              <div v-else class="flex items-center space-x-2">
                <input 
                  v-model="customDeptName" 
                  @keyup.enter="addCustomDept"
                  placeholder="e.g., Operations"
                  class="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button @click="addCustomDept" type="button" class="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2 text-sm font-semibold transition">
                  Add
                </button>
                <button @click="addingCustom = false; customDeptName = ''" type="button" class="text-slate-400 hover:text-slate-300 text-sm">
                  Cancel
                </button>
              </div>
            </div>

            <!-- Custom Created Departments Listing (if any outside default) -->
            <div v-if="selectedDepartments.some(d => !defaultDepts.includes(d))" class="mt-4 space-y-2">
              <h5 class="text-xs font-semibold text-slate-400">Custom Departments Added:</h5>
              <div class="flex flex-wrap gap-1.5">
                <span 
                  v-for="dept in selectedDepartments.filter(d => !defaultDepts.includes(d))" 
                  :key="dept"
                  class="inline-flex items-center space-x-1 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 px-2.5 py-1 rounded-full text-xs"
                >
                  <span>{{ dept }}</span>
                  <button @click="removeDept(dept)" type="button" class="text-indigo-400 hover:text-indigo-200 shrink-0">
                    <span class="i-lucide-x text-xs"></span>
                  </button>
                </span>
              </div>
            </div>

          </div>

          <div class="pt-4 border-t border-slate-800">
            <button @click="handleCreateDepartments" :disabled="submitting || selectedDepartments.length === 0" class="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition duration-150 shadow-lg shadow-indigo-600/30 disabled:opacity-50">
              <span v-if="submitting" class="i-lucide-loader-2 animate-spin mr-2"></span>
              Create Folders & Complete Setup
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>
