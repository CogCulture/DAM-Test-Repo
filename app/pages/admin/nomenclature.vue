<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRole } from "~/composables/useRole";
import { useToast } from "~/composables/useToast";

const { canEditNomenclature, departmentId, isAdmin } = useRole();
const toast = useToast();

if (!canEditNomenclature.value) {
  navigateTo("/");
}

const selectedDept = ref(departmentId.value ?? "");
const departmentsList = ref<{ id: string; name: string }[]>([]);
const loadingDepartments = ref(false);
const saving = ref(false);
const governanceRules = ref({
  enforceNomenclature: false,
  enforceHierarchy: false,
  allowInterDeptVisibility: true,
});

// PREDEFINED FILE TYPE BUNDLES (ADMIN PRESETS)
const FILE_TYPE_BUNDLES = [
  {
    category: "Images & Vectors",
    icon: "lucide:image",
    extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "psd", "ai", "tiff"],
    color: "emerald"
  },
  {
    category: "Documents & Spreadsheets",
    icon: "lucide:file-text",
    extensions: ["pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt", "csv", "txt"],
    color: "blue"
  },
  {
    category: "Video & Animation",
    icon: "lucide:video",
    extensions: ["mp4", "mov", "avi", "mkv", "webm", "prores", "mp3", "wav"],
    color: "indigo"
  },
  {
    category: "3D Assets & Archives",
    icon: "lucide:box",
    extensions: ["zip", "rar", "7z", "obj", "fbx", "gltf", "glb", "blend"],
    color: "amber"
  }
];

// PREDEFINED NAMING SEGMENT PRESETS
const SEGMENT_PRESETS = [
  { key: "Dept", label: "Department Code", defaultValues: ["MKT", "DES", "ENG", "FIN", "HR"] },
  { key: "Campaign", label: "Campaign Name", defaultValues: ["Summer_2026", "Brand_Launch", "Q3_Promo", "AlwaysOn"] },
  { key: "Year", label: "Fiscal Year", defaultValues: ["2024", "2025", "2026", "2027"] },
  { key: "AssetType", label: "Asset Category", defaultValues: ["Banner", "Logo", "Video", "Presentation", "SocialPost", "Flyer"] },
  { key: "Channel", label: "Distribution Channel", defaultValues: ["Instagram", "YouTube", "LinkedIn", "Website", "Print"] },
  { key: "Version", label: "File Revision", defaultValues: ["v1", "v2", "v3", "Final", "Draft"] },
  { key: "Region", label: "Geographic Region", defaultValues: ["Global", "NA", "EU", "APAC", "LATAM"] }
];

onMounted(async () => {
  if (isAdmin.value) {
    loadingDepartments.value = true;
    try {
      const data: any = await $fetch("/api/organizations/settings");
      departmentsList.value = data.departments || [];
      if (data.gdriveRules) {
        governanceRules.value = {
          enforceNomenclature: !!data.gdriveRules.enforceNomenclature,
          enforceHierarchy: !!data.gdriveRules.enforceHierarchy,
          allowInterDeptVisibility: data.gdriveRules.allowInterDeptVisibility !== false,
        };
      }
      if (departmentsList.value.length > 0 && !selectedDept.value) {
        selectedDept.value = departmentsList.value[0].id;
      }
    } catch (e) {
      toast.add({ title: "Failed to load departments", color: "error" });
    } finally {
      loadingDepartments.value = false;
    }
  }
});

const deptOptions = computed(() => {
  return (departmentsList.value || []).map((d) => ({
    value: d.id,
    label: d.name,
  }));
});

const { data: nomenclature, refresh } = await useFetch(() => 
  selectedDept.value ? `/api/nomenclature/${selectedDept.value}` : null
);

const segments = ref<{ key: string; label: string; allowedValues: string[] }[]>([]);
const folderSegments = ref<{ key: string; label: string; allowedValues: string[] }[]>([]);
const allowedExtensions = ref<string[]>([]);
const newExtension = ref("");
const newSegKey = ref("");
const newSegLabel = ref("");
const newValueInputs = ref<Record<string, string>>({});

watch(nomenclature, (val: any) => {
  if (val) {
    segments.value = (val.segments || []).map((s: any) => ({
      key: s.key || "",
      label: s.label || "",
      allowedValues: Array.isArray(s.allowedValues) ? [...s.allowedValues] : [],
    }));
    folderSegments.value = (val.folderSegments || []).map((s: any) => ({
      key: s.key || "",
      label: s.label || "",
      allowedValues: Array.isArray(s.allowedValues) ? [...s.allowedValues] : [],
    }));
    allowedExtensions.value = Array.isArray(val.allowedExtensions) ? [...val.allowedExtensions] : [];
  }
}, { immediate: true });

