<script setup lang="ts">
import { useAside } from "~/composables/useAside";
import { defineShortcuts } from "~/composables/defineShortcuts";
import { useRole } from "~/composables/useRole";
import { useBucket } from "~/composables/useBucket";

const route = useRoute();
const { aside, toggle } = useAside();
defineShortcuts({ meta_b: toggle });

const { canApproveUsers, canEditNomenclature, departmentLabel, roleLabel, isAdmin, isDeptHead, orgType } = useRole();
const { bucket } = useBucket();
const bucketName = computed(() => (route.params.bucket as string) || bucket.value?.name || "org");
const showsWorkspaceControls = computed(() => !!route.params.bucket || route.path.startsWith("/admin") || route.path.startsWith("/dept-head"));

const mainItems = computed(() => [
  [
    { label: "Home", icon: "lucide:home", to: `/${bucketName.value}` },
    { label: "Recent", icon: "lucide:clock", to: `/${bucketName.value}/recent` },
    { label: "Favorites", icon: "lucide:star", to: `/${bucketName.value}/favorites` },
  ],
  [
    { label: "Shared With Me", icon: "lucide:circle-user", to: `/${bucketName.value}/shared` },
    { label: "Published", icon: "lucide:globe", to: `/${bucketName.value}/published` },
  ],
  [{ label: "Trash", icon: "lucide:trash", to: `/${bucketName.value}/trash` }],
]);

const adminItems = computed(() => {
  const items = [];
  if (isAdmin.value) {
    items.push(
      { label: "Org Settings", icon: "lucide:settings", to: "/admin/settings" },
      { label: "Access Control", icon: "lucide:shield-check", to: "/admin/access-control" },
      { label: "Departments", icon: "lucide:network", to: "/admin/departments" },
      { label: "Template Folders", icon: "lucide:layout-template", to: "/admin/template-folders" },
    );
  }
  if (isDeptHead.value) {
    items.push(
      { label: "Dept Dashboard", icon: "lucide:layout-dashboard", to: "/dept-head" },
      { label: "Dept Permissions", icon: "lucide:shield-check", to: "/dept-head/permissions" },
    );
  }
  if (canApproveUsers.value || isAdmin.value) items.push({ label: "User Approvals", icon: "lucide:users", to: "/admin" });
  if (canEditNomenclature.value || isAdmin.value) {
    items.push(
      { label: "Nomenclature", icon: "lucide:tag", to: "/admin/nomenclature" },
      { label: "Taxonomy", icon: "lucide:layers", to: "/admin/taxonomy" },
      { label: "Folder Requests", icon: "lucide:folder-plus", to: "/admin/folder-requests" },
    );
    if (orgType.value === "gdrive") items.push({ label: "GDrive Requests", icon: "lucide:cloud", to: "/admin/gdrive-requests" });
  }
  return items.length ? [items] : [];
});

const items = computed(() => [...mainItems.value, ...adminItems.value]);
const isNavItemActive = (to: string) => route.path === to;
</script>

<template>
  <header class="dam-workspace-header fixed inset-x-0 top-0 z-20 flex flex-col border-b border-[var(--dam-line)] bg-white shadow-[var(--dam-shadow-soft)] dark:bg-[var(--dam-panel-solid)]">
    <div class="flex h-[4.5rem] w-full items-center gap-2 pr-3 sm:gap-4 sm:pr-6">
      <Logo />
      <template v-if="showsWorkspaceControls">
        <UTooltip text="Toggle workspace menu" arrow :delay-duration="0" :kbds="['meta', 'B']">
          <UButton
            :icon="aside ? 'lucide:x' : 'lucide:menu'"
            color="neutral"
            variant="ghost"
            size="lg"
            class="shrink-0 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)]"
            aria-label="Toggle workspace menu"
            @click="toggle"
          />
        </UTooltip>
      </template>
      <div class="grow" />
      <div class="flex items-center gap-1 sm:gap-2">
        <div v-if="roleLabel" class="mr-1 hidden border-l border-[var(--dam-line)] pl-4 lg:block">
          <p class="dam-kicker max-w-32 truncate">{{ departmentLabel || 'Workspace' }}</p>
          <p class="mt-0.5 max-w-32 truncate text-xs font-semibold text-[var(--dam-ink)]">{{ roleLabel }}</p>
        </div>
        <ColorMode />
        <ProfileMenu />
      </div>
    </div>

    <div
      v-if="aside && showsWorkspaceControls"
      class="w-full border-t border-[var(--dam-line)] bg-[var(--dam-panel)] px-3 sm:pl-[5.5rem] sm:pr-6"
    >
      <div class="flex items-center overflow-x-auto whitespace-nowrap py-2 scrollbar-hide">
        <template v-for="(group, idx) in items" :key="idx">
          <nav class="flex min-w-max items-center gap-1" :aria-label="`Workspace navigation group ${idx + 1}`">
            <NuxtLink
              v-for="item in group"
              :key="item.to"
              :to="item.to"
              :data-testid="`workspace-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`"
              :aria-current="isNavItemActive(item.to) ? 'page' : undefined"
              :class="[
                'flex h-9 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors duration-100',
                isNavItemActive(item.to)
                  ? 'border-primary-500/35 bg-primary-500/10 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-[var(--dam-muted)] hover:border-[var(--dam-line)] hover:bg-[var(--dam-panel-raised)] hover:text-[var(--dam-ink)]',
              ]"
            >
              <Icon :name="item.icon" class="size-4 shrink-0" />
              <span>{{ item.label }}</span>
            </NuxtLink>
          </nav>
          <div v-if="idx < items.length - 1" class="mx-2 h-4 w-px shrink-0 bg-[var(--dam-line)]" />
        </template>
      </div>
    </div>

    <div v-if="route.params.bucket" class="w-full border-t border-[var(--dam-line)] bg-[var(--dam-panel)] px-4 sm:px-6">
      <div class="mx-auto w-full max-w-[96rem]">
        <SmartSearch />
      </div>
    </div>
  </header>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>
