<script setup lang="ts">
import { normalizeNomenclatureSegments } from "~~/shared/utils/file-nomenclature";

const { canEditNomenclature, departmentId, isDeptHead, isAdmin } = useRole();
const toast = useToast();

if (!canEditNomenclature.value) {
  navigateTo("/");
}

const selectedDept = ref(departmentId.value ?? "");
const departmentsList = ref<{ id: string; name: string }[]>([]);
const loadingDepartments = ref(false);
const governanceRules = ref({
  enforceNomenclature: false,
  enforceHierarchy: false,
  allowInterDeptVisibility: true,
});

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
  return departmentsList.value.map((d) => ({
    value: d.id,
    label: d.name,
  }));
});

const { data: nomenclature, refresh } = await useFetch(() => 
  selectedDept.value ? `/api/nomenclature/${selectedDept.value}` : null
);

const segments = ref<{ key: string; label: string; allowedValues: string[] }[]>([]);
const folderSegments = ref<{ key: string; label: string; allowedValues: string[] }[]>([]);
const allowedValuesFor = (segment: { allowedValues?: string[] | null }) =>
  Array.isArray(segment.allowedValues) ? segment.allowedValues : [];
const newValueInputs = ref<Record<string, string>>({});
const newFolderValueInputs = ref<Record<string, string>>({});
const allowedExtensions = ref<string[]>([]);
const allowedExtensionsForEditor = () =>
  Array.isArray(allowedExtensions.value) ? allowedExtensions.value : [];
const newExtension = ref("");
const saving = ref(false);

watch(
  nomenclature,
  (val) => {
    if (val?.segments) {
      segments.value = normalizeNomenclatureSegments(val.segments);
    } else {
      segments.value = [];
    }
    allowedExtensions.value = Array.isArray(val?.allowedExtensions)
      ? [...val.allowedExtensions]
      : [];
    if (val?.folderSegments) {
      folderSegments.value = normalizeNomenclatureSegments(val.folderSegments);
    } else {
      folderSegments.value = [];
    }
  },
  { immediate: true }
);

const template = computed(() =>
  segments.value.map((s) => s.key).join("_")
);
const folderTemplatePreview = computed(() =>
  folderSegments.value.map((segment) => segment.key).join("_")
);

const addValue = (segKey: string) => {
const val = newValueInputs.value[segKey]?.trim();
  if (!val) return;
  if (val.includes("_")) {
    toast.add({ title: "Allowed values cannot contain underscores", color: "error" });
    return;
  }
  const seg = segments.value.find((s) => s.key === segKey);
  if (seg && !seg.allowedValues.includes(val)) {
    seg.allowedValues.push(val);
  }
  newValueInputs.value[segKey] = "";
};

const removeValue = (segKey: string, val: string) => {
  const seg = segments.value.find((s) => s.key === segKey);
  if (seg) {
    seg.allowedValues = seg.allowedValues.filter((v) => v !== val);
  }
};

const addFolderValue = (segKey: string) => {
  const value = newFolderValueInputs.value[segKey]?.trim();
  if (!value) return;
  if (value.includes("_")) {
    toast.add({ title: "Allowed values cannot contain underscores", color: "error" });
    return;
  }
  const segment = folderSegments.value.find((item) => item.key === segKey);
  if (segment && !segment.allowedValues.includes(value)) {
    segment.allowedValues.push(value);
  }
  newFolderValueInputs.value[segKey] = "";
};

const removeFolderValue = (segKey: string, value: string) => {
  const segment = folderSegments.value.find((item) => item.key === segKey);
  if (segment) {
    segment.allowedValues = segment.allowedValues.filter((item) => item !== value);
  }
};

const addExtension = () => {
  const value = newExtension.value.trim().replace(/^\./, "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9+_-]{0,15}$/.test(value)) {
    toast.add({ title: "Enter a valid extension such as pdf, jpg, or docx", color: "error" });
    return;
  }
  if (!allowedExtensions.value.includes(value)) {
    allowedExtensions.value.push(value);
  }
  newExtension.value = "";
};

const removeExtension = (value: string) => {
  allowedExtensions.value = allowedExtensions.value.filter((extension) => extension !== value);
};


