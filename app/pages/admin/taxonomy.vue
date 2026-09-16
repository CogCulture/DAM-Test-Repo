<script setup lang="ts">
import { ref, watch } from "vue";
import { useRole } from "~/composables/useRole";
import { useToast } from "~/composables/useToast";

const { isAdmin, isDeptHead } = useRole();
const toast = useToast();

if (!isAdmin.value && !isDeptHead.value) {
  navigateTo("/");
}

interface ITaxonomy {
  id: string;
  name: string;
  key: string;
  type: "text" | "select" | "multiselect";
  options?: string[] | null;
  isRequired?: boolean;
}

const { data: taxonomies, refresh } = await useFetch<ITaxonomy[]>("/api/taxonomies");

const showAddForm = ref(false);
const saving = ref(false);
const newTaxonomy = ref({
  name: "",
  key: "",
  type: "select" as "text" | "select" | "multiselect",
  options: [] as string[],
  isRequired: false,
});
const newOptionInput = ref("");

const typeOptions = [
  { value: "text", label: "Free Text" },
  { value: "select", label: "Single Select (Dropdown)" },
  { value: "multiselect", label: "Multi Select" },
];

watch(() => newTaxonomy.value.name, (name) => {
  newTaxonomy.value.key = name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
});

const addOption = () => {
  const opt = newOptionInput.value.trim();
  if (opt && !newTaxonomy.value.options.includes(opt)) {
    newTaxonomy.value.options.push(opt);
  }
  newOptionInput.value = "";
};

const removeOption = (opt: string) => {
  newTaxonomy.value.options = newTaxonomy.value.options.filter((o) => o !== opt);
};

const createTaxonomy = async () => {
  if (!newTaxonomy.value.name || !newTaxonomy.value.key) {
    toast.add({ title: "Name and key are required", color: "error" });
    return;
  }
  saving.value = true;
  try {
    await $fetch("/api/taxonomies", {
      method: "POST",
      body: {
        name: newTaxonomy.value.name,
        key: newTaxonomy.value.key,
        type: newTaxonomy.value.type,
        options: newTaxonomy.value.type !== "text" ? newTaxonomy.value.options : undefined,
        isRequired: newTaxonomy.value.isRequired,
      },
    });
    toast.add({ title: "Taxonomy field created", color: "success" });
    newTaxonomy.value = { name: "", key: "", type: "select", options: [], isRequired: false };
    newOptionInput.value = "";
    showAddForm.value = false;
    refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error creating field", color: "error" });
  } finally {
    saving.value = false;
  }
};

const deletingId = ref<string | null>(null);
const deleteTaxonomy = async (id: string) => {
  deletingId.value = id;
  try {
    await $fetch(`/api/taxonomies/${id}`, { method: "DELETE" });
    toast.add({ title: "Taxonomy field deleted", color: "success" });
    refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error deleting field", color: "error" });
  } finally {
    deletingId.value = null;
  }
};

const editingId = ref<string | null>(null);
const editBuffer = ref<Partial<ITaxonomy>>({});
const editOptionInput = ref("");

const startEdit = (t: ITaxonomy) => {
  editingId.value = t.id;
  editBuffer.value = { name: t.name, type: t.type, options: [...(t.options ?? [])], isRequired: t.isRequired };
};
const addEditOption = () => {
  const opt = editOptionInput.value.trim();
  if (opt && !(editBuffer.value.options ?? []).includes(opt)) {
    editBuffer.value.options = [...(editBuffer.value.options ?? []), opt];
  }
  editOptionInput.value = "";
};
const removeEditOption = (opt: string) => {
  editBuffer.value.options = (editBuffer.value.options ?? []).filter((o) => o !== opt);
};

