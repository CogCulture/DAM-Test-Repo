<script setup lang="ts">
import { computed } from "vue";
import { useFolder } from "~/composables/useFolder";
import { useFile } from "~/composables/useFile";
import { useRole } from "~/composables/useRole";
import { useAssetDragDrop } from "~/composables/useAssetDragDrop";

interface BreadcrumbSegment {
  id?: string;
  label: string;
  href?: string;
  icon?: string;
  isCurrent?: boolean;
  isFolder?: boolean;
  isFile?: boolean;
}

const route = useRoute();
const router = useRouter();
const { folder } = useFolder();
const { file } = useFile();
const { orgType } = useRole();
const { user } = useUserSession();
const { canDropOn, isDropTargetActive, setDropTarget, dropOnFolder } = useAssetDragDrop();

const bcDropOver = (event: DragEvent, item: BreadcrumbSegment) => {
  if (!item.id || !item.isFolder) return;
  const fakeFolder = { id: item.id, parentId: undefined };
  if (!canDropOn(fakeFolder)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  setDropTarget(item.id);
};
const bcDragLeave = (event: DragEvent, item: BreadcrumbSegment) => {
  const rel = event.relatedTarget as HTMLElement | null;
  const cur = event.currentTarget as HTMLElement | null;
  if (cur && rel && cur.contains(rel)) return;
  if (item.id && isDropTargetActive(item.id)) setDropTarget(null);
};
const bcDrop = (event: DragEvent, item: BreadcrumbSegment) => {
  if (!item.id || !item.isFolder) return;
  event.preventDefault();
  dropOnFolder({ id: item.id, name: item.label });
};

const isGDrive = computed(() => {
  return orgType.value === "gdrive" || (user.value as any)?.orgType === "gdrive";
});

const rootLabel = computed(() => {
  if (isGDrive.value) {
    return (user.value as any)?.gdriveFolderName || "My Drive";
  }
  return "All Assets";
});

const rootIcon = computed(() => {
  return isGDrive.value ? "lucide:hard-drive" : "lucide:folder";
});

const breadcrumbs = computed<BreadcrumbSegment[]>(() => {
  const items: BreadcrumbSegment[] = [];
  const bucket = route.params.bucket as string | undefined;

  // Case 1: Within bucket routes (Assets, folders, files, sub-sections)
  if (bucket) {
    const rootHref = `/${bucket}`;
    const pathStr = route.path;

    // Check if on a file detail page
    const isFileRoute = pathStr.includes("/file/") || route.name === "bucket-file-id";

    // Check for special sub-pages
    const isFavorites = pathStr.endsWith("/favorites");
    const isPublished = pathStr.endsWith("/published");
    const isRecent = pathStr.endsWith("/recent");
    const isShared = pathStr.endsWith("/shared");
    const isTrash = pathStr.endsWith("/trash");
    const isSubPage = isFavorites || isPublished || isRecent || isShared || isTrash;

    // Check if on folder page
    const isFolderRoute = !isFileRoute && !isSubPage && !!route.params.id;

    // Subcase 1A: Root Asset View (/[bucket])
    if (!isFolderRoute && !isFileRoute && !isSubPage) {
      items.push({
        label: rootLabel.value,
        icon: rootIcon.value,
        isFolder: true,
        isCurrent: true,
      });
      return items;
    }

    // Add root item with navigation link for all non-root views
    items.push({
      label: rootLabel.value,
      href: rootHref,
      icon: rootIcon.value,
      isFolder: true,
      isCurrent: false,
    });

    // Subcase 1B: File Detail Page
    if (isFileRoute) {
      // Add parent folder breadcrumbs if available
      const parentChain = file.value?.breadcrumb || [];
      parentChain.forEach((p) => {
        items.push({
          id: p.id,
          label: p.name,
          href: `/${bucket}/${p.id}`,
          icon: "lucide:folder",
          isFolder: true,
          isCurrent: false,
        });
      });

      // Current file item
      items.push({
        id: file.value?.id || (route.params.id as string),
        label: file.value?.name || "Viewing Asset",
        icon: "lucide:file-text",
        isFile: true,
        isCurrent: true,
      });
      return items;
    }

    // Subcase 1C: Special sub-sections
    if (isSubPage) {
      let subLabel = "Section";
      let subIcon = "lucide:folder";
      if (isFavorites) {
        subLabel = "Favorites";
        subIcon = "lucide:star";
      } else if (isPublished) {
        subLabel = "Published Assets";
        subIcon = "lucide:globe";
      } else if (isRecent) {
        subLabel = "Recent";
        subIcon = "lucide:clock";
      } else if (isShared) {
        subLabel = "Shared with me";
        subIcon = "lucide:users";
      } else if (isTrash) {
        subLabel = "Trash";
        subIcon = "lucide:trash-2";
      }

      items.push({
        label: subLabel,
        icon: subIcon,
        isFolder: false,
        isCurrent: true,
      });
      return items;
    }

    // Subcase 1D: Folder Route
    if (isFolderRoute) {
      const paths = folder.value?.breadcrumb || [];
      const currentFolder = folder.value;

      if (paths.length > 0) {
        const includesCurrent = currentFolder
          ? paths.some((p) => p.id === currentFolder.id || p.name === currentFolder.name)
          : true;

        paths.forEach((item, index) => {
          const isLast = !includesCurrent ? false : index === paths.length - 1;
          items.push({
            id: item.id,
            label: item.name,
            href: isLast ? undefined : `/${bucket}/${item.id}`,
            icon: isLast ? "lucide:folder-open" : "lucide:folder",
            isFolder: true,
            isCurrent: isLast,
          });
        });

        if (!includesCurrent && currentFolder?.name) {
          items.push({
            id: currentFolder.id,
            label: currentFolder.name,
            icon: "lucide:folder-open",
            isFolder: true,
            isCurrent: true,
          });
        }
      } else if (currentFolder?.name) {
        items.push({
          id: currentFolder.id,
          label: currentFolder.name,
          icon: "lucide:folder-open",
          isFolder: true,
          isCurrent: true,
        });
      }
      return items;
    }

    return items;
  }

  // Case 2: Admin routes
  if (route.path.startsWith("/admin")) {
    items.push({
      label: "Admin",
      href: route.path === "/admin" ? undefined : "/admin",
      icon: "lucide:shield",
      isCurrent: route.path === "/admin",
    });

    if (route.path.includes("/departments")) {
      items.push({ label: "Departments", icon: "lucide:network", isCurrent: true });
    } else if (route.path.includes("/nomenclature")) {
      items.push({ label: "Nomenclature Rules", icon: "lucide:file-code", isCurrent: true });
    } else if (route.path.includes("/template-folders")) {
      items.push({ label: "Client Folders", icon: "lucide:briefcase", isCurrent: true });
    } else if (route.path.includes("/settings")) {
      items.push({ label: "Settings", icon: "lucide:settings", isCurrent: true });
    } else if (route.path.includes("/gdrive-setup")) {
      items.push({ label: "Google Drive Setup", icon: "lucide:hard-drive", isCurrent: true });
    }
    return items;
  }

  // Case 3: Dept-Head routes
  if (route.path.startsWith("/dept-head")) {
    items.push({
      label: "Department",
      href: route.path === "/dept-head" ? undefined : "/dept-head",
      icon: "lucide:building",
      isCurrent: route.path === "/dept-head",
    });
    if (route.path.includes("/permissions")) {
      items.push({ label: "Permissions", icon: "lucide:key", isCurrent: true });
    }
    return items;
  }

  // Case 4: Superadmin routes
  if (route.path.startsWith("/superadmin")) {
    items.push({
      label: "Superadmin",
      href: route.path === "/superadmin" ? undefined : "/superadmin",
      icon: "lucide:shield-alert",
      isCurrent: route.path === "/superadmin",
    });
    if (route.path.includes("/organizations")) {
      items.push({ label: "Organizations", icon: "lucide:building-2", isCurrent: true });
    } else if (route.path.includes("/gdrive-requests")) {
      items.push({ label: "GDrive Requests", icon: "lucide:hard-drive", isCurrent: true });
    }
    return items;
  }

  return items;
});
</script>

<template>
  <nav
    v-if="breadcrumbs.length > 0"
    aria-label="Breadcrumb path"
    class="dam-breadcrumb flex flex-wrap items-center gap-1.5 sm:gap-2 text-[15px] sm:text-base font-medium text-[var(--dam-ink)] select-none"
  >
    <div
      v-for="(item, index) in breadcrumbs"
      :key="item.label + '-' + index"
      class="flex items-center gap-1.5 sm:gap-2"
    >
      <!-- Separator Chevron -->
      <UIcon
        v-if="index > 0"
        name="lucide:chevron-right"
        class="size-4 shrink-0 text-neutral-400 dark:text-neutral-500"
      />

      <!-- Clickable Ancestor Link -->
      <NuxtLink
        v-if="!item.isCurrent && item.href"
        :to="item.href"
        :class="[
          'group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/80 transition-colors duration-150 cursor-pointer',
          item.id && isDropTargetActive(item.id) && 'ring-2 ring-primary-500 bg-primary-500/10 text-primary-700 dark:text-primary-300',
        ]"
        :title="`Go to ${item.label}`"
        @dragover="bcDropOver($event, item)"
        @dragleave="bcDragLeave($event, item)"
        @drop.prevent="bcDrop($event, item)"
      >
        <UIcon
          v-if="item.icon"
          :name="item.icon"
          class="size-4 shrink-0 text-neutral-400 group-hover:text-[#ff5733] transition-colors"
        />
        <span class="truncate max-w-[180px] sm:max-w-[300px]">{{ item.label }}</span>
      </NuxtLink>

      <!-- Active / Current Location (Google Drive style with subtle caret on folders) -->
      <div
        v-else
        class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold text-neutral-900 dark:text-white"
        :title="item.label"
      >
        <UIcon
          v-if="item.icon"
          :name="item.icon"
          :class="[
            'size-4 shrink-0',
            item.isFile ? 'text-[#ff5733]' : 'text-neutral-500 dark:text-neutral-400',
          ]"
        />
        <span class="truncate max-w-[220px] sm:max-w-[360px]">{{ item.label }}</span>
        <!-- Folder Dropdown indicator matching Google Drive (e.g. 'Hello2 ▾') -->
        <UIcon
          v-if="item.isFolder"
          name="lucide:chevron-down"
          class="size-3.5 shrink-0 text-neutral-400 dark:text-neutral-500 ml-0.5"
        />
      </div>
    </div>
  </nav>
</template>

<style scoped>
.dam-breadcrumb a {
  text-decoration: none;
}
</style>
