<script setup lang="ts">
type Segment = { key: string; label: string; allowedValues: string[] };
type Policy = { segments: Segment[]; folderSegments: Segment[]; allowedExtensions: string[]; enforceNomenclature: boolean };

const props = defineProps<{ policy: Policy; saving?: boolean }>();
const emit = defineEmits<{ save: [] }>();
const newExtension = ref("");
const fileDraft = reactive({ key: "", label: "" });
const folderDraft = reactive({ key: "", label: "" });
const valueInputs = reactive<Record<string, string>>({});

const addSegment = (target: Segment[], draft: { key: string; label: string }) => {
  const key = draft.key.trim().replace(/\s+/gu, "");
  const label = draft.label.trim();
  if (!key || !label || key.includes("_") || target.some(item => item.key.toLocaleLowerCase() === key.toLocaleLowerCase())) return;
  target.push({ key, label, allowedValues: [] });
  draft.key = "";
  draft.label = "";
};
const addValue = (segment: Segment, kind: string) => {
  const input = `${kind}:${segment.key}`;
  const value = valueInputs[input]?.trim();
  if (!value || value.includes("_") || segment.allowedValues.includes(value)) return;
  segment.allowedValues.push(value);
  valueInputs[input] = "";
};
const move = (target: Segment[], index: number, direction: number) => {
  const next = index + direction;
  if (next < 0 || next >= target.length) return;
  [target[index], target[next]] = [target[next], target[index]];
};
const addExtension = () => {
  const value = newExtension.value.trim().replace(/^\./u, "").toLocaleLowerCase();
  if (!/^[a-z0-9][a-z0-9+_-]{0,15}$/u.test(value) || props.policy.allowedExtensions.includes(value)) return;
  props.policy.allowedExtensions.push(value);
  newExtension.value = "";
};
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between gap-4 rounded-xl border border-violet-500/20 bg-violet-500/10 p-4">
      <div>
        <p class="font-medium text-white">Enforce this format in DAM</p>
        <p class="mt-1 text-xs text-slate-400">Non-compliant uploads are rejected before storage.</p>
      </div>
      <UToggle v-model="policy.enforceNomenclature" color="primary" />
    </div>

    <section class="space-y-3">
      <div><p class="text-sm font-semibold text-white">File template</p><code class="text-xs text-violet-300">{{ policy.segments.map(item => item.key).join('_') }}</code></div>
      <div v-for="(segment, index) in policy.segments" :key="`file-${segment.key}`" class="rounded-xl border border-[#29293a] bg-[#11111a] p-3">
        <div class="flex items-center gap-1">
          <span class="min-w-0 flex-1 text-sm font-medium text-white">{{ segment.label }} <code class="text-xs text-slate-500">{{ segment.key }}</code></span>
          <UButton size="xs" variant="ghost" icon="lucide:arrow-up" :disabled="index === 0" @click="move(policy.segments, index, -1)" />
          <UButton size="xs" variant="ghost" icon="lucide:arrow-down" :disabled="index === policy.segments.length - 1" @click="move(policy.segments, index, 1)" />
          <UButton size="xs" color="error" variant="ghost" icon="lucide:trash" @click="policy.segments.splice(index, 1)" />
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <UBadge v-for="value in segment.allowedValues" :key="value" color="neutral" variant="soft">{{ value }}<button type="button" class="ml-1" @click="segment.allowedValues.splice(segment.allowedValues.indexOf(value), 1)">×</button></UBadge>
        </div>
        <div class="mt-2 flex gap-2"><UInput v-model="valueInputs[`file:${segment.key}`]" size="sm" placeholder="Allowed value (optional)" class="flex-1" @keyup.enter="addValue(segment, 'file')" /><UButton size="sm" variant="outline" label="Add value" @click="addValue(segment, 'file')" /></div>
      </div>
      <div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><UInput v-model="fileDraft.key" placeholder="Key (Brand)" /><UInput v-model="fileDraft.label" placeholder="Label (Brand name)" /><UButton label="Add segment" icon="lucide:plus" variant="outline" @click="addSegment(policy.segments, fileDraft)" /></div>
    </section>

    <section class="space-y-3 border-t border-[#29293a] pt-4">
      <p class="text-sm font-semibold text-white">Allowed extensions</p>
      <div class="flex flex-wrap gap-2"><UBadge v-for="extension in policy.allowedExtensions" :key="extension" color="primary" variant="soft">.{{ extension }}<button type="button" class="ml-1" @click="policy.allowedExtensions.splice(policy.allowedExtensions.indexOf(extension), 1)">×</button></UBadge><span v-if="!policy.allowedExtensions.length" class="text-xs text-slate-500">All extensions allowed</span></div>
      <div class="flex gap-2"><UInput v-model="newExtension" placeholder="pdf, docx, jpg" class="flex-1" @keyup.enter="addExtension" /><UButton label="Add extension" variant="outline" @click="addExtension" /></div>
    </section>

    <section class="space-y-3 border-t border-[#29293a] pt-4">
      <div><p class="text-sm font-semibold text-white">Folder template</p><code class="text-xs text-emerald-300">{{ policy.folderSegments.map(item => item.key).join('_') || 'Unrestricted' }}</code></div>
      <div v-for="(segment, index) in policy.folderSegments" :key="`folder-${segment.key}`" class="rounded-xl border border-[#29293a] bg-[#11111a] p-3">
        <div class="flex items-center gap-1"><span class="min-w-0 flex-1 text-sm font-medium text-white">{{ segment.label }} <code class="text-xs text-slate-500">{{ segment.key }}</code></span><UButton size="xs" variant="ghost" icon="lucide:arrow-up" :disabled="index === 0" @click="move(policy.folderSegments, index, -1)" /><UButton size="xs" variant="ghost" icon="lucide:arrow-down" :disabled="index === policy.folderSegments.length - 1" @click="move(policy.folderSegments, index, 1)" /><UButton size="xs" color="error" variant="ghost" icon="lucide:trash" @click="policy.folderSegments.splice(index, 1)" /></div>
        <div class="mt-2 flex flex-wrap gap-1.5"><UBadge v-for="value in segment.allowedValues" :key="value" color="neutral" variant="soft">{{ value }}<button type="button" class="ml-1" @click="segment.allowedValues.splice(segment.allowedValues.indexOf(value), 1)">×</button></UBadge></div>
        <div class="mt-2 flex gap-2"><UInput v-model="valueInputs[`folder:${segment.key}`]" size="sm" placeholder="Allowed value (optional)" class="flex-1" @keyup.enter="addValue(segment, 'folder')" /><UButton size="sm" variant="outline" label="Add value" @click="addValue(segment, 'folder')" /></div>
      </div>
      <div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><UInput v-model="folderDraft.key" placeholder="Key (Client)" /><UInput v-model="folderDraft.label" placeholder="Label (Client name)" /><UButton label="Add folder segment" icon="lucide:plus" variant="outline" @click="addSegment(policy.folderSegments, folderDraft)" /></div>
    </section>

    <div class="flex justify-end"><UButton label="Save nomenclature" icon="lucide:save" :loading="saving" @click="emit('save')" /></div>
  </div>
</template>
