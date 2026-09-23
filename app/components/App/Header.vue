<script setup lang="ts">
import { ref, computed } from "vue";
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

const mainNavItems = computed(() => [
  { label: "Home", icon: "lucide:home", to: `/${bucketName.value}` },
  { label: "Recent", icon: "lucide:clock", to: `/${bucketName.value}/recent` },
  { label: "Favorites", icon: "lucide:star", to: `/${bucketName.value}/favorites` },
  { label: "Shared With Me", icon: "lucide:circle-user", to: `/${bucketName.value}/shared` },
  { label: "Published", icon: "lucide:globe", to: `/${bucketName.value}/published` },
  { label: "Trash", icon: "lucide:trash", to: `/${bucketName.value}/trash` },
]);

const adminMenuItems = computed(() => {
  const items = [];
  items.push(
    { label: "Org Settings & Access", icon: "lucide:settings", to: "/admin/settings" },
    { label: "Department Hierarchy", icon: "lucide:network", to: "/admin/departments" },
    { label: "Template Folders", icon: "lucide:layout-template", to: "/admin/template-folders" },
    { label: "Department Dashboard", icon: "lucide:layout-dashboard", to: "/dept-head" },
    { label: "Department Permissions", icon: "lucide:shield-check", to: "/dept-head/permissions" },
    { label: "User Approvals", icon: "lucide:users", to: "/admin" },
    { label: "Nomenclature Rules", icon: "lucide:tag", to: "/admin/nomenclature" },
    { label: "Taxonomy & Metadata", icon: "lucide:layers", to: "/admin/taxonomy" },
    { label: "Folder Requests", icon: "lucide:folder-plus", to: "/admin/folder-requests" },
  );
  if (orgType.value === "gdrive") {
    items.push({ label: "GDrive Requests", icon: "lucide:cloud", to: "/admin/gdrive-requests" });
  }
  return items;
});

const isAdminDropdownOpen = ref(false);
const isNavItemActive = (to: string) => route.path === to;
</script>

<template>
  <header class="dam-workspace-header fixed inset-x-0 top-0 z-20 flex flex-col border-b border-[var(--dam-line)] bg-[var(--dam-panel-solid)] text-[var(--dam-ink)] shadow-[var(--dam-shadow-soft)]">
    <!-- Top Row -->
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

      <!-- Top Right Actions -->
      <div class="flex items-center gap-2 sm:gap-3">
        <div v-if="roleLabel" class="mr-1 hidden border-l border-[var(--dam-line)] pl-4 lg:block">
          <p class="dam-kicker max-w-32 truncate">{{ departmentLabel || 'Workspace' }}</p>
          <p class="mt-0.5 max-w-32 truncate text-xs font-semibold text-[var(--dam-ink)]">{{ roleLabel }}</p>
        </div>

        <NuxtLink
          to="/auth/select-storage"
          class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-raised)] text-xs font-semibold text-[var(--dam-ink)] hover:border-indigo-500/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
          title="Change Workspace Storage Option"
        >
          <Icon name="lucide:database" class="size-3.5 text-indigo-500" />
          <span class="capitalize">{{ orgType === 's3' ? 'Platform S3' : orgType === 'gdrive' ? 'Google Drive' : orgType === 'onedrive' ? 'MS OneDrive' : orgType === 'sharepoint' ? 'MS SharePoint' : orgType === 'box' ? 'Box Storage' : orgType === 'dropbox' ? 'Dropbox' : 'Cloud BYOS' }}</span>
        </NuxtLink>

        <ColorMode />
        <ProfileMenu />
      </div>
    </div>

    <!-- Secondary Navigation Sub-bar -->
    <div
      v-if="aside && showsWorkspaceControls"
      class="w-full border-t border-[var(--dam-line)] bg-[var(--dam-panel)] px-3 sm:px-6"
    >
      <div class="relative flex items-center justify-between py-2">
        <!-- Main Core Navigation Pills (Scrollable) -->
        <nav class="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-hide pr-4 min-w-0 grow" aria-label="Primary workspace navigation">
          <NuxtLink
            v-for="item in mainNavItems"
            :key="item.to"
            :to="item.to"
            :aria-current="isNavItemActive(item.to) ? 'page' : undefined"
            :class="[
              'flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all duration-150 shrink-0',
              isNavItemActive(item.to)
                ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'border-transparent text-[var(--dam-ink-muted)] hover:border-[var(--dam-line)] hover:bg-[var(--dam-panel-raised)] hover:text-[var(--dam-ink)]',
            ]"
          >
            <Icon :name="item.icon" class="size-4 shrink-0" />
            <span>{{ item.label }}</span>
          </NuxtLink>
        </nav>

        <!-- Governance & Admin Dropdown Menu -->
        <div v-if="adminMenuItems.length > 0" class="relative shrink-0 z-50">
          <button
            class="flex h-9 items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 text-xs font-bold text-indigo-500 hover:bg-indigo-500/20 transition shadow-xs"
            @click="isAdminDropdownOpen = !isAdminDropdownOpen"
          >
            <Icon name="lucide:shield-cog" class="size-4" />
            <span>Governance & Admin</span>
            <Icon name="lucide:chevron-down" class="size-3.5 transition-transform duration-200" :class="{ 'rotate-180': isAdminDropdownOpen }" />
          </button>

          <!-- Dropdown Popup -->
          <div
            v-if="isAdminDropdownOpen"
            class="fixed inset-0 z-40"
            @click="isAdminDropdownOpen = false"
          />
          <div
            v-if="isAdminDropdownOpen"
            class="absolute right-0 top-11 z-50 w-64 rounded-2xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] p-2 shadow-2xl backdrop-blur-md space-y-1 max-h-[80vh] overflow-y-auto"
            @click.stop
          >
            <div class="px-3 py-1.5 text-[10px] font-bold text-[var(--dam-ink-muted)] uppercase tracking-wider border-b border-[var(--dam-line)] mb-1">
              Admin & Governance Settings
            </div>

            <NuxtLink
              v-for="item in adminMenuItems"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--dam-ink)] hover:bg-[var(--dam-panel-raised)] hover:text-indigo-500 transition"
              :class="{ 'bg-indigo-500/10 text-indigo-500 font-bold': isNavItemActive(item.to) }"
              @click="isAdminDropdownOpen = false"
            >
              <Icon :name="item.icon" class="size-4 text-indigo-400" />
              <span>{{ item.label }}</span>
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>

    <!-- Search Bar Row -->
    <div v-if="showsWorkspaceControls" class="w-full border-t border-[var(--dam-line)] bg-[var(--dam-panel)] px-4 sm:px-6">
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