const template = computed(() => {
  if (!segments.value.length) return "No naming convention configured (files are free-form)";
  return segments.value.map((s) => `{${s.key}}`).join("_") + ".ext";
});

const folderTemplatePreview = computed(() => {
  if (!folderSegments.value.length) return "";
  return folderSegments.value.map((s) => `{${s.key}}`).join("_");
});

const allowedValuesFor = (segment: { allowedValues?: string[] | null }) =>
  Array.isArray(segment.allowedValues) ? segment.allowedValues : [];

// ─── File Extensions Preset Actions ───────────────────────────────────────────

const toggleExtension = (ext: string) => {
  const cleanExt = ext.toLowerCase();
  if (allowedExtensions.value.includes(cleanExt)) {
    allowedExtensions.value = allowedExtensions.value.filter((e) => e !== cleanExt);
  } else {
    allowedExtensions.value.push(cleanExt);
  }
};

const toggleBundle = (bundleExtensions: string[]) => {
  const allPresent = bundleExtensions.every((ext) => allowedExtensions.value.includes(ext));
  if (allPresent) {
    // Remove bundle
    allowedExtensions.value = allowedExtensions.value.filter((ext) => !bundleExtensions.includes(ext));
  } else {
    // Add all missing
    const toAdd = bundleExtensions.filter((ext) => !allowedExtensions.value.includes(ext));
    allowedExtensions.value.push(...toAdd);
  }
};

const isBundleActive = (bundleExtensions: string[]) => {
  return bundleExtensions.every((ext) => allowedExtensions.value.includes(ext));
};

const clearAllExtensions = () => {
  allowedExtensions.value = [];
};

const selectAllStandardExtensions = () => {
  const all = FILE_TYPE_BUNDLES.flatMap((b) => b.extensions);
  allowedExtensions.value = Array.from(new Set(all));
};

const addCustomExtension = () => {
  const ext = newExtension.value.trim().toLowerCase().replace(/^\./, "");
  if (!ext) return;
  if (!allowedExtensions.value.includes(ext)) {
    allowedExtensions.value.push(ext);
  }
  newExtension.value = "";
};

// ─── Segment Preset Actions ───────────────────────────────────────────────────

const addPresetSegment = (preset: typeof SEGMENT_PRESETS[0]) => {
  if (segments.value.some((s) => s.key.toLowerCase() === preset.key.toLowerCase())) {
    toast.add({ title: `Segment "${preset.key}" already added`, color: "warning" });
    return;
  }
  segments.value.push({
    key: preset.key,
    label: preset.label,
    allowedValues: [...preset.defaultValues]
  });
  toast.add({ title: `Added segment preset: ${preset.label}`, color: "success" });
};

const addCustomSegment = () => {
  const key = newSegKey.value.trim().replace(/\s+/g, "");
  const label = newSegLabel.value.trim();
  if (!key || !label) return;
  if (key.includes("_")) {
    toast.add({ title: "Segment keys cannot contain underscores", color: "error" });
    return;
  }
  if (segments.value.some((s) => s.key.toLowerCase() === key.toLowerCase())) {
    toast.add({ title: "Segment with this key already exists", color: "error" });
    return;
  }
  segments.value.push({ key, label, allowedValues: [] });
  newSegKey.value = "";
  newSegLabel.value = "";
};

const deleteSegment = (index: number) => {
  segments.value.splice(index, 1);
};

const moveSegment = (index: number, direction: number) => {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= segments.value.length) return;
  const temp = segments.value[index];
  segments.value[index] = segments.value[targetIndex];
  segments.value[targetIndex] = temp;
};

const addValue = (key: string) => {
  const val = (newValueInputs.value[key] || "").trim();
  if (!val) return;
  const seg = segments.value.find((s) => s.key === key);
  if (seg) {
    if (!seg.allowedValues) seg.allowedValues = [];
    if (!seg.allowedValues.includes(val)) {
      seg.allowedValues.push(val);
    }
  }
  newValueInputs.value[key] = "";
};

const removeValue = (key: string, val: string) => {
  const seg = segments.value.find((s) => s.key === key);
  if (seg && seg.allowedValues) {
    seg.allowedValues = seg.allowedValues.filter((v) => v !== val);
  }
};

