<script setup lang="ts">
import { useRole } from '~/composables/useRole';

const { isAdmin, isDeptHead } = useRole();
const toast = useToast();

// Only admins and dept heads can access this page
if (!isAdmin.value && !isDeptHead.value) {
  navigateTo('/');
}

const { data: taxonomies, refresh } = await useFetch<ITaxonomy[]>('/api/taxonomies');

// New taxonomy form
const showAddForm = ref(false);
const saving = ref(false);
const newTaxonomy = ref({
  name: '',
  key: '',
  type: 'select' as 'text' | 'select' | 'multiselect',
  options: [] as string[],
  isRequired: false,
});
const newOptionInput = ref('');

const typeOptions = [
  { value: 'text', label: 'Free Text' },
  { value: 'select', label: 'Single Select (Dropdown)' },
  { value: 'multiselect', label: 'Multi Select' },
];

// Auto-generate key from name
watch(() => newTaxonomy.value.name, (name) => {
  newTaxonomy.value.key = name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
});

const addOption = () => {
  const opt = newOptionInput.value.trim();
  if (opt && !newTaxonomy.value.options.includes(opt)) {
    newTaxonomy.value.options.push(opt);
  }
  newOptionInput.value = '';
};

const removeOption = (opt: string) => {
  newTaxonomy.value.options = newTaxonomy.value.options.filter((o) => o !== opt);
};

const createTaxonomy = async () => {
  if (!newTaxonomy.value.name || !newTaxonomy.value.key) {
    toast.add({ title: 'Name and key are required', color: 'error' });
    return;
  }
  saving.value = true;
  try {
    await $fetch('/api/taxonomies', {
      method: 'POST',
      body: {
        name: newTaxonomy.value.name,
        key: newTaxonomy.value.key,
        type: newTaxonomy.value.type,
        options: newTaxonomy.value.type !== 'text' ? newTaxonomy.value.options : undefined,
        isRequired: newTaxonomy.value.isRequired,
      },
    });
    toast.add({ title: 'Taxonomy field created', color: 'success' });
    newTaxonomy.value = { name: '', key: '', type: 'select', options: [], isRequired: false };
    newOptionInput.value = '';
    showAddForm.value = false;
    refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? 'Error creating field', color: 'error' });
  } finally {
    saving.value = false;
  }
};

const deletingId = ref<string | null>(null);
const deleteTaxonomy = async (id: string) => {
  deletingId.value = id;
  try {
    await $fetch(`/api/taxonomies/${id}`, { method: 'DELETE' });
    toast.add({ title: 'Taxonomy field deleted', color: 'success' });
    refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? 'Error deleting field', color: 'error' });
  } finally {
    deletingId.value = null;
  }
};

// Inline editing of an existing taxonomy
const editingId = ref<string | null>(null);
const editBuffer = ref<Partial<ITaxonomy>>({});
const editOptionInput = ref('');

const startEdit = (t: ITaxonomy) => {
  editingId.value = t.id;
  editBuffer.value = { name: t.name, type: t.type, options: [...(t.options ?? [])], isRequired: t.isRequired };
};
const addEditOption = () => {
  const opt = editOptionInput.value.trim();
  if (opt && !(editBuffer.value.options ?? []).includes(opt)) {
    editBuffer.value.options = [...(editBuffer.value.options ?? []), opt];
  }
  editOptionInput.value = '';
};
const removeEditOption = (opt: string) => {
  editBuffer.value.options = (editBuffer.value.options ?? []).filter((o) => o !== opt);
};

