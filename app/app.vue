<template>
  <UApp :toaster="false">
    <NuxtLayout>
      <NuxtPage :page-key="(route) => route.fullPath" />
    </NuxtLayout>
    <FilePreview />
    <Move />
    <UploadProgressBar />
  </UApp>
</template>