const addPresetValuesToSegment = (segKey: string, presetValues: string[]) => {
  const seg = segments.value.find((s) => s.key === segKey);
  if (seg) {
    if (!seg.allowedValues) seg.allowedValues = [];
    const missing = presetValues.filter((v) => !seg.allowedValues.includes(v));
    seg.allowedValues.push(...missing);
  }
};

const save = async () => {
  if (!selectedDept.value) {
    toast.add({ title: "Please select a department first", color: "error" });
    return;
  }
  saving.value = true;
  try {
    await $fetch(`/api/nomenclature/${selectedDept.value}`, {
      method: "PUT",
      body: {
        template: template.value,
        segments: segments.value,
        allowedExtensions: allowedExtensions.value,
        folderTemplate: folderTemplatePreview.value,
        folderSegments: folderSegments.value,
      },
    });
    if (isAdmin.value) {
      await $fetch("/api/organizations/gdrive-rules", {
        method: "PUT",
        body: governanceRules.value,
      });
    }
    toast.add({ title: "Nomenclature configuration saved!", color: "success" });
    refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error saving nomenclature", color: "error" });
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <AppMain 
    title="Upload & Folder Nomenclature Governance" 
    description="Define file naming templates, allowed file format extensions, and folder structure policies for your organization."
    icon="lucide:tag"
  >
    <div class="max-w-5xl mx-auto space-y-8">
      <!-- Department Selector Bar -->
      <div v-if="isAdmin && deptOptions.length > 0" class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] p-4 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
        <div class="flex items-center gap-3 flex-1">
          <Icon name="lucide:building-2" class="size-5 text-indigo-500" />
          <div>
            <span class="text-xs font-bold text-[var(--dam-ink-muted)] uppercase tracking-wider block">Governed Department Domain</span>
            <span class="text-xs text-[var(--dam-ink-muted)]">Configure rules specifically for this department branch.</span>
          </div>
        </div>

        <select
          v-model="selectedDept"
          class="w-72 bg-[var(--dam-bg)] border border-[var(--dam-line)] rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--dam-ink)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        >
          <option v-for="d in deptOptions" :key="d.value" :value="d.value">
            {{ d.label }}
          </option>
        </select>
      </div>

      <!-- Live Template Preview Card -->
      <div class="bg-gradient-to-r from-indigo-600/10 via-[var(--dam-panel-solid)] to-purple-600/10 border-2 border-indigo-500/30 rounded-2xl p-6 space-y-4 shadow-md">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
              <Icon name="lucide:file-code-2" class="size-5" />
            </span>
            <span class="text-xs font-bold text-indigo-400 uppercase tracking-widest">Active File Pattern Preview</span>
          </div>

          <span class="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            {{ segments.length }} Segments Configured
          </span>
        </div>

        <div class="bg-[var(--dam-bg)] border border-[var(--dam-line)] rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
          <code class="text-[var(--dam-ink)] font-mono text-base font-bold break-all">{{ template }}</code>
          <span class="text-xs text-[var(--dam-ink-muted)] font-medium">Example: MKT_Summer2026_Banner_v1.png</span>
        </div>

        <div v-if="isAdmin" class="flex items-center justify-between gap-4 border-t border-[var(--dam-line)] pt-4">
          <div>
            <p class="text-sm font-bold text-[var(--dam-ink)]">Strict Upload Validation</p>
            <p class="text-xs text-[var(--dam-ink-muted)]">When enabled, every uploaded file is checked before storing. Non-compliant filenames are automatically rejected.</p>
          </div>
          <USwitch v-model="governanceRules.enforceNomenclature" color="primary" />
        </div>
      </div>

      <!-- ALLOWED FILE FORMAT EXTENSIONS SECTION -->
      <section class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-6 space-y-6 shadow-sm">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--dam-line)] pb-4">
          <div>
            <h2 class="text-base font-bold text-[var(--dam-ink)] flex items-center gap-2">
              <Icon name="lucide:file-check" class="text-emerald-500 size-5" />
              Allowed File Formats & Extension Restrictions
            </h2>
            <p class="text-xs text-[var(--dam-ink-muted)] mt-1">
              Select allowed file types using multi-select preset bundles below or pick individual extensions. Leave empty to allow all extensions.
            </p>
          </div>

          <div class="flex items-center gap-2">
            <UButton
              size="xs"
              color="primary"
              variant="soft"
              icon="lucide:check-check"
              class="rounded-xl"
              @click="selectAllStandardExtensions"
            >
              Select All Standard Formats
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="lucide:rotate-ccw"
              class="rounded-xl text-red-400"
              @click="clearAllExtensions"
            >
              Clear Restrictions
            </UButton>
          </div>
        </div>

        <!-- Predefined Extension Preset Category Bundles -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            v-for="bundle in FILE_TYPE_BUNDLES"
            :key="bundle.category"
            class="bg-[var(--dam-bg)] border border-[var(--dam-line)] hover:border-indigo-500/40 rounded-xl p-4 space-y-3 transition"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Icon :name="bundle.icon" class="size-4 text-indigo-400" />
                <span class="text-xs font-bold text-[var(--dam-ink)]">{{ bundle.category }}</span>
              </div>
              
              <button
                class="text-[10px] font-bold px-2 py-0.5 rounded-full transition"
                :class="isBundleActive(bundle.extensions) ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-[var(--dam-panel-solid)] text-[var(--dam-ink-muted)] border border-[var(--dam-line)] hover:text-[var(--dam-ink)]'"
                @click="toggleBundle(bundle.extensions)"
              >
                {{ isBundleActive(bundle.extensions) ? 'Selected All' : '+ Select Bundle' }}
              </button>
            </div>

            <!-- Extension Chips in Bundle -->
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="ext in bundle.extensions"
                :key="ext"
                class="px-2 py-1 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1"
                :class="allowedExtensions.includes(ext) ? 'bg-indigo-600 text-white shadow-xs' : 'bg-[var(--dam-panel-solid)] text-[var(--dam-ink-muted)] border border-[var(--dam-line)] hover:border-indigo-500/40 hover:text-[var(--dam-ink)]'"
                @click="toggleExtension(ext)"
              >
                <span>.{{ ext }}</span>
                <Icon v-if="allowedExtensions.includes(ext)" name="lucide:check" class="size-3" />
              </button>
            </div>
          </div>
        </div>

        <!-- Currently Active Extensions Summary Pills -->
        <div class="pt-4 border-t border-[var(--dam-line)] space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-[var(--dam-ink-muted)] uppercase tracking-wider">
              Active Allowed Formats ({{ allowedExtensions.length > 0 ? allowedExtensions.length : 'All Extensions Permitted' }})
            </span>
          </div>

          <div v-if="allowedExtensions.length > 0" class="flex flex-wrap gap-2 bg-[var(--dam-bg)] p-3 rounded-xl border border-[var(--dam-line)]">
            <span
              v-for="ext in allowedExtensions"
              :key="ext"
              class="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold"
            >
              .{{ ext }}
              <button type="button" class="hover:text-red-400" @click="toggleExtension(ext)">
                <Icon name="lucide:x" class="size-3" />
              </button>
            </span>
          </div>
          <div v-else class="text-xs text-[var(--dam-ink-muted)] italic bg-[var(--dam-bg)] p-3 rounded-xl border border-[var(--dam-line)]">
            No restrictions applied — users may upload files with any extension.
          </div>

          <!-- Add Custom Extension Input -->
          <div class="flex gap-2 max-w-md pt-2">
            <input
              v-model="newExtension"
              type="text"
              placeholder="Add unlisted extension (e.g. psd, indd, raw)"
              class="flex-1 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] px-4 py-2 text-xs text-[var(--dam-ink)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              @keyup.enter="addCustomExtension"
            />
            <UButton icon="lucide:plus" color="primary" variant="solid" size="sm" class="rounded-xl" @click="addCustomExtension">
              Add Custom Format
            </UButton>
          </div>
        </div>
      </section>

      <!-- NAMING SEGMENTS CONFIGURATION SECTION -->
      <section class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl p-6 space-y-6 shadow-sm">
        <div class="border-b border-[var(--dam-line)] pb-4">
          <h2 class="text-base font-bold text-[var(--dam-ink)] flex items-center gap-2">
            <Icon name="lucide:sliders" class="text-indigo-500 size-5" />
            Configure Naming Segments & Presets
          </h2>
          <p class="text-xs text-[var(--dam-ink-muted)] mt-1">
            Build your filename template by picking from predefined segment shortcuts or adding custom segments.
          </p>
        </div>

        <!-- Quick Segment Shortcuts Bar -->
        <div class="space-y-2">
          <span class="text-xs font-bold text-[var(--dam-ink-muted)] uppercase tracking-wider block">One-Click Segment Shortcuts</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="preset in SEGMENT_PRESETS"
              :key="preset.key"
              class="px-3 py-1.5 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] text-xs font-bold text-[var(--dam-ink)] hover:border-indigo-500/50 hover:text-indigo-400 transition flex items-center gap-1.5 shadow-xs"
              @click="addPresetSegment(preset)"
            >
              <Icon name="lucide:plus-circle" class="size-3.5 text-indigo-400" />
              <span>{{ preset.label }} ({{ preset.key }})</span>
            </button>
          </div>
        </div>

        <!-- Configured Segments List & Values Editor -->
        <div class="space-y-4 pt-4 border-t border-[var(--dam-line)]">
          <h3 class="text-xs font-bold text-[var(--dam-ink-muted)] uppercase tracking-wider">Configured Pattern Segments</h3>

          <div v-if="segments.length === 0" class="text-center py-8 bg-[var(--dam-bg)] border border-dashed border-[var(--dam-line)] rounded-2xl text-[var(--dam-ink-muted)] text-xs">
            No segments added yet. Click one of the shortcuts above to build your filename template.
          </div>

          <div v-else class="space-y-4">
            <div
              v-for="(seg, idx) in segments"
              :key="seg.key"
              class="bg-[var(--dam-bg)] border border-[var(--dam-line)] rounded-2xl p-4 space-y-3"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span class="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    #{{ idx + 1 }}
                  </span>
                  <div>
                    <span class="font-bold text-sm text-[var(--dam-ink)]">{{ seg.label }}</span>
                    <code class="text-xs font-mono text-[var(--dam-ink-muted)] ml-2">({ {{ seg.key }} })</code>
                  </div>
                </div>

                <div class="flex items-center gap-1">
                  <UButton size="xs" color="neutral" variant="ghost" icon="lucide:arrow-up" :disabled="idx === 0" @click="moveSegment(idx, -1)" />
                  <UButton size="xs" color="neutral" variant="ghost" icon="lucide:arrow-down" :disabled="idx === segments.length - 1" @click="moveSegment(idx, 1)" />
                  <UButton size="xs" color="error" variant="ghost" icon="lucide:trash-2" class="text-red-400" @click="deleteSegment(idx)" />
                </div>
              </div>

              <!-- Allowed Values List -->
              <div class="space-y-2 pt-2 border-t border-[var(--dam-line)]">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-semibold text-[var(--dam-ink-muted)]">Allowed Segment Values:</span>
                  <span v-if="allowedValuesFor(seg).length === 0" class="text-amber-500 italic">Unrestricted (free-text entry allowed)</span>
                  <span v-else class="text-emerald-400 font-bold">{{ allowedValuesFor(seg).length }} options configured</span>
                </div>

                <div class="flex flex-wrap gap-1.5">
                  <span
                    v-for="val in allowedValuesFor(seg)"
                    :key="val"
                    class="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] text-xs font-bold text-[var(--dam-ink)]"
                  >
                    <span>{{ val }}</span>
                    <button type="button" class="hover:text-red-400" @click="removeValue(seg.key, val)">
                      <Icon name="lucide:x" class="size-3" />
                    </button>
                  </span>
                </div>

                <!-- Add Value Input -->
                <div class="flex gap-2 pt-1">
                  <input
                    v-model="newValueInputs[seg.key]"
                    type="text"
                    :placeholder="`Add value for ${seg.label}...`"
                    class="flex-1 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] px-3 py-1.5 text-xs text-[var(--dam-ink)] focus:outline-none"
                    @keyup.enter="addValue(seg.key)"
                  />
                  <UButton size="xs" color="primary" variant="solid" icon="lucide:plus" class="rounded-xl" @click="addValue(seg.key)">
                    Add Option
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <!-- Add Custom Segment Form -->
          <div class="pt-4 border-t border-[var(--dam-line)] space-y-3">
            <span class="text-xs font-bold text-[var(--dam-ink-muted)] uppercase tracking-wider block">Add Custom Naming Segment</span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              <input v-model="newSegKey" type="text" placeholder="Segment Key (e.g. ProjectCode)" class="rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] px-4 py-2 text-xs text-[var(--dam-ink)]" />
              <input v-model="newSegLabel" type="text" placeholder="Segment Label (e.g. Project Code)" class="rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] px-4 py-2 text-xs text-[var(--dam-ink)]" />
            </div>
            <UButton size="sm" color="primary" variant="outline" icon="lucide:plus" class="rounded-xl" :disabled="!newSegKey || !newSegLabel" @click="addCustomSegment">
              Add Custom Segment
            </UButton>
          </div>
        </div>
      </section>

      <!-- Save Floating Bar -->
      <div class="flex justify-end pt-4">
        <UButton
          color="primary"
          variant="solid"
          size="lg"
          class="rounded-xl shadow-md px-8 font-bold"
          :loading="saving"
          icon="lucide:save"
          @click="save"
        >
          Save Nomenclature Configuration
        </UButton>
      </div>
    </div>
  </AppMain>
</template>