const saveEdit = async (id: string) => {
  saving.value = true;
  try {
    await $fetch(`/api/taxonomies/${id}`, {
      method: "PUT",
      body: editBuffer.value,
    });
    toast.add({ title: "Taxonomy field updated", color: "success" });
    editingId.value = null;
    refresh();
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error updating field", color: "error" });
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <AppMain title="Taxonomy & Controlled Vocabulary" description="Define structured metadata fields and controlled vocabularies across all media assets.">
    <div class="max-w-4xl mx-auto space-y-6">
      <div class="flex items-center justify-end">
        <UButton
          icon="lucide:plus"
          color="primary"
          variant="solid"
          class="rounded-xl shadow-sm"
          @click="showAddForm = !showAddForm"
        >
          Add Metadata Field
        </UButton>
      </div>

      <!-- Add form -->
      <div v-if="showAddForm" class="bg-[var(--dam-panel-solid)] border border-indigo-500/30 rounded-2xl p-6 space-y-4 shadow-md">
        <h2 class="text-base font-bold text-[var(--dam-ink)]">New Custom Metadata Field</h2>
        <div class="grid grid-cols-2 gap-3">
          <input v-model="newTaxonomy.name" type="text" placeholder="Field Name (e.g. Campaign)" class="rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] px-4 py-2.5 text-sm text-[var(--dam-ink)]" />
          <input v-model="newTaxonomy.key" type="text" placeholder="Field Key (auto-generated)" class="rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] px-4 py-2.5 text-sm font-mono text-[var(--dam-ink)]" />
        </div>

        <select v-model="newTaxonomy.type" class="w-full rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] px-4 py-2.5 text-sm text-[var(--dam-ink)]">
          <option value="text">Free Text</option>
          <option value="select">Single Select (Dropdown)</option>
          <option value="multiselect">Multi Select</option>
        </select>

        <USwitch v-model="newTaxonomy.isRequired" label="Required field for uploads" />

        <div v-if="newTaxonomy.type !== 'text'" class="space-y-2">
          <div class="text-xs font-bold text-[var(--dam-ink-muted)] uppercase tracking-wider">Allowed Values</div>
          <div class="flex flex-wrap gap-2">
            <span v-for="opt in newTaxonomy.options" :key="opt" class="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold">
              {{ opt }}
              <button @click="removeOption(opt)"><Icon name="lucide:x" class="size-3 hover:text-red-400" /></button>
            </span>
          </div>
          <div class="flex gap-2">
            <input v-model="newOptionInput" type="text" placeholder="Add value..." class="flex-1 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] px-3 py-2 text-xs text-[var(--dam-ink)]" @keyup.enter="addOption" />
            <UButton size="xs" icon="lucide:plus" color="primary" class="rounded-lg" @click="addOption" />
          </div>
        </div>

        <div class="flex gap-2 pt-2">
          <UButton color="primary" variant="solid" class="rounded-xl" :loading="saving" icon="lucide:save" @click="createTaxonomy">Create Field</UButton>
          <UButton color="neutral" variant="ghost" class="rounded-xl" @click="showAddForm = false">Cancel</UButton>
        </div>
      </div>

      <!-- List of existing -->
      <div v-if="taxonomies && taxonomies.length > 0" class="bg-[var(--dam-panel-solid)] border border-[var(--dam-line)] rounded-2xl divide-y divide-[var(--dam-line)] shadow-sm">
        <div v-for="taxonomy in taxonomies" :key="taxonomy.id" class="p-5 space-y-3">
          <template v-if="editingId !== taxonomy.id">
            <div class="flex items-start justify-between">
              <div>
                <p class="font-bold text-[var(--dam-ink)]">
                  {{ taxonomy.name }}
                  <span v-if="taxonomy.isRequired" class="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">Required</span>
                </p>
                <div class="flex items-center gap-2 mt-1">
                  <code class="text-xs text-[var(--dam-ink-muted)] font-mono">{{ taxonomy.key }}</code>
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--dam-bg)] text-[var(--dam-ink-muted)] border border-[var(--dam-line)]">{{ taxonomy.type }}</span>
                </div>
              </div>
              <div class="flex gap-1">
                <UButton size="xs" icon="lucide:pencil" variant="ghost" color="neutral" @click="startEdit(taxonomy)" />
                <UButton size="xs" icon="lucide:trash" variant="ghost" color="error" :loading="deletingId === taxonomy.id" @click="deleteTaxonomy(taxonomy.id)" />
              </div>
            </div>
            <div v-if="taxonomy.options && taxonomy.options.length > 0" class="flex flex-wrap gap-1.5">
              <span v-for="opt in taxonomy.options" :key="opt" class="text-xs bg-[var(--dam-bg)] border border-[var(--dam-line)] rounded-lg px-2.5 py-1 text-[var(--dam-ink)]">
                {{ opt }}
              </span>
            </div>
            <p v-else class="text-xs text-[var(--dam-ink-muted)] italic">Free text format</p>
          </template>

          <template v-else>
            <div class="space-y-3">
              <input v-model="editBuffer.name" type="text" class="w-full rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] px-4 py-2 text-sm text-[var(--dam-ink)]" />
              <div class="flex gap-2">
                <UButton size="sm" color="primary" variant="solid" class="rounded-xl" :loading="saving" icon="lucide:save" @click="saveEdit(taxonomy.id)">Save</UButton>
                <UButton size="sm" color="neutral" variant="ghost" class="rounded-xl" @click="editingId = null">Cancel</UButton>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </AppMain>
</template>
