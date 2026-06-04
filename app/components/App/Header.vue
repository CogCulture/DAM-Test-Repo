<script setup lang="ts">
const route = useRoute();
const { aside, toggle } = useAside();
defineShortcuts({
  meta_b: toggle,
});

const { canApproveUsers, canEditNomenclature, departmentId, roleLabel, departmentLabel, isAdmin } = useRole();
const bucketName = computed(() => (route.params.bucket as string) || "org");

const mainItems = computed(() => [
  [
    {
      label: "Home",
      icon: "lucide:home",
      to: `/${bucketName.value}/`,
    },
    {
      label: "Recent",
      icon: "lucide:clock",
      to: `/${bucketName.value}/recent`,
    },
    {
      label: "Favorites",
      icon: "lucide:star",
      to: `/${bucketName.value}/favorites`,
    },
  ],
  [
    {
      label: "Shared With Me",
      icon: "lucide:circle-user",
      to: `/${bucketName.value}/shared`,
    },
    {
      label: "Published",
      icon: "lucide:globe",
      to: `/${bucketName.value}/published`,
    },
  ],
  [
    {
      label: "Trash",
      icon: "lucide:trash",
      to: `/${bucketName.value}/trash`,
    },
  ],
]);

const adminItems = computed(() => {
  const items = [];
  if (isAdmin.value) {
    items.push({
      label: "Org Settings",
      icon: "lucide:settings",
      to: `/admin/settings`,
    });
    items.push({
      label: "Template Folders",
      icon: "lucide:layout-template",
      to: `/admin/template-folders`,
    });
  }
  if (canApproveUsers.value || isAdmin.value) {
    items.push({
      label: "User Approvals",
      icon: "lucide:users",
      to: `/admin`,
    });
  }
  if (canEditNomenclature.value || isAdmin.value) {
    items.push({
      label: "Nomenclature",
      icon: "lucide:tag",
      to: `/admin/nomenclature`,
    });
    items.push({
      label: "Folder Requests",
      icon: "lucide:folder-plus",
      to: `/admin/folder-requests`,
    });
    items.push({
      label: "GDrive Requests",
      icon: "lucide:cloud",
      to: `/admin/gdrive-requests`,
    });
  }
  return items.length ? [items] : [];
});

const items = computed(() => [
  ...mainItems.value,
  ...adminItems.value,
]);
</script>
<template>
  <header
    class="flex flex-col bg-white dark:bg-neutral-950 fixed top-0 left-0 right-0 z-10 shadow-lg shadow-neutral-400/5 dark:shadow-neutral-900/5"
  >
    <div class="flex items-center gap-4 pr-4 sm:pr-18 w-full">
      <Logo />
      <template v-if="route.params.bucket || route.path.startsWith('/admin')">
        <UTooltip
          text="Toggle Menu"
          arrow
          :delay-duration="0"
          :kbds="['meta', 'B']"
        >
          <UButton
            :icon="aside ? 'lucide:x' : 'lucide:menu'"
            variant="text"
            size="xl"
            @click="toggle"
          />
        </UTooltip>
      </template>
      <Search v-if="route.params.bucket" />
      <div v-else class="grow"></div>
      <ColorMode />
      <ProfileMenu />
    </div>
    
    <!-- Collapsible Horizontal Navigation -->
    <div 
      v-if="aside && (route.params.bucket || route.path.startsWith('/admin'))"
      class="w-full px-4 border-t border-neutral-100 dark:border-neutral-800"
    >
      <div class="flex items-center justify-between overflow-x-auto overflow-y-hidden whitespace-nowrap scrollbar-hide py-2">
        <div class="flex items-center">
          <template v-for="(group, idx) in items" :key="idx">
            <UNavigationMenu
              orientation="horizontal"
              :items="[group]"
              class="min-w-max"
            />
            <div 
              v-if="idx < items.length - 1" 
              class="h-4 w-px bg-neutral-200 dark:bg-neutral-700 mx-2 shrink-0"
            ></div>
          </template>
        </div>
        <div v-if="roleLabel" class="ml-4 px-2 py-1 bg-neutral-50 dark:bg-neutral-900 rounded-lg flex flex-col shrink-0">
          <p class="text-[10px] text-neutral-400 font-medium leading-none mb-1">{{ departmentLabel }}</p>
          <p class="text-xs font-semibold text-neutral-700 dark:text-neutral-200 leading-none">{{ roleLabel }}</p>
        </div>
      </div>
    </div>
  </header>
</template>
<style scoped>
.scrollbar-hide::-webkit-scrollbar {
    display: none;
}
.scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
</style>
