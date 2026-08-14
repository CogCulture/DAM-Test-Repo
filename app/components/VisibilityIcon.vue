<script setup lang="ts">
defineProps<{
  visibility: "public" | "private" | "inherit";
}>();
const visibilityIcons = {
  public: "lucide:globe",
  private: "lucide:lock",
  inherit: "lucide:folder",
};
const visibilityLabels = {
  public: "Public asset",
  private: "Private to your workspace — preview is available",
  inherit: "Uses the parent folder's visibility",
};
</script>
<template>
  <UTooltip :text="visibilityLabels[visibility]" arrow placement="top" :delay-duration="0">
    <Icon
      v-if="visibilityIcons[visibility]"
      :name="visibilityIcons[visibility]"
      class="opacity-70 ml-auto min-w-4"
      :aria-label="visibilityLabels[visibility]"
    />
  </UTooltip>
</template>
