<script setup>
const route = useRoute();
const { folder } = useFolder();
const { departmentId, canUpload, isAdmin, isDeptHead, canCreateFolder } = useRole();
const type = ref("files");
const uploadProgress = ref({});
const totalFiles = ref(0);
const uploadedFiles = ref(0);
const isUploading = ref(false);
const nomenclatureError = ref("");
const emit = defineEmits(["success"]);

const showNomenclatureModal = ref(false);
const filesToRename = ref([]);

const onWizardSuccess = () => {
  showNomenclatureModal.value = false;
  filesToRename.value = [];
  emit("success");
};

// Fetch the department's nomenclature
const { data: nomenclature } = await useFetch(
  () => departmentId.value ? `/api/nomenclature/${departmentId.value}` : null
);

/**
 * Validate a filename against the department's nomenclature.
 * Returns null if valid, or an error string if invalid.
 */
const validateFilename = (filename) => {
  // Founders and dept heads bypass nomenclature
  if (isAdmin.value || isDeptHead.value) return null;
  if (!nomenclature.value?.segments?.length) return null;

  // Strip extension for validation
  const nameParts = filename.lastIndexOf(".");
  const nameWithoutExt = nameParts > 0 ? filename.slice(0, nameParts) : filename;
  const parts = nameWithoutExt.split("_");
  const segments = nomenclature.value.segments;

  if (parts.length !== segments.length) {
    return `Filename must have ${segments.length} parts separated by "_". Expected: ${segments.map((s) => s.key).join("_")}`;
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const val = parts[i];
    if (seg.allowedValues?.length && !seg.allowedValues.includes(val)) {
      return `"${val}" is not a valid value for "${seg.label}". Allowed: ${seg.allowedValues.join(", ")}`;
    }
  }
  return null;
};

const uploadFiles = async (event) => {
  const files = event.target.files;
  if (!files.length) return;

  // Validate all filenames first
  nomenclatureError.value = "";
  let hasNomenclatureError = false;
  for (const file of files) {
    const err = validateFilename(file.name);
    if (err) {
      hasNomenclatureError = true;
      break;
    }
  }

  if (hasNomenclatureError) {
    filesToRename.value = [...files];
    showNomenclatureModal.value = true;
    event.target.value = ""; // reset input
    return;
  }

  totalFiles.value = files.length;
  uploadedFiles.value = 0;
  isUploading.value = true;

  await Promise.all([...files].map(uploadFile));

  setTimeout(() => {
    isUploading.value = false;
    uploadProgress.value = {};
    emit("success");
  }, 1000);
};

const uploadFile = async (file) => {
  const relativePath = file.webkitRelativePath || file.name;
  const isGDrive = route.params.bucket && route.params.bucket.startsWith("gdrive_");

  if (isGDrive) {
    const idParam = route.params.id;
    const resolvedId = Array.isArray(idParam) ? (idParam.join("/") || "root") : (idParam || "root");
    uploadProgress.value[relativePath] = 0;
    const formData = new FormData();
    formData.append("files", file);

    try {
      await $fetch(`/api/gdrive/upload`, {
        method: "POST",
        query: { parentId: resolvedId },
        body: formData,
      });
      uploadProgress.value[relativePath] = 100;
      uploadedFiles.value++;
    } catch (err) {
      console.error("Google Drive upload failed:", err);
    }
    return;
  }

  const fileType = file.type.split("/")[0];
  let dimensions = null;
  if (fileType === "image") {
    const image = new Image();
    image.src = URL.createObjectURL(file);
    await new Promise((resolve) => {
      image.onload = () => {
        dimensions = image.width + "x" + image.height;
        resolve();
      };
    });
  }
  uploadProgress.value[relativePath] = 0;

  const currentFolderPath = folder.value?.path
    ? "/" + folder.value.path
    : route.params.bucket;

  let uploadPath = currentFolderPath;
  if (file.webkitRelativePath) {
    const pathParts = file.webkitRelativePath.split("/");
    pathParts.pop();
    if (pathParts.length > 0) {
      uploadPath = `${currentFolderPath}/${pathParts.join("/")}`;
    }
  }
  const partSize = chunkSize(file.size);
  const upload = useMultipartUpload(
    `/upload/${route.params.bucket}/${route.params.id || "root"}`,
    {
      partSize: partSize,
      concurrent: 10,
      prefix: uploadPath,
      fetchOptions: {
        headers: {
          "x-amz-meta-dimensions": dimensions,
          "x-amz-meta-content-type": file.type,
        },
      },
    }
  );
  const { progress, completed, abort } = upload(file);
  watch(progress, (value) => {
    uploadProgress.value[relativePath] = value;
  });

  await completed;
  uploadedFiles.value++;
  uploadProgress.value[relativePath] = 100;
};

