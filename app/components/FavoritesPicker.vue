<script setup lang="ts">
import { damModalUi } from "~/utils/damModal";
import { useToast } from "~/composables/useToast";

const route = useRoute();
const toast = useToast();
const { orgType } = useRole();
const open = ref(false);
const loading = ref(false);
const saving = ref(false);
const search = ref("");
const assets = ref<IFile[]>([]);
const selected = ref<string[]>([]);
const refreshTrigger = useState<number>("files-refresh-trigger", () => 0);

const matchingAssets = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return assets.value.filter((asset) => {
    if (asset.deletedAt) return false;
    return !query || String(asset.name || "").toLocaleLowerCase().includes(query);
  });
});

const alreadyFavoriteCount = computed(
  () => matchingAssets.value.filter((asset) => Boolean(asset.isFavorite)).length,
);

const loadAssets = async () => {
  loading.value = true;
  try {
    const bucket = String(route.params.bucket || "org");
    const collected: IFile[] = [];
    let page = 1;
    let nextPage: number | boolean | undefined = true;

    while (nextPage && page <= 50) {
      const endpoint = orgType.value === "gdrive"
        ? "/api/gdrive/list/root"
        : `/api/files/list/${encodeURIComponent(bucket)}/root`;
      const response = await $fetch<FilesFetchResponse>(endpoint, {
        query: {
          page,
          sortBy: "name",
          order: "asc",
          "filters[drive]": true,
          t: Date.now(),
        },
        timeout: 30000,
      });
      collected.push(...(response.data || []));
      nextPage = response.nextPage;
      page = typeof response.nextPage === "number" ? response.nextPage : page + 1;
    }
    assets.value = collected;
  } catch (error: any) {
    toast.add({
      title: "Assets could not be loaded",
      description: error?.data?.message || error?.message || "Please try again.",
      color: "error",
    });
  } finally {
    loading.value = false;
  }
};

const toggle = (id: string) => {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((item) => item !== id)
    : [...selected.value, id];
};

const addSelected = async () => {
  if (!selected.value.length || saving.value) return;
  saving.value = true;
  try {
    const bucket = String(route.params.bucket || "org");
    await Promise.all(
      selected.value.map((fileId) => {
        const file = assets.value.find((asset) => asset.id === fileId);
        if (!file) throw new Error("The selected asset is no longer available.");
        return $fetch(`/api/files/${encodeURIComponent(bucket)}/favorite`, {
          method: "POST",
          body: { file, add: true },
        });
      }),
    );
    const count = selected.value.length;
    selected.value = [];
    open.value = false;
    refreshTrigger.value++;
    toast.add({
      title: "Added to Favorites",
      description: `${count} asset${count === 1 ? "" : "s"} added to this page.`,
      color: "success",
    });
  } catch (error: any) {
    toast.add({
      title: "Favorites could not be updated",
      description: error?.data?.message || error?.message || "Please try again.",
      color: "error",
    });
  } finally {
    saving.value = false;
  }
};

watch(open, (value) => {
  if (value) loadAssets();
  else {
    search.value = "";
    selected.value = [];
  }
});
</script>

<template>
  <UButton
    type="button"
    icon="lucide:star-plus"
    label="Add favorites"
    color="primary"
    variant="solid"
    class="h-10 rounded-xl px-4 font-semibold"
    data-testid="add-favorites-trigger"
    @click="open = true"
  />

  <UModal
    v-model:open="open"
    title="Add assets to Favorites"
    description="Choose existing DAM assets to add to your Favorites collection."
    :ui="damModalUi"
  >
    <template #body>
      <div class="space-y-4">
        <UInput
          v-model="search"
          icon="lucide:search"
          placeholder="Search assets"
          size="lg"
          class="w-full"
          data-testid="favorites-picker-search"
        />

        <p v-if="!loading && matchingAssets.length" class="text-xs text-[var(--dam-muted)]">
          {{ matchingAssets.length }} matching asset{{ matchingAssets.length === 1 ? "" : "s" }}
          <span v-if="alreadyFavoriteCount"> · {{ alreadyFavoriteCount }} already saved</span>
        </p>

        <div v-if="loading" class="flex min-h-48 items-center justify-center">
          <UIcon name="lucide:loader-2" class="size-6 animate-spin text-primary-500" />
        </div>
        <div
          v-else-if="matchingAssets.length"
          class="grid max-h-[24rem] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2"
        >
          <button
            v-for="asset in matchingAssets"
            :key="asset.id"
            type="button"
            :aria-pressed="selected.includes(asset.id)"
            :disabled="Boolean(asset.isFavorite)"
            :class="[
              'flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition',
              selected.includes(asset.id)
                ? 'border-primary-500 bg-primary-500/10'
                : 'border-[var(--dam-line)] bg-[var(--dam-panel-raised)] hover:border-primary-500/45',
            ]"
            @click="!asset.isFavorite && toggle(asset.id)"
          >
            <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--dam-panel-solid)] text-primary-500">
              <UIcon :name="fileIcon(asset.contentType || asset.type)" class="size-5" />
            </span>
            <span class="min-w-0 grow">
              <span class="block truncate text-sm font-semibold text-[var(--dam-ink)]">{{ asset.name }}</span>
              <span class="mt-0.5 block truncate text-xs capitalize text-[var(--dam-muted)]">{{ asset.type }}</span>
            </span>
            <span v-if="asset.isFavorite" class="shrink-0 text-right text-[10px] font-semibold text-emerald-500">
              <UIcon name="lucide:star" class="mx-auto mb-0.5 size-4 fill-current" />
              Saved
            </span>
            <UIcon
              v-else
              :name="selected.includes(asset.id) ? 'lucide:check-circle-2' : 'lucide:circle'"
              :class="['size-5 shrink-0', selected.includes(asset.id) ? 'text-primary-500' : 'text-[var(--dam-muted)]']"
            />
          </button>
        </div>
        <div v-else class="flex min-h-48 flex-col items-center justify-center text-center">
          <UIcon name="lucide:star" class="mb-3 size-9 text-[var(--dam-muted)]" />
          <p class="font-semibold text-[var(--dam-ink)]">No additional assets found</p>
          <p class="mt-1 text-sm text-[var(--dam-muted)]">All matching assets are already in Favorites.</p>
        </div>
      </div>
    </template>

    <template #footer>
      <UButton type="button" color="neutral" variant="outline" label="Cancel" :disabled="saving" @click="open = false" />
      <UButton
        type="button"
        color="primary"
        variant="solid"
        :label="selected.length ? `Add ${selected.length} selected` : 'Select assets'"
        :disabled="!selected.length || saving"
        :loading="saving"
        data-testid="favorites-picker-submit"
        @click="addSelected"
      />
    </template>
  </UModal>
</template>
