<script setup>
import { isGoogleDriveAsset } from "~/utils/damModal";
import { useFileActions } from "~/composables/useFileActions";
import { usePublish } from "~/composables/usePublish";
import { useMove } from "~/composables/useMove";
import { useCopy } from "~/composables/useCopy";
import { useRename } from "~/composables/useRename";
import { useShare } from "~/composables/useShare";
import { useToast } from "~/composables/useToast";
import { useRole } from "~/composables/useRole";
import { useRag } from "~/composables/useRag";

const route = useRoute();
const router = useRouter();
const { setFavorite, deleteFiles, deleting, downloadAsset, downloading } = useFileActions();
const { openPublish } = usePublish();
const { openMove } = useMove();
const { openCopy } = useCopy();
const { openRename } = useRename();
const { openShare } = useShare();
const props = defineProps({
  file: {
    type: Object,
    required: true,
  },
  dropdown: {
    type: Boolean,
    default: false,
  },
  openMode: {
    type: String,
    default: "route",
  },
});
const emit = defineEmits(["delete", "open", "refresh"]);
const { canDownload, canShare, canDelete, canRename, canUpload, canUseRag, canCreateFolder, isAdmin } = useRole();
const toast = useToast();
const { startRagProcess } = useRag();
const contextMenuOpen = ref(false);
const activeContextMenuId = useState("dam-active-context-menu", () => null);
const contextMenuRef = ref(null);
const contextMenuPosition = reactive({ x: 0, y: 0 });
const externalUrl = computed(() => props.file.assetMetadata?.externalUrl || null);
const isDriveAsset = computed(() => isGoogleDriveAsset(props.file));
const isRagIndexed = computed(() => {
  const meta = props.file?.assetMetadata || {};
  return Boolean(
    meta.ragStatus === "processed" ||
    meta.ragProcessedAt
  );
});

const contextMenuStyle = computed(() => ({
  left: `${contextMenuPosition.x}px`,
  top: `${contextMenuPosition.y}px`,
}));

const closeContextMenu = () => {
  contextMenuOpen.value = false;
  if (activeContextMenuId.value === props.file.id) {
    activeContextMenuId.value = null;
  }
};

const clampContextMenuToViewport = () => {
  const menu = contextMenuRef.value;
  if (!menu || typeof window === "undefined") return;

  const bounds = menu.getBoundingClientRect();
  const gutter = 12;
  contextMenuPosition.x = Math.max(
    gutter,
    Math.min(contextMenuPosition.x, window.innerWidth - bounds.width - gutter),
  );
  contextMenuPosition.y = Math.max(
    gutter,
    Math.min(contextMenuPosition.y, window.innerHeight - bounds.height - gutter),
  );
};

const openContextMenu = async (event) => {
  if (props.file.deletedAt) return;

  contextMenuPosition.x = event.clientX;
  contextMenuPosition.y = event.clientY;
  activeContextMenuId.value = props.file.id;
  contextMenuOpen.value = true;
  await nextTick();
  clampContextMenuToViewport();
};

const runMenuItem = (item) => {
  if (item.disabled || item.type === "separator") return;

  closeContextMenu();
  if (item.href && typeof window !== "undefined") {
    window.open(item.href, item.target || "_self");
    return;
  }
  item.onSelect?.();
};

const handleContextKeydown = (event) => {
  if (event.key === "Escape") closeContextMenu();
};

