<script setup lang="ts">
import { useToast } from "~/composables/useToast";
import { formatBytes } from "~/utils/helper";

const props = defineProps<{
  file: IFile;
}>();

const emit = defineEmits<{ (e: 'updated', file: IFile): void }>();

const toast = useToast();
const { data: taxonomies } = await useFetch<ITaxonomy[]>('/api/taxonomies');

// Local editable copies of tags and custom metadata
const editingMeta = ref(false);
const localTags = ref<string[]>([...(props.file.tags ?? [])]);
const localMeta = ref<Record<string, any>>({ ...(props.file.customMetadata ?? {}) });
const newTagInput = ref('');
const saving = ref(false);

watch(() => props.file, (f) => {
  localTags.value = [...(f.tags ?? [])];
  localMeta.value = { ...(f.customMetadata ?? {}) };
});

const addTag = () => {
  const tag = newTagInput.value.trim();
  if (tag && !localTags.value.includes(tag)) {
    localTags.value.push(tag);
  }
  newTagInput.value = '';
};

const removeTag = (tag: string) => {
  localTags.value = localTags.value.filter((t) => t !== tag);
};

const saveMetadata = async () => {
  saving.value = true;
  try {
    const updated = await $fetch<IFile>(`/api/files/org/metadata/${props.file.id}`, {
      method: 'PATCH',
      body: {
        tags: localTags.value,
        customMetadata: localMeta.value,
      },
    });
    toast.add({ title: 'Metadata saved', color: 'success' });
    emit('updated', updated);
    editingMeta.value = false;
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? 'Error saving metadata', color: 'error' });
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="flex flex-col items-start justify-start gap-4 h-full p-6">
    <div>
      <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase">
        File Path
      </div>
      <div class="text-neutral-700 dark:text-neutral-200 font-light break-all">
        {{ file?.path }}
      </div>
    </div>
    <div>
      <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase">
        File Size
      </div>
      <div class="text-neutral-700 dark:text-neutral-200 font-light">
        {{ formatBytes(file?.size ?? 0) }}
      </div>
    </div>
    <div>
      <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase">Type</div>
      <div class="text-neutral-700 dark:text-neutral-200 font-light">{{ file?.type }}</div>
    </div>
    <div>
      <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase">
        Content Type
      </div>
      <div class="text-neutral-700 dark:text-neutral-200 font-light">
        {{ file?.contentType }}
      </div>
    </div>
    <div>
      <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase">
        Visibility
      </div>
      <div class="text-neutral-700 dark:text-neutral-200 font-light">
        {{ file?.visibility }}
      </div>
    </div>
    <div>
      <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase">
        Added On
      </div>
      <div class="text-neutral-700 dark:text-neutral-200 font-light">
        {{ file?.createdAt }}
      </div>
    </div>
    <div v-if="file?.updatedAt !== file?.createdAt">
      <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase">
        Modified On
      </div>
      <div class="text-neutral-700 dark:text-neutral-200 font-light">
        {{ file?.updatedAt }}
      </div>
    </div>

    <!-- Auto-extracted asset metadata (read-only) -->
    <div v-if="file?.assetMetadata && Object.keys(file.assetMetadata).length > 0" class="w-full mt-4 border-t border-neutral-200/70 dark:border-neutral-700 pt-4">
      <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase mb-3">
        Asset Metadata
      </div>
      <div class="space-y-3">
        <div v-for="(val, key) in file.assetMetadata" :key="key" class="flex flex-col">
          <span class="text-[10px] text-neutral-500 uppercase tracking-wider">{{ key }}</span>
          <span class="text-sm text-neutral-700 dark:text-neutral-200 font-light break-all">{{ val }}</span>
        </div>
      </div>
    </div>

    <!-- Phase 3: Tags & Custom Metadata section -->
    <div class="w-full mt-4 border-t border-neutral-200/70 dark:border-neutral-700 pt-4">
      <div class="flex items-center justify-between mb-3">
        <div class="text-neutral-950 dark:text-neutral-400 text-xs font-semibold uppercase">
          Tags &amp; Metadata
        </div>
        <UButton
          size="xs"
          :icon="editingMeta ? 'lucide:x' : 'lucide:pencil'"
          variant="ghost"
          color="neutral"
          @click="editingMeta = !editingMeta"
        />
      </div>

      <!-- Tags -->
      <div class="mb-4">
        <div class="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Tags</div>
        <div class="flex flex-wrap gap-1.5 mb-2">
          <span
            v-for="tag in localTags"
            :key="tag"
            class="inline-flex items-center gap-1 bg-primary-500/10 text-primary-600 dark:text-primary-400 text-xs rounded-full px-2.5 py-0.5"
          >
            {{ tag }}
            <button v-if="editingMeta" @click="removeTag(tag)" class="hover:text-red-500 ml-0.5">
              <UIcon name="lucide:x" class="w-3 h-3" />
            </button>
          </span>
          <span v-if="!localTags.length" class="text-xs text-neutral-400 italic">No tags</span>
        </div>
        <div v-if="editingMeta" class="flex gap-2">
          <UInput
            v-model="newTagInput"
            placeholder="Add a tag..."
            size="xs"
            class="flex-1"
            @keyup.enter="addTag"
          />
          <UButton size="xs" icon="lucide:plus" color="primary" @click="addTag" />
        </div>
      </div>

      <!-- Custom Metadata Fields from Taxonomies -->
      <div v-if="taxonomies && taxonomies.length > 0" class="space-y-3">
        <div
          v-for="taxonomy in taxonomies"
          :key="taxonomy.id"
          class="flex flex-col gap-1"
        >
          <label class="text-[10px] text-neutral-500 uppercase tracking-wider">
            {{ taxonomy.name }}
            <span v-if="taxonomy.isRequired" class="text-red-400 ml-0.5">*</span>
          </label>

          <!-- Read-only mode -->
          <template v-if="!editingMeta">
            <span class="text-sm text-neutral-700 dark:text-neutral-200 font-light">
              {{ localMeta[taxonomy.key] ?? '—' }}
            </span>
          </template>

          <!-- Edit mode: text -->
          <UInput
            v-else-if="taxonomy.type === 'text'"
            v-model="localMeta[taxonomy.key]"
            :placeholder="`Enter ${taxonomy.name}...`"
            size="xs"
          />

          <!-- Edit mode: select -->
          <USelect
            v-else-if="taxonomy.type === 'select'"
            v-model="localMeta[taxonomy.key]"
            :items="taxonomy.options ?? []"
            :placeholder="`Select ${taxonomy.name}...`"
            size="xs"
          />

          <!-- Edit mode: multiselect -->
          <USelectMenu
            v-else-if="taxonomy.type === 'multiselect'"
            v-model="localMeta[taxonomy.key]"
            :items="taxonomy.options ?? []"
            multiple
            :placeholder="`Select ${taxonomy.name}...`"
            size="xs"
          />
        </div>
      </div>

      <!-- Save / Cancel buttons when editing -->
      <div v-if="editingMeta" class="flex gap-2 mt-4">
        <UButton
          color="primary"
          size="sm"
          :loading="saving"
          icon="lucide:save"
          @click="saveMetadata"
        >
          Save
        </UButton>
        <UButton
          color="neutral"
          size="sm"
          variant="ghost"
          @click="editingMeta = false"
        >
          Cancel
        </UButton>
      </div>
    </div>
  </div>
</template>
