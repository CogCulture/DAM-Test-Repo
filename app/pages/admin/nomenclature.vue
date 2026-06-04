<script setup lang="ts">

const { canEditNomenclature, departmentId, isDeptHead, isAdmin } = useRole();
const toast = useToast();

if (!canEditNomenclature.value) {
  navigateTo("/");
}

const selectedDept = ref(departmentId.value ?? "");
const departmentsList = ref<{ id: string; name: string }[]>([]);
const loadingDepartments = ref(false);

onMounted(async () => {
  if (isAdmin.value) {
    loadingDepartments.value = true;
    try {
      const data: any = await $fetch("/api/organizations/settings");
      departmentsList.value = data.departments || [];
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
const newValueInputs = ref<Record<string, string>>({});
const saving = ref(false);

watch(
  nomenclature,
  (val) => {
    if (val?.segments) {
      segments.value = JSON.parse(JSON.stringify(val.segments));
    } else {
      segments.value = [];
    }
  },
  { immediate: true }
);

const template = computed(() =>
  segments.value.map((s) => s.key).join("_")
);

const addValue = (segKey: string) => {
  const val = newValueInputs.value[segKey]?.trim();
  if (!val) return;
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

const newSegKey = ref("");
const newSegLabel = ref("");

const addSegment = () => {
  const key = newSegKey.value.trim().replace(/\s+/g, "");
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

const save = async () => {
  if (!selectedDept.value) {
    toast.add({ title: "Please select a department first", color: "error" });
    return;
  }
  saving.value = true;
  try {
    await $fetch(`/api/nomenclature/${selectedDept.value}`, {
      method: "PUT",
      body: { template: template.value, segments: segments.value },
    });
    toast.add({ title: "Nomenclature saved", color: "success" });
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
            {{ seg.allowedValues.length }} values
          </UBadge>
        </div>

        <!-- Allowed values -->
        <div class="flex flex-wrap gap-2">
          <div
            v-for="val in seg.allowedValues"
            :key="val"
            class="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg px-3 py-1 text-sm"
          >
            <span>{{ val }}</span>
            <button @click="removeValue(seg.key, val)" class="text-neutral-400 hover:text-red-400 ml-1">
              <UIcon name="lucide:x" class="text-xs" />
            </button>
          </div>
          <span v-if="!seg.allowedValues.length" class="text-xs text-neutral-400 italic">
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