const fileMenuItems = computed(() => {
  const list = [];

  // Group 1
  const group1 = [];
  if (props.file.type === "folder") {
    group1.push({
      label: "Open Folder",
      icon: "lucide:folder-open",
      onSelect: () => emit("open", props.file.id),
    });
    if (canCreateFolder.value) {
      group1.push({
        label: "New Subfolder",
        icon: "lucide:folder-plus",
        onSelect: () => {
          router.push(`/${route.params.bucket || 'org'}/${props.file.id}`);
        },
      });
    }
  } else {
    group1.push({
      label: "Open in New Tab",
      icon: "lucide:external-link",
      href: externalUrl.value || (isDriveAsset.value
        ? `/api/gdrive/download/${encodeURIComponent(props.file.id)}?inline=true`
        : `/api/files/${encodeURIComponent(route.params.bucket || 'org')}/download/${encodeURIComponent(props.file.id)}?inline=true`),
      target: "_blank",
    });
  }
  group1.push({
    label: props.file.isFavorite
      ? "Remove from Favorites"
      : "Add to Favorites",
    icon: "lucide:star",
    color: props.file.isFavorite && "error",
    onSelect: () => {
      setFavorite(props.file, !props.file.isFavorite);
    },
  });
  list.push(group1);

  // Group 2
  list.push([
    {
      label: "Download",
      icon: "i-lucide-download",
      onSelect: () => downloadAsset(props.file),
      disabled: !canDownload.value || downloading.value,
    },
    {
      label: "Rename",
      icon: "lucide:pencil",
      disabled: !canRename.value,
      onSelect: () => {
        openRename(props.file);
      },
    },
    {
      label: "Make a Copy",
      icon: "lucide:copy",
      disabled: !canUpload.value,
      onSelect: () => {
        openCopy(props.file);
      },
    },
  ]);

  // Group 3
  const actionsGroup = [];

  const supportedExtensions = new Set([
    ".md", ".markdown", ".txt", ".pdf", ".pptx", ".docx", ".xlsx", ".xls",
    ".mp4", ".mov", ".avi", ".mkv",
    ".mp3", ".wav", ".m4a",
    ".jpg", ".jpeg", ".png", ".webp"
  ]);

  const fileName = String(props.file.name || "");
  const lastDotIndex = fileName.lastIndexOf(".");
  const fileExt = lastDotIndex !== -1 ? fileName.substring(lastDotIndex).toLowerCase() : "";
  const contentType = String(props.file.contentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const supportedContentTypes = new Set([
    "text/plain",
    "text/markdown",
    "text/x-markdown",
    "application/markdown",
    "application/vnd.google-apps.document",
  ]);
  const isSupportedRagType = supportedExtensions.has(fileExt)
    || supportedContentTypes.has(contentType);

  actionsGroup.push({
    label: isRagIndexed.value ? "Re-index in RAG" : "Move To RAG",
    icon: "lucide:bot",
    disabled: !canUseRag.value || (props.file.type !== "folder" && !isSupportedRagType),
    onSelect: () => {
      startRagProcess(props.file);
    },
  });

  if (canShare.value) {
    actionsGroup.push({
      label: "Share",
      icon: "lucide:user-plus",
      onSelect: () => {
        openShare([props.file]);
      },
    });
  }

  actionsGroup.push({
    label: "Move to",
    icon: "lucide:folder-input",
    disabled: !canRename.value,
    onSelect: () => {
      openMove(props.file);
    },
  });

  actionsGroup.push({
    label: "Publish",
    icon: "lucide:globe",
    disabled: !canShare.value,
    onSelect: () => {
      openPublish(props.file);
    },
  });

  if (canDelete.value) {
    actionsGroup.push({
      type: "separator",
    });
    actionsGroup.push({
      label: "Move to Trash",
      icon: "lucide:trash",
      onSelect: () => {
        deleteFiles([props.file]);
      },
    });
  }

  if (isAdmin.value && props.file.type === "folder") {
    actionsGroup.push({
      type: "separator",
    });
    actionsGroup.push({
      label: "Set as Department",
      icon: "lucide:building",
      onSelect: async () => {
        try {
          await $fetch("/api/departments/promote", {
            method: "POST",
            body: { folderId: props.file.id, name: props.file.name },
          });
          toast.add({ title: "Folder promoted to Department successfully", color: "green" });
          emit("refresh"); // Ask parent to refresh or we can refresh tree
        } catch (err) {
          toast.add({ title: "Failed to promote folder", description: err.data?.message || err.message, color: "red" });
        }
      },
    });
  }

  list.push(actionsGroup);

  return list;
});

watch(deleting, (value) => {
  if (!value) {
    emit("delete");
  }
});

onMounted(() => {
  document.addEventListener("click", closeContextMenu);
  document.addEventListener("keydown", handleContextKeydown);
  window.addEventListener("blur", closeContextMenu);
  window.addEventListener("resize", closeContextMenu);
  window.addEventListener("scroll", closeContextMenu, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", closeContextMenu);
  document.removeEventListener("keydown", handleContextKeydown);
  window.removeEventListener("blur", closeContextMenu);
  window.removeEventListener("resize", closeContextMenu);
  window.removeEventListener("scroll", closeContextMenu, true);
});
</script>
<template>
  <UDropdownMenu
    v-if="dropdown"
    :items="fileMenuItems"
    :ui="{
      content: 'w-64',
      itemLabel: 'text-sm font-medium',
      itemLeadingIcon: '*:stroke-[1.5px]',
      itemTrailingIcon: '*:stroke-[1.5px]',
      itemTrailingKbdsSize: 'sm',
    }"
  >
    <slot />
  </UDropdownMenu>
  <template v-else>
    <div class="contents" @contextmenu.prevent.stop="openContextMenu">
      <slot />
    </div>

    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-100 ease-out"
        enter-from-class="scale-95 opacity-0"
        enter-to-class="scale-100 opacity-100"
        leave-active-class="transition duration-75 ease-in"
        leave-from-class="scale-100 opacity-100"
        leave-to-class="scale-95 opacity-0"
      >
        <div
          v-if="contextMenuOpen && activeContextMenuId === file.id"
          ref="contextMenuRef"
          :style="contextMenuStyle"
          class="fixed z-[9999] max-h-[calc(100dvh-1.5rem)] w-64 origin-top-left overflow-y-auto overscroll-contain rounded-xl border border-[var(--dam-line)] bg-[var(--dam-panel-solid)] p-1.5 text-[var(--dam-ink)] shadow-[var(--dam-shadow)]"
          role="menu"
          :aria-label="`Actions for ${file.name}`"
          @click.stop
          @contextmenu.prevent
        >
          <div
            v-for="(group, groupIndex) in fileMenuItems"
            :key="groupIndex"
            :class="groupIndex > 0 && 'mt-1 border-t border-[var(--dam-line)] pt-1'"
          >
            <template v-for="(item, itemIndex) in group" :key="`${groupIndex}-${itemIndex}`">
              <div
                v-if="item.type === 'separator'"
                class="my-1 border-t border-[var(--dam-line)]"
                role="separator"
              />
              <button
                v-else
                type="button"
                role="menuitem"
                :disabled="item.disabled"
                :class="[
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
                  item.disabled
                    ? 'cursor-not-allowed opacity-40'
                    : 'hover:bg-[var(--dam-panel-raised)] focus-visible:bg-[var(--dam-panel-raised)]',
                  item.label === 'Move to Trash' && !item.disabled
                    ? 'text-red-600 hover:bg-red-500/10 dark:text-red-400'
                    : '',
                ]"
                @click="runMenuItem(item)"
              >
                <Icon :name="item.icon" class="size-4 shrink-0 *:stroke-[1.5px]" />
                <span class="min-w-0 grow truncate font-medium">{{ item.label }}</span>
                <span
                  v-if="item.children?.length"
                  class="text-[10px] text-[var(--dam-muted)]"
                >
                  {{ item.children[0]?.label }}
                </span>
                <Icon
                  v-if="item.children?.length"
                  name="lucide:chevron-right"
                  class="size-3.5 shrink-0"
                />
              </button>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>
  </template>
</template>
