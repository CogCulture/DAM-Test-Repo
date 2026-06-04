<script setup>
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
const { canCreateFolder, canCreateFolderDirectly } = useRole();
const toast = useToast();

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
  result.push({
    label: "New File",
    icon: "i-lucide-file-plus",
    onSelect: () => {
      form.value.type = "file";
      open.value = true;
    },
  });
  return [result];
});

const friendlyPath = computed(() => {
  if (!folder.value) return route.params.bucket;
  if (!folder.value.breadcrumb || folder.value.breadcrumb.length === 0) {
    return `${route.params.bucket}/${folder.value.name}`;
  }
  const breadcrumbNames = folder.value.breadcrumb.map((b) => b.name);
  return `${route.params.bucket}/${breadcrumbNames.join("/")}`;
});

const onSubmit = async () => {
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
    const isGDrive = route.params.bucket && route.params.bucket.startsWith("gdrive_");
    const idParam = route.params.id;
    const resolvedId = Array.isArray(idParam) ? (idParam.join("/") || "root") : (idParam || "root");
    if (isGDrive) {
      const data = await $fetch("/api/gdrive/folder/create", {
        method: "POST",
        body: {
          parentId: resolvedId,
          folderName: form.value.name,
        },
      });
      if (data.folder?.id) {
        open.value = false;
        form.value.name = "";
        router.push(`/${route.params.bucket}/${data.folder.id}`);
      }
    } else if (form.value.type === "folder" && !canCreateFolderDirectly.value && canCreateFolder.value) {
      const data = await $fetch("/api/folder-requests", {
        method: "POST",
        body: {
          folderName: form.value.name,
          parentId: route.params.id || "root",
        },
      });
      toast.add({
        title: "Folder Request Submitted",
        description: `Your request to create folder "${form.value.name}" is pending approval from your Department Head.`,
        color: "warning"
      });
      open.value = false;
      form.value.name = "";
    } else {
      const data = await $fetch(
        `/api/folder/${route.params.bucket}/${route.params.id || "root"}`,
        {
          method: "POST",
          body: form.value,
        }
      );
      if (data.id) {
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
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField
          :error="error"
          :help="`${friendlyPath}/${form.name}`"
        >
          <UInput
            label="Name"
            v-model="form.name"
            :placeholder="`Enter ${form.type} name`"
            size="xl"
            class="w-full"
          />
        </UFormField>
        <div class="flex justify-end gap-4 mt-8">
          <UButton label="Cancel" color="neutral" @click="open = false" />
          <UButton
            label="Submit"
            color="primary"
            variant="solid"
            :loading="loading"
            @click="onSubmit"
          />
        </div>
      </div>
    </template>
  </UModal>
  <UDropdownMenu
    :items="items"
    :ui="{
      content: 'w-48',
    }"
  >
    <UButton icon="lucide:plus" label="New" />
  </UDropdownMenu>
</template>
