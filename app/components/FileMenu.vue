<script setup>
const route = useRoute();
const { setFavorite, deleteFiles, deleting } = useFileActions();
const { openPublish } = usePublish();
const { openMove } = useMove();
const { openCopy } = useCopy();
const { openRename } = useRename();
const { openShare } = useShare();
const props = defineProps(["file"]);
const emit = defineEmits(["delete"]);
const { canDownload, canShare, canDelete } = useRole();

const fileMenuItems = computed(() => {
  const list = [];

  // Group 1
  list.push([
    {
      label: "Open",
      icon: "lucide:eye",
      type: "link",
      href: `/preview/${props.file.path}`,
      target: "_blank",
      disabled: props.file.type === "folder",
    },
    {
      label: "Open With",
      icon: "lucide:external-link",
      children: [
        {
          label: "Editor",
          icon: "i-lucide-monitor",
          disabled: true,
        },
      ],
    },
    {
      label: props.file.isFavorite
        ? "Remove from Favorites"
        : "Add to Favorites",
      icon: "lucide:star",
      color: props.file.isFavorite && "error",
      onSelect: () => {
        setFavorite(props.file.id, !props.file.isFavorite);
      },
    },
  ]);

  // Group 2
  list.push([
    {
      label: "Download",
      icon: "i-lucide-download",
      href: route.params.bucket && route.params.bucket.startsWith("gdrive_")
        ? `/api/gdrive/download/${props.file.id}`
        : `/api/files/${route.params.bucket}/download/${props.file.id}`,
      target: "_blank",
      disabled: !canDownload.value,
    },
    {
      label: "Rename",
      icon: "lucide:pencil",
      kbds: ["meta", "R"],
      disabled: !canDelete.value, // renaming requires modify permission
      onSelect: () => {
        openRename(props.file);
      },
    },
    {
      label: "Make a Copy",
      icon: "lucide:copy",
      kbds: ["meta", "D"],
      disabled: !canDelete.value,
      onSelect: () => {
        openCopy(props.file);
      },
    },
  ]);

  // Group 3
  const actionsGroup = [];
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
    disabled: !canDelete.value,
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
      kbds: ["meta", "backspace"],
      onSelect: () => {
        deleteFiles([props.file.id]);
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
</script>
<template>
  <UContextMenu
    :disabled="!!file.deletedAt"
    :items="fileMenuItems"
    size="xl"
    :ui="{
      content: 'w-64',
      itemLabel: 'text-sm font-light',
      itemLeadingIcon: '*:stroke-[1px]',
      itemTrailingIcon: '*:stroke-[1px]',
      itemTrailingKbdsSize: 'sm',
    }"
  >
    <slot />
  </UContextMenu>
</template>