const newSegKey = ref("");
const newSegLabel = ref("");
const newFolderSegKey = ref("");
const newFolderSegLabel = ref("");

const addSegment = () => {
const key = newSegKey.value.trim().replace(/s+/g, "");
  if (key.includes("_")) {
    toast.add({ title: "Segment keys cannot contain underscores", color: "error" });
    return;
  }
  const label = newSegLabel.value.trim();
  if (!key || !label) return;

  if (segments.value.some((s) => s.key.toLowerCase() === key.toLowerCase())) {
    toast.add({ title: "Segment with this key already exists", color: "error" });
    return;
  }

  segments.value.push({
    key,
    label,
    allowedValues: [],
  });

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

const addFolderSegment = () => {
  const key = newFolderSegKey.value.trim().replace(/\s+/gu, "");
  const label = newFolderSegLabel.value.trim();
  if (!key || !label) return;
  if (key.includes("_")) {
    toast.add({ title: "Segment keys cannot contain underscores", color: "error" });
    return;
  }
  if (folderSegments.value.some((segment) => segment.key.toLowerCase() === key.toLowerCase())) {
    toast.add({ title: "Folder segment with this key already exists", color: "error" });
    return;
  }
  folderSegments.value.push({ key, label, allowedValues: [] });
  newFolderSegKey.value = "";
  newFolderSegLabel.value = "";
};

const deleteFolderSegment = (index: number) => {
  folderSegments.value.splice(index, 1);
};

const moveFolderSegment = (index: number, direction: number) => {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= folderSegments.value.length) return;
  const current = folderSegments.value[index];
  folderSegments.value[index] = folderSegments.value[targetIndex];
  folderSegments.value[targetIndex] = current;
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
    toast.add({
      title: "Nomenclature saved",
      description: isAdmin.value && governanceRules.value.enforceNomenclature
        ? "The naming convention is now required for every upload."
        : undefined,
      color: "success",
    });
    refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error saving", color: "error" });
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-neutral-900 dark:text-white">Upload Nomenclature</h1>
        <p class="text-neutral-500 text-sm mt-1">
          Define the file naming convention for your department.
          Files uploaded by team members will be validated against this template.
        </p>
      </div>
      <div v-if="isAdmin && deptOptions.length > 0" class="flex items-center gap-2 min-w-[200px]">
        <span class="text-sm font-medium text-neutral-400">Department:</span>
        <USelect
          v-model="selectedDept"
          :items="deptOptions"
          class="flex-1"
          placeholder="Select dept..."
        />
      </div>
    </div>


    <!-- Template preview -->
    <div class="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-5">
      <p class="text-xs text-blue-400 font-medium mb-2 uppercase tracking-wide">Current Template</p>
<code class="text-white font-mono text-sm break-all">{{ template }}</code>
      <div v-if="isAdmin" class="mt-4 flex items-center justify-between gap-4 border-t border-blue-500/20 pt-4">
        <div>
          <p class="text-sm font-medium text-neutral-900 dark:text-white">Require this format on upload</p>
          <p class="mt-1 text-xs text-neutral-500">When enabled, every filename is validated before upload and noncompliant files are rejected.</p>
        </div>
        <USwitch v-model="governanceRules.enforceNomenclature" color="primary" />
      </div>
    </div>

    <div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
      <div>
        <h2 class="text-lg font-medium text-neutral-900 dark:text-white">Allowed File Formats</h2>
        <p class="mt-1 text-xs text-neutral-500">
          Leave this empty to allow every extension. These rules apply to every uploader, including administrators.
        </p>
      </div>
      <div class="flex flex-wrap gap-2" v-if="allowedExtensionsForEditor().length">
        <UBadge
          v-for="extension in allowedExtensionsForEditor()"
          :key="extension"
          color="primary"
          variant="soft"
          class="gap-1"
        >
          .{{ extension }}
          <button type="button" :aria-label="`Remove .${extension}`" @click="removeExtension(extension)">
            <UIcon name="lucide:x" class="size-3" />
          </button>
        </UBadge>
      </div>
      <div class="flex gap-2">
        <UInput
          v-model="newExtension"
          placeholder="pdf, jpg, docx"
          class="flex-1"
          @keyup.enter="addExtension"
        />
        <UButton icon="lucide:plus" label="Add format" variant="outline" @click="addExtension" />
      </div>
    </div>
    <!-- Configure Naming Segments Panel -->
    <div class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-4">
      <h2 class="text-lg font-medium text-neutral-900 dark:text-white">Configure Naming Segments</h2>
      <p class="text-xs text-neutral-500">Add, remove, or rearrange segments for this department's naming template.</p>
      
      <!-- Current Segments reorder/delete list -->
      <div class="space-y-2">
        <div v-for="(seg, idx) in segments" :key="seg.key" class="flex items-center gap-4 bg-neutral-50 dark:bg-neutral-800 px-4 py-2 rounded-xl">
          <span class="font-mono text-sm text-neutral-400">#{{ idx + 1 }}</span>
          <div class="flex-1">
            <span class="font-medium text-sm text-neutral-900 dark:text-neutral-200">{{ seg.label }}</span>
            <span class="text-xs font-mono text-neutral-500 ml-2">({{ seg.key }})</span>
          </div>
          <!-- Reorder and Delete Actions -->
          <div class="flex items-center gap-1">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="lucide:arrow-up"
              :disabled="idx === 0"
              @click="moveSegment(idx, -1)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="lucide:arrow-down"
              :disabled="idx === segments.length - 1"
              @click="moveSegment(idx, 1)"
            />
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              icon="lucide:trash"
              @click="deleteSegment(idx)"
            />
          </div>
        </div>
      </div>

      <!-- Add New Segment Form -->
      <div class="border-t border-neutral-200 dark:border-neutral-800 pt-4 space-y-3">
        <h3 class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Add New Naming Segment</h3>
        <div class="grid grid-cols-2 gap-3">
          <UInput
            v-model="newSegKey"
            placeholder="Segment Key (e.g. Channel)"
            size="sm"
          />
          <UInput
            v-model="newSegLabel"
            placeholder="Segment Label (e.g. Channel Name)"
            size="sm"
          />
        </div>
        <UButton
          size="sm"
          color="primary"
          variant="outline"
          icon="lucide:plus"
          @click="addSegment"
          :disabled="!newSegKey || !newSegLabel"
        >
          Add Segment
        </UButton>
      </div>
    </div>

    <!-- Segments editor -->
    <div class="space-y-4">
      <div
        v-for="seg in segments"
        :key="seg.key"
        class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 space-y-3"
      >
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium text-neutral-900 dark:text-white">{{ seg.label }}</p>
            <code class="text-xs text-neutral-500 font-mono">{{ seg.key }}</code>
          </div>
          <UBadge variant="soft" color="neutral" size="sm">
            {{ allowedValuesFor(seg).length }} values
          </UBadge>
        </div>

        <!-- Allowed values -->
        <div class="flex flex-wrap gap-2">
          <div
            v-for="val in allowedValuesFor(seg)"
            :key="val"
            class="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg px-3 py-1 text-sm"
          >
            <span>{{ val }}</span>
            <button @click="removeValue(seg.key, val)" class="text-neutral-400 hover:text-red-400 ml-1">
              <UIcon name="lucide:x" class="text-xs" />
            </button>
          </div>
          <span v-if="!allowedValuesFor(seg).length" class="text-xs text-neutral-400 italic">
            Any value allowed (no restrictions)
          </span>
        </div>

        <!-- Add value input -->
        <div class="flex gap-2">
          <UInput
            v-model="newValueInputs[seg.key]"
            :placeholder="`Add allowed ${seg.label} value...`"
            size="sm"
            class="flex-1"
            @keyup.enter="addValue(seg.key)"
          />
          <UButton size="sm" color="primary" @click="addValue(seg.key)" icon="lucide:plus">
            Add
          </UButton>
        </div>
      </div>
    </div>

    <section class="space-y-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <div>
        <h2 class="text-xl font-semibold text-neutral-900 dark:text-white">Folder naming</h2>
        <p class="mt-1 text-sm text-neutral-500">
          Configure the naming pattern for manually created folders and every folder in an uploaded directory tree.
          Leave the segment list empty to keep folder naming unrestricted.
        </p>
      </div>

      <div class="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
        <p class="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-400">Folder template</p>
        <code class="break-all font-mono text-sm text-neutral-900 dark:text-white">
          {{ folderTemplatePreview || "No folder naming rule configured" }}
        </code>
      </div>

      <div class="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div class="space-y-2">
          <div
            v-for="(segment, index) in folderSegments"
            :key="segment.key"
            class="flex items-center gap-4 rounded-xl bg-neutral-50 px-4 py-2 dark:bg-neutral-800"
          >
            <span class="font-mono text-sm text-neutral-400">#{{ index + 1 }}</span>
            <div class="min-w-0 flex-1">
              <span class="text-sm font-medium text-neutral-900 dark:text-neutral-200">{{ segment.label }}</span>
              <span class="ml-2 font-mono text-xs text-neutral-500">({{ segment.key }})</span>
            </div>
            <div class="flex items-center gap-1">
              <UButton size="xs" color="neutral" variant="ghost" icon="lucide:arrow-up" :disabled="index === 0" @click="moveFolderSegment(index, -1)" />
              <UButton size="xs" color="neutral" variant="ghost" icon="lucide:arrow-down" :disabled="index === folderSegments.length - 1" @click="moveFolderSegment(index, 1)" />
              <UButton size="xs" color="error" variant="ghost" icon="lucide:trash" @click="deleteFolderSegment(index)" />
            </div>
          </div>
          <p v-if="!folderSegments.length" class="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
            No folder rule is configured. Add a segment below to enable one.
          </p>
        </div>

        <div class="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <h3 class="text-sm font-medium text-neutral-700 dark:text-neutral-300">Add folder naming segment</h3>
          <div class="grid gap-3 sm:grid-cols-2">
            <UInput v-model="newFolderSegKey" placeholder="Segment Key (e.g. Client)" size="sm" />
            <UInput v-model="newFolderSegLabel" placeholder="Segment Label (e.g. Client Name)" size="sm" />
          </div>
          <UButton
            size="sm"
            color="primary"
            variant="outline"
            icon="lucide:plus"
            :disabled="!newFolderSegKey || !newFolderSegLabel"
            @click="addFolderSegment"
          >
            Add folder segment
          </UButton>
        </div>
      </div>

      <div
        v-for="segment in folderSegments"
        :key="`folder-${segment.key}`"
        class="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium text-neutral-900 dark:text-white">{{ segment.label }}</p>
            <code class="font-mono text-xs text-neutral-500">{{ segment.key }}</code>
          </div>
          <UBadge variant="soft" color="neutral" size="sm">{{ allowedValuesFor(segment).length }} values</UBadge>
        </div>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="value in allowedValuesFor(segment)"
            :key="value"
            class="flex items-center gap-1 rounded-lg bg-neutral-100 px-3 py-1 text-sm dark:bg-neutral-800"
          >
            <span>{{ value }}</span>
            <button type="button" class="ml-1 text-neutral-400 hover:text-red-400" @click="removeFolderValue(segment.key, value)">
              <UIcon name="lucide:x" class="text-xs" />
            </button>
          </div>
          <span v-if="!allowedValuesFor(segment).length" class="text-xs italic text-neutral-400">Any value allowed (no restrictions)</span>
        </div>
        <div class="flex gap-2">
          <UInput
            v-model="newFolderValueInputs[segment.key]"
            :placeholder="`Add allowed ${segment.label} value...`"
            size="sm"
            class="flex-1"
            @keyup.enter="addFolderValue(segment.key)"
          />
          <UButton size="sm" color="primary" icon="lucide:plus" @click="addFolderValue(segment.key)">Add</UButton>
        </div>
      </div>
    </section>

    <div class="flex justify-end">
      <UButton
        color="primary"
        variant="solid"
        size="lg"
        :loading="saving"
        @click="save"
        icon="lucide:save"
      >
        Save Nomenclature
      </UButton>
    </div>
  </div>
</template>
