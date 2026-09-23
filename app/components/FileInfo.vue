<script setup lang="ts">
import { ref, watch } from "vue";
import { useToast } from "~/composables/useToast";
import { formatBytes } from "~/utils/helper";

const props = defineProps<{
  file: IFile;
}>();

const emit = defineEmits<{ (e: "updated", file: IFile): void }>();
const route = useRoute();
const toast = useToast();
const { data: taxonomies } = await useFetch<ITaxonomy[]>("/api/taxonomies", { key: "file-info-taxonomies" });

const editingMeta = ref(false);
const localTags = ref<string[]>([...(props.file.tags ?? [])]);
const localMeta = ref<Record<string, any>>({ ...(props.file.customMetadata ?? {}) });
const newTagInput = ref("");
const saving = ref(false);

const isRagIndexed = computed(() => {
  const meta = (props.file?.assetMetadata as Record<string, any>) || {};
  return Boolean(
    meta.ragProcessedAt ||
    meta.ragStatus === "processed" ||
    meta.parsedFileId ||
    meta.ragCost !== undefined
  );
});

watch(() => props.file, (f) => {
  localTags.value = [...(f.tags ?? [])];
  localMeta.value = { ...(f.customMetadata ?? {}) };
}, { deep: true });

const addTag = () => {
  const tag = newTagInput.value.trim();
  if (tag && !localTags.value.includes(tag)) {
    localTags.value.push(tag);
  }
  newTagInput.value = "";
};

const removeTag = (tag: string) => {
  localTags.value = localTags.value.filter((t) => t !== tag);
};

