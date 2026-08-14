<script setup>
import { useFolder } from "~/composables/useFolder";
import { useRole } from "~/composables/useRole";
import { useToast } from "~/composables/useToast";
import { resolveFolderCreationMode } from "~~/shared/utils/folder-creation-policy";
import { resolveDriveRouteFolderId } from "~~/shared/utils/drive-storage";

const route = useRoute();
const router = useRouter();
const open = ref(false);
const loading = ref(false);
const error = ref("");
const form = ref({
  name: "",
  type: "folder",
});

const { folder } = useFolder();
const { role, canCreateFolder, canCreateFolderDirectly, orgType } = useRole();
const { user } = useUserSession();
const toast = useToast();
const folderCreationMode = computed(() => resolveFolderCreationMode({
  role: role.value,
  canCreateFolder: canCreateFolder.value,
}));

const props = defineProps({
  compact: {
    type: Boolean,
    default: false,
  },
  size: {
    type: String,
    default: "md",
  },
  parentId: {
    type: String,
    default: null,
  }
});

const resolvedParentId = computed(() => {
  if (props.parentId) return props.parentId;
  if (orgType.value === "gdrive") {
    return resolveDriveRouteFolderId({
      idParam: route.params.id,
      organizationId: user.value?.organizationId,
    });
  }
  const idParam = route.params.id;
  return Array.isArray(idParam) ? (idParam.join("/") || "root") : (idParam || "root");
});

const items = computed(() => {
  const result = [];
  if (canCreateFolder.value || canCreateFolderDirectly.value) {
    result.push({
      label: "New Folder",
      icon: "i-lucide-folder-plus",
      onSelect: () => {
        form.value.type = "folder";
        open.value = true;
      },
      kbds: ["meta", "n"],
    });
  }
  if (orgType.value !== "gdrive") {
    result.push({
      label: "New File",
      icon: "i-lucide-file-plus",
      onSelect: () => {
        form.value.type = "file";
        open.value = true;
      },
    });
  }
  return [result];
});

const friendlyPath = computed(() => {
  if (props.parentId === "root") return route.params.bucket || "org";
  if (!folder.value) return route.params.bucket || "org";
  if (!folder.value.breadcrumb || folder.value.breadcrumb.length === 0) {
    return `${route.params.bucket}/${folder.value.name}`;
  }
  const breadcrumbNames = folder.value.breadcrumb.map((b) => b.name);
  return `${route.params.bucket}/${breadcrumbNames.join("/")}`;
});

const formNamePreview = computed(() => {
  if (form.value.name) return `/${form.value.name}`;
  return "";
});

const onSubmit = async () => {
  if (loading.value) return;
  if (!form.value.name) {
    error.value = "Name is required";
    return;
  }
  if (form.value.type === "file" && !form.value.name.includes(".")) {
    error.value = "File name must include extension";
    return;
  }
  if (form.value.name.includes("/")) {
    error.value = "Name cannot contain '/'";
    return;
  }
  loading.value = true;
  try {
    const isGDrive = orgType.value === "gdrive" || (route.params.bucket && route.params.bucket.startsWith("gdrive_"));
    if (form.value.type === "folder" && folderCreationMode.value === "request") {
      await $fetch("/api/folder-requests", {
        method: "POST",
        body: {
          folderName: form.value.name,
          parentId: resolvedParentId.value,
        },
      });
      toast.add({
        title: "Folder Request Submitted",
        description: `Your request to create folder "${form.value.name}" is pending approval from your administrator or Department Head.`,
        color: "warning"
      });
      open.value = false;
      form.value.name = "";
    } else if (isGDrive) {
      const data = await $fetch("/api/gdrive/folder/create", {
        method: "POST",
        body: {
          parentId: resolvedParentId.value,
          folderName: form.value.name,
        },
      });
      if (data.folder?.id) {
        const refreshTrigger = useState("files-refresh-trigger");
        refreshTrigger.value++;
        open.value = false;
        form.value.name = "";
        router.push(`/${route.params.bucket}/${data.folder.id}`);
      }
    } else {
      const data = await $fetch(
        `/api/folder/${route.params.bucket || 'org'}/${resolvedParentId.value}`,
        {
          method: "POST",
          body: form.value,
        }
      );
      if (data.id) {
        const refreshTrigger = useState("files-refresh-trigger");
        refreshTrigger.value++;
        open.value = false;
        form.value.name = "";
        if (form.value.type === "folder") {
          router.push(`/${route.params.bucket}/${data.id}`);
        } else {
          window.location.reload();
        }
      }
    }
    loading.value = false;
  } catch (errors) {
    if (errors?.data?.message) {
      console.error(errors?.data.message);
      error.value = errors.data.message;
    } else {
      console.error(errors);
      error.value = "An error occurred. Please try again.";
    }
    loading.value = false;
  }
};
</script>
<template>
  <UModal
    v-model:open="open"
    :title="'Create ' + form.type"
    :description="`Create a new ${form.type}`"
    :ui="{ overlay: 'z-[70]', content: 'z-[80]' }"
  >
    <template #body>
      <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
        <UFormField
          :error="error"
          :help="`${friendlyPath}${formNamePreview}`"
        >
          <UInput
            label="Name"
            v-model="form.name"
            :placeholder="`Enter ${form.type} name`"
            size="xl"
            class="w-full"
            @keydown.enter.prevent="onSubmit"
          />
        </UFormField>
        <div class="flex justify-end gap-4 mt-8">
          <UButton type="button" label="Cancel" color="neutral" @click="open = false" />
          <UButton
            type="submit"
            label="Submit"
            color="primary"
            variant="solid"
            :loading="loading"
          />
        </div>
      </form>
    </template>
  </UModal>
  <UDropdownMenu
    :items="items"
    :modal="false"
    :ui="{
      content: 'z-50 w-48',
    }"
  >
    <UButton :icon="props.compact ? 'lucide:folder-plus' : 'lucide:plus'" :label="props.compact ? undefined : 'New'" :size="props.size" :variant="props.compact ? 'ghost' : 'outline'" color="neutral" :class="props.compact ? 'rounded-lg' : 'rounded-xl border-[var(--dam-line)] bg-[var(--dam-panel)] font-semibold shadow-[var(--dam-shadow-soft)]'" />
  </UDropdownMenu>
</template>