const overallProgress = computed(() => {
  if (!Object.keys(uploadProgress.value).length) return 0;
  const sum = Object.values(uploadProgress.value).reduce(
    (acc, val) => acc + val,
    0
  );
  return Math.round(sum / Object.keys(uploadProgress.value).length);
});

// Nomenclature template display
const templateDisplay = computed(() =>
  nomenclature.value?.segments?.map((s) => s.key).join("_") ?? ""
);
</script>

<template>
  <div>
    <div class="space-y-2">
      <!-- Nomenclature hint for team members/leads/interns -->
      <div
        v-if="templateDisplay && !isAdmin && !isDeptHead"
        class="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800 rounded-lg px-3 py-2"
      >
        <span class="font-medium text-neutral-600 dark:text-neutral-300">Naming:</span>
        <code class="ml-1 font-mono">{{ templateDisplay }}</code>
      </div>

      <!-- Error -->
      <div
        v-if="nomenclatureError"
        class="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2"
      >
        <UIcon name="lucide:alert-circle" class="inline mr-1" />
        {{ nomenclatureError }}
      </div>

      <UButtonGroup>
        <UButton
          v-if="canCreateFolder"
          color="primary"
          variant="solid"
          :icon="type === 'files' ? 'lucide:file-up' : 'lucide:folder-up'"
          @click="type = type === 'folder' ? 'files' : 'folder'"
          class="opacity-80"
        />
        <UButton
          color="primary"
          variant="solid"
          :label="canCreateFolder && type === 'folder' ? 'Upload Folder' : 'Upload Files'"
          @click="$refs.fileInput.click()"
        />
        <input
          ref="fileInput"
          type="file"
          :accept="(!canCreateFolder || type === 'files') && '*'"
          :webkitdirectory="canCreateFolder && type === 'folder'"
          :multiple="!canCreateFolder || type === 'files'"
          @change="uploadFiles"
          class="hidden"
        />
      </UButtonGroup>
    </div>

    <UModal v-model:open="isUploading" :dismissible="false">
      <template #title>Uploading Files</template>
      <template #description
        >{{ uploadedFiles }} / {{ totalFiles }} complete</template
      >
      <template #body>
        <div class="space-y-4">
          <div>
            <p class="mb-1 font-medium">Overall Progress</p>
            <UProgress :value="overallProgress" color="primary" />
          </div>

          <div
            v-if="Object.keys(uploadProgress).length >= 1"
            class="max-h-60 overflow-y-auto space-y-2"
          >
            <div
              v-for="(progress, fileName) in uploadProgress"
              :key="fileName"
              class="text-sm"
            >
              <div class="flex justify-between mb-1">
                <p class="truncate">{{ fileName }}</p>
                <span>{{ progress.toFixed(1) }}%</span>
              </div>
              <UProgress :modelValue="progress" :max="100" color="primary" />
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <NomenclatureUploadModal
      v-slot="modal"
      v-model:open="showNomenclatureModal"
      :files="filesToRename"
      :folder="folder"
      @success="onWizardSuccess"
    />
  </div>
</template>
