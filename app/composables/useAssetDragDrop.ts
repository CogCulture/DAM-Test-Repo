import { ref, computed } from "vue";
import { useMoveAsset } from "./useMoveAsset";

// Module-level reactive state so all components (cards, tree, breadcrumbs) share the active drag
const draggedAsset = ref<any | null>(null);
const currentDropTargetId = ref<string | null>(null);

export function useAssetDragDrop() {
  const { moveAsset, isMoving } = useMoveAsset();

  const isDragging = computed(() => !!draggedAsset.value);

  const startDrag = (asset: any, event?: DragEvent) => {
    draggedAsset.value = asset;
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(
        "application/json",
        JSON.stringify({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          parentId: asset.parentId,
        })
      );
    }
  };

  const endDrag = () => {
    draggedAsset.value = null;
    currentDropTargetId.value = null;
  };

  const isDropTargetActive = (folderId: string) => {
    return currentDropTargetId.value === folderId;
  };

  const canDropOn = (folder: { id: string; parentId?: string }) => {
    if (!draggedAsset.value) return false;
    if (draggedAsset.value.id === folder.id) return false; // Cannot drop into itself
    if (draggedAsset.value.parentId && draggedAsset.value.parentId === folder.id) return false; // Already in target folder
    return true;
  };

  const setDropTarget = (folderId: string | null) => {
    currentDropTargetId.value = folderId;
  };

  const dropOnFolder = async (targetFolder: { id: string; name?: string }) => {
    if (!draggedAsset.value) return;
    const assetToMove = draggedAsset.value;
    endDrag();
    await moveAsset(assetToMove, targetFolder);
  };

  return {
    draggedAsset,
    isDragging,
    currentDropTargetId,
    startDrag,
    endDrag,
    isDropTargetActive,
    canDropOn,
    setDropTarget,
    dropOnFolder,
    isMoving,
  };
}
