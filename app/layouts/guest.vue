<template>
  <div class="relative flex min-h-screen w-full flex-col items-center justify-center bg-white dark:bg-neutral-900">
    <div class="fixed right-4 top-4 z-20">
      <ColorMode />
    </div>
    <div class="w-full">
      <slot />
    </div>
  </div>
</template>