const saveMetadata = async () => {
  saving.value = true;
  try {
    const activeBucket = String(route.params.bucket || props.file.bucketName || "org");
    const updated = await $fetch<IFile>(`/api/files/${encodeURIComponent(activeBucket)}/metadata/${props.file.id}`, {
      method: "PATCH",
      body: {
        tags: localTags.value,
        customMetadata: localMeta.value,
      },
    });
    toast.add({ title: "Tags & Custom Metadata saved!", color: "success" });
    emit("updated", updated);
    editingMeta.value = false;
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? "Error saving metadata", color: "error" });
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="flex flex-col items-start justify-start gap-4 h-full p-6 text-[var(--dam-ink)]">
    <div>
      <div class="text-[var(--dam-ink-muted)] text-[10px] font-bold uppercase tracking-wider">
        File Path
      </div>
      <div class="text-[var(--dam-ink)] font-semibold text-sm break-all">
        {{ file?.path }}
      </div>
    </div>
    <div>
      <div class="text-[var(--dam-ink-muted)] text-[10px] font-bold uppercase tracking-wider">
        File Size
      </div>
      <div class="text-[var(--dam-ink)] font-semibold text-sm">
        {{ formatBytes(file?.size ?? 0) }}
      </div>
    </div>
    <div>
      <div class="text-[var(--dam-ink-muted)] text-[10px] font-bold uppercase tracking-wider">Type</div>
      <div class="text-[var(--dam-ink)] font-semibold text-sm">{{ file?.type }}</div>
    </div>
    <div>
      <div class="text-[var(--dam-ink-muted)] text-[10px] font-bold uppercase tracking-wider">
        Content Type
      </div>
      <div class="text-[var(--dam-ink)] font-semibold text-sm">
        {{ file?.contentType }}
      </div>
    </div>
    <div>
      <div class="text-[var(--dam-ink-muted)] text-[10px] font-bold uppercase tracking-wider">
        Visibility
      </div>
      <div class="text-[var(--dam-ink)] font-semibold text-sm capitalize">
        {{ file?.visibility }}
      </div>
    </div>
    <div>
      <div class="text-[var(--dam-ink-muted)] text-[10px] font-bold uppercase tracking-wider">
        Added On
      </div>
      <div class="text-[var(--dam-ink)] font-semibold text-sm">
        {{ file?.createdAt }}
      </div>
    </div>

    <!-- AI / RAG Intelligence Status -->
    <div v-if="isRagIndexed" class="w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 shadow-sm">
      <div class="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300">
        <Icon name="lucide:bot" class="size-4" />
        <span>Indexed in RAG</span>
      </div>
      <p class="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
        This document is indexed in the RAG knowledge base and searchable via Smart Search.
      </p>
      <div v-if="file?.assetMetadata?.ragProcessedAt" class="mt-2 text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
        Indexed on: {{ new Date(file.assetMetadata.ragProcessedAt).toLocaleString() }}
      </div>
    </div>

    <!-- Auto-extracted asset metadata -->
    <div v-if="file?.assetMetadata && Object.keys(file.assetMetadata).length > 0" class="w-full mt-4 border-t border-[var(--dam-line)] pt-4">
      <div class="text-[var(--dam-ink-muted)] text-[10px] font-bold uppercase tracking-wider mb-3">
        Auto EXIF & Asset Attributes
      </div>
      <div class="space-y-2">
        <div v-for="(val, key) in file.assetMetadata" :key="key" class="flex items-center justify-between text-xs">
          <span class="text-[var(--dam-ink-muted)] font-medium uppercase text-[10px]">{{ key }}:</span>
          <span class="text-[var(--dam-ink)] font-semibold truncate max-w-[200px]">{{ val }}</span>
        </div>
      </div>
    </div>

    <!-- Tags & Custom Metadata Controlled Vocabulary -->
    <div class="w-full mt-4 border-t border-[var(--dam-line)] pt-4">
      <div class="flex items-center justify-between mb-3">
        <div class="text-[var(--dam-ink)] text-xs font-bold uppercase tracking-wider">
          Taxonomy & Custom Metadata
        </div>
        <UButton
          size="xs"
          :icon="editingMeta ? 'lucide:x' : 'lucide:pencil'"
          variant="ghost"
          color="neutral"
          class="rounded-lg"
          @click="editingMeta = !editingMeta"
        />
      </div>

      <!-- Tags -->
      <div class="mb-4 space-y-2">
        <div class="text-[10px] font-bold text-[var(--dam-ink-muted)] uppercase tracking-wider">Tags</div>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="tag in localTags"
            :key="tag"
            class="inline-flex items-center gap-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold rounded-xl px-2.5 py-1"
          >
            #{{ tag }}
            <button v-if="editingMeta" @click="removeTag(tag)" class="hover:text-red-400 ml-0.5">
              <Icon name="lucide:x" class="size-3" />
            </button>
          </span>
          <span v-if="!localTags.length" class="text-xs text-[var(--dam-ink-muted)] italic">No tags assigned</span>
        </div>
        <div v-if="editingMeta" class="flex gap-2">
          <input
            v-model="newTagInput"
            type="text"
            placeholder="Add tag..."
            class="flex-1 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-bg)] px-3 py-1.5 text-xs text-[var(--dam-ink)]"
            @keyup.enter="addTag"
          />
          <UButton size="xs" icon="lucide:plus" color="primary" class="rounded-xl" @click="addTag" />
        </div>
      </div>

      <!-- Custom Metadata Fields from Taxonomies -->
      <div v-if="taxonomies && taxonomies.length > 0" class="space-y-3">
        <div
          v-for="taxonomy in taxonomies"
          :key="taxonomy.id"
          class="flex flex-col gap-1 bg-[var(--dam-panel-raised)] border border-[var(--dam-line)] p-3 rounded-xl"
        >
          <label class="text-[10px] font-bold text-[var(--dam-ink-muted)] uppercase tracking-wider">
            {{ taxonomy.name }}
            <span v-if="taxonomy.isRequired" class="text-red-400 font-bold ml-0.5">*</span>
          </label>

          <!-- Read-only mode -->
          <template v-if="!editingMeta">
            <span class="text-xs font-bold text-[var(--dam-ink)]">
              {{ localMeta[taxonomy.key] ?? '—' }}
            </span>
          </template>

          <!-- Edit mode: text -->
          <input
            v-else-if="taxonomy.type === 'text'"
            v-model="localMeta[taxonomy.key]"
            type="text"
            :placeholder="`Enter ${taxonomy.name}...`"
            class="w-full rounded-lg border border-[var(--dam-line)] bg-[var(--dam-bg)] px-3 py-1.5 text-xs text-[var(--dam-ink)]"
          />

          <!-- Edit mode: select -->
          <select
            v-else-if="taxonomy.type === 'select'"
            v-model="localMeta[taxonomy.key]"
            class="w-full rounded-lg border border-[var(--dam-line)] bg-[var(--dam-bg)] px-3 py-1.5 text-xs text-[var(--dam-ink)]"
          >
            <option value="">Select {{ taxonomy.name }}...</option>
            <option v-for="opt in taxonomy.options || []" :key="opt" :value="opt">
              {{ opt }}
            </option>
          </select>

          <!-- Edit mode: multiselect -->
          <select
            v-else-if="taxonomy.type === 'multiselect'"
            v-model="localMeta[taxonomy.key]"
            multiple
            class="w-full rounded-lg border border-[var(--dam-line)] bg-[var(--dam-bg)] px-3 py-1.5 text-xs text-[var(--dam-ink)] min-h-[60px]"
          >
            <option v-for="opt in taxonomy.options || []" :key="opt" :value="opt">
              {{ opt }}
            </option>
          </select>
        </div>
      </div>
      <div v-else class="text-xs text-[var(--dam-ink-muted)] italic">
        No controlled taxonomy fields configured yet. Go to Governance &gt; Taxonomy to define metadata schema fields.
      </div>

      <!-- Save / Cancel buttons when editing -->
      <div v-if="editingMeta" class="flex gap-2 mt-4">
        <UButton
          color="primary"
          size="sm"
          class="rounded-xl"
          :loading="saving"
          icon="lucide:save"
          @click="saveMetadata"
        >
          Save Metadata
        </UButton>
        <UButton
          color="neutral"
          size="sm"
          variant="ghost"
          class="rounded-xl"
          @click="editingMeta = false"
        >
          Cancel
        </UButton>
      </div>
    </div>
  </div>
</template>
