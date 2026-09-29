<script setup lang="ts">
type LibraryKind = "recent" | "favorites" | "shared" | "published" | "trash";

const props = defineProps<{ kind: LibraryKind }>();

const configs = {
  recent: {
    title: "Recent activity",
    description: "Your uploads and activity from the past 12 hours.",
    icon: "lucide:history",
    calloutTitle: "Pick up where you left off",
    calloutDescription: "Your uploads and modified assets from the previous 12 hours stay close at hand.",
    emptyTitle: "No recent activity",
    emptyDescription: "Uploads and modified assets from the past 12 hours will appear here automatically.",
  },
  favorites: {
    title: "Favorites",
    description: "A focused collection of the assets you have starred for quick access.",
    icon: "lucide:star",
    calloutTitle: "Your saved collection",
    calloutDescription: "Open, download, share, or remove a favorite without searching the entire library.",
    emptyTitle: "No favorites yet",
    emptyDescription: "Use Add to Favorites from an asset menu to build this collection.",
  },
  shared: {
    title: "Shared with me",
    description: "Assets and folders that teammates have made available to you.",
    icon: "lucide:users-round",
    calloutTitle: "Team access in one place",
    calloutDescription: "Review resources shared directly with you while respecting their existing permissions.",
    emptyTitle: "Nothing has been shared with you",
    emptyDescription: "Shared assets will appear here as soon as a teammate grants access.",
  },
  published: {
    title: "Published assets",
    description: "Manage the files and folders currently available through public links.",
    icon: "lucide:globe-2",
    calloutTitle: "Your public library",
    calloutDescription: "Open a published asset or change its visibility from the asset action menu.",
    emptyTitle: "No published assets",
    emptyDescription: "Publish an asset from its action menu to make it available here.",
  },
  trash: {
    title: "Trash",
    description: "Review deleted assets before restoring them or removing them permanently.",
    icon: "lucide:trash-2",
    calloutTitle: "Recover or permanently delete",
    calloutDescription: "Select one or more items below, then choose Restore or Delete permanently.",
    emptyTitle: "Trash is empty",
    emptyDescription: "Deleted assets remain here until you restore or permanently remove them.",
  },
} as const;

const config = computed(() => configs[props.kind]);
</script>

<template>
  <AppFiles
    :title="config.title"
    :description="config.description"
    :icon="config.icon"
    :endpoint="kind"
    :callout-title="config.calloutTitle"
    :callout-description="config.calloutDescription"
    :empty-title="config.emptyTitle"
    :empty-description="config.emptyDescription"
  />
</template>