const saveEdit = async (id: string) => {
  saving.value = true;
  try {
    await $fetch(`/api/taxonomies/${id}`, {
      method: 'PUT',
      body: editBuffer.value,
    });
    toast.add({ title: 'Taxonomy field updated', color: 'success' });
    editingId.value = null;
    refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? 'Error updating field', color: 'error' });
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-neutral-900 dark:text-white">Taxonomy & Metadata Fields</h1>
        <p class="text-neutral-500 text-sm mt-1">
          Define controlled vocabulary fields to enforce consistent metadata across all assets.
        </p>
      </div>
      <UButton
        icon="lucide:plus"
        color="primary"
        @click="showAddForm = !showAddForm"
      >
        Add Field
      </UButton>
    </div>

    <!-- Add new taxonomy form -->
    <div
      v-if="showAddForm"
      class="bg-white dark:bg-neutral-900 border border-primary-500/30 rounded-2xl p-5 space-y-4"
    >
      <h2 class="text-lg font-medium text-neutral-900 dark:text-white">New Metadata Field</h2>

      <div class="grid grid-cols-2 gap-3">
        <UInput v-model="newTaxonomy.name" placeholder="Field Name (e.g. Campaign)" size="sm" />
        <UInput v-model="newTaxonomy.key" placeholder="Field Key (auto-generated)" size="sm" />
      </div>

      <USelect
        v-model="newTaxonomy.type"
        :items="typeOptions"
        placeholder="Field Type"
        size="sm"
      />

      <USwitch v-model="newTaxonomy.isRequired" label="Required field" />

      <!-- Options for select/multiselect -->
      <div v-if="newTaxonomy.type !== 'text'" class="space-y-2">
        <div class="text-xs text-neutral-500 font-medium uppercase tracking-wide">Allowed Values</div>
        <div class="flex flex-wrap gap-1.5">
          <div
            v-for="opt in newTaxonomy.options"
            :key="opt"
            class="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg px-2.5 py-1 text-sm"
          >
            <span>{{ opt }}</span>
            <button @click="removeOption(opt)" class="text-neutral-400 hover:text-red-400 ml-1">
              <UIcon name="lucide:x" class="w-3 h-3" />
            </button>
          </div>
          <span v-if="!newTaxonomy.options.length" class="text-xs text-neutral-400 italic">No options yet (any value allowed)</span>
        </div>
        <div class="flex gap-2">
          <UInput v-model="newOptionInput" placeholder="Add allowed value..." size="xs" class="flex-1" @keyup.enter="addOption" />
          <UButton size="xs" icon="lucide:plus" color="primary" @click="addOption" />
        </div>
      </div>

      <div class="flex gap-2 pt-2">
        <UButton color="primary" :loading="saving" icon="lucide:save" @click="createTaxonomy">Create Field</UButton>
        <UButton color="neutral" variant="ghost" @click="showAddForm = false">Cancel</UButton>
      </div>
    </div>

    <!-- List of existing taxonomy fields -->
    <div
      v-if="taxonomies && taxonomies.length > 0"
      class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl divide-y divide-neutral-200 dark:divide-neutral-800"
    >
      <div
        v-for="taxonomy in taxonomies"
        :key="taxonomy.id"
        class="p-5 space-y-3"
      >
        <!-- View mode -->
        <template v-if="editingId !== taxonomy.id">
          <div class="flex items-start justify-between">
            <div>
              <p class="font-medium text-neutral-900 dark:text-white">
                {{ taxonomy.name }}
                <UBadge v-if="taxonomy.isRequired" color="warning" variant="soft" size="xs" class="ml-2">Required</UBadge>
              </p>
              <div class="flex items-center gap-2 mt-0.5">
                <code class="text-xs text-neutral-500 font-mono">{{ taxonomy.key }}</code>
                <UBadge variant="outline" size="xs" color="neutral">{{ taxonomy.type }}</UBadge>
              </div>
            </div>
            <div class="flex gap-1">
              <UButton size="xs" icon="lucide:pencil" variant="ghost" color="neutral" @click="startEdit(taxonomy)" />
              <UButton size="xs" icon="lucide:trash" variant="ghost" color="error" :loading="deletingId === taxonomy.id" @click="deleteTaxonomy(taxonomy.id)" />
            </div>
          </div>
          <div v-if="taxonomy.options && taxonomy.options.length > 0" class="flex flex-wrap gap-1.5">
            <span
              v-for="opt in taxonomy.options"
              :key="opt"
              class="text-xs bg-neutral-100 dark:bg-neutral-800 rounded-full px-2.5 py-0.5 text-neutral-700 dark:text-neutral-300"
            >
              {{ opt }}
            </span>
          </div>
          <p v-else class="text-xs text-neutral-400 italic">Free text — no vocabulary restrictions</p>
        </template>

        <!-- Edit mode -->
        <template v-else>
          <div class="space-y-3">
            <UInput v-model="editBuffer.name" placeholder="Field Name" size="sm" />
            <USelect v-model="editBuffer.type" :items="typeOptions" size="sm" />
            <USwitch v-model="editBuffer.isRequired" label="Required field" />
            <div v-if="editBuffer.type !== 'text'" class="space-y-2">
              <div class="text-xs text-neutral-500 uppercase tracking-wide">Allowed Values</div>
              <div class="flex flex-wrap gap-1.5">
                <div
                  v-for="opt in editBuffer.options"
                  :key="opt"
                  class="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg px-2.5 py-1 text-sm"
                >
                  <span>{{ opt }}</span>
                  <button @click="removeEditOption(opt)" class="text-neutral-400 hover:text-red-400 ml-1">
                    <UIcon name="lucide:x" class="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div class="flex gap-2">
                <UInput v-model="editOptionInput" placeholder="Add value..." size="xs" class="flex-1" @keyup.enter="addEditOption" />
                <UButton size="xs" icon="lucide:plus" color="primary" @click="addEditOption" />
              </div>
            </div>
            <div class="flex gap-2">
              <UButton size="sm" color="primary" :loading="saving" icon="lucide:save" @click="saveEdit(taxonomy.id)">Save</UButton>
              <UButton size="sm" color="neutral" variant="ghost" @click="editingId = null">Cancel</UButton>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div
      v-else
      class="text-center py-12 text-neutral-400 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-2xl"
    >
      <UIcon name="lucide:tag" class="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p class="text-sm">No taxonomy fields defined yet.</p>
      <p class="text-xs mt-1">Click "Add Field" to define your first controlled vocabulary.</p>
    </div>
  </div>
</template>
