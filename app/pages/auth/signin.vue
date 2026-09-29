<script setup lang="ts">
definePageMeta({ layout: "guest" });
useSeoMeta({
  title: "Sign In • Digital Asset Management",
});

const assetShowcase = [
  {
    title: "Brand Guidelines",
    type: "DOCUMENT",
    format: "PDF / DOCX",
    icon: "lucide:file-text",
    gradient: "from-indigo-900/60 via-indigo-950/40 to-black",
    accent: "text-indigo-400",
  },
  {
    title: "Cinematic Campaign",
    type: "4K VIDEO",
    format: "MP4 / PRORES",
    icon: "lucide:video",
    gradient: "from-purple-900/60 via-purple-950/40 to-black",
    accent: "text-purple-400",
  },
  {
    title: "Product Renders",
    type: "3D & IMAGE",
    format: "PNG / PSD",
    icon: "lucide:image",
    gradient: "from-blue-900/60 via-blue-950/40 to-black",
    accent: "text-blue-400",
  },
  {
    title: "Vector Intelligence",
    type: "PINECONE RAG",
    format: "EMBEDDINGS",
    icon: "lucide:sparkles",
    gradient: "from-violet-900/60 via-violet-950/40 to-black",
    accent: "text-violet-400",
  },
];
</script>

<template>
  <div class="relative min-h-screen w-full bg-black text-white selection:bg-indigo-500 selection:text-white flex flex-col justify-between overflow-x-hidden">
    <!-- Ambient glowing backdrops -->
    <div class="pointer-events-none fixed -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-indigo-600/15 via-purple-600/5 to-transparent blur-[120px] -z-10" />
    <div class="pointer-events-none fixed bottom-0 right-0 w-[600px] h-[400px] bg-gradient-to-tl from-indigo-900/10 to-transparent blur-[140px] -z-10" />

    <!-- Top Navbar -->
    <header class="w-full border-b border-white/5 bg-black/40 backdrop-blur-md px-6 py-4 sm:px-12 flex items-center justify-between z-20">
      <div class="flex items-center gap-3">
        <div class="size-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <UIcon name="lucide:database" class="size-4.5 text-white" />
        </div>
        <span class="font-bold text-lg tracking-tight text-white flex items-center gap-2">
          DIGITAL ASSET MANAGEMENT
          <span class="text-[10px] uppercase font-semibold tracking-wider text-indigo-400 border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 rounded-full">
            DAM Workspace
          </span>
        </span>
      </div>

      <div class="flex items-center gap-4 text-xs">
        <div class="hidden sm:flex items-center gap-2 text-zinc-400 border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 rounded-full">
          <span class="size-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>System Operational</span>
          <span class="text-zinc-600">•</span>
          <span class="text-zinc-300 font-medium">Pinecone RAG Active</span>
        </div>
      </div>
    </header>

    <!-- Main Hero + Auth section -->
    <main class="w-full max-w-7xl mx-auto px-6 sm:px-12 py-12 lg:py-16 grow flex items-center">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center w-full">
        <!-- Left Hero Content -->
        <div class="lg:col-span-7 flex flex-col gap-6 text-left">
          <div class="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-400 w-fit">
            <UIcon name="lucide:sparkles" class="size-3.5" />
            ENTERPRISE DIGITAL ASSET MANAGEMENT
          </div>

          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.08]">
            TURN ASSETS INTO
            <span class="block bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
              POWERFUL WORKFLOWS.
            </span>
          </h1>

          <p class="text-base sm:text-lg text-zinc-400 max-w-xl font-normal leading-relaxed">
            Centralized creative asset governance with instant semantic search, multi-format media ingestion, and isolated departmental permissions.
          </p>

          <!-- Supported Media showcase cards -->
          <div class="mt-4 pt-6 border-t border-zinc-800/80">
            <div class="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
              <UIcon name="lucide:folder-tree" class="size-3.5 text-indigo-400" />
              Supported Media & Intelligence
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div
                v-for="(item, idx) in assetShowcase"
                :key="idx"
                class="group relative overflow-hidden rounded-xl border border-zinc-800/90 bg-[#0d0d12] p-3.5 transition-all duration-300 hover:border-indigo-500/40 hover:-translate-y-1"
              >
                <div class="flex items-center justify-between mb-2">
                  <UIcon :name="item.icon" :class="['size-4.5', item.accent]" />
                  <span class="text-[9px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
                    {{ item.type }}
                  </span>
                </div>
                <div class="text-xs font-bold text-zinc-100 group-hover:text-white transition-colors truncate">
                  {{ item.title }}
                </div>
                <div class="text-[10px] text-zinc-400 mt-0.5 font-mono truncate">
                  {{ item.format }}
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Metrics Bar -->
          <div class="flex items-center gap-6 pt-3 text-xs text-zinc-400 font-medium">
            <div class="flex items-center gap-1.5">
              <UIcon name="lucide:check-circle-2" class="size-4 text-indigo-400" />
              <span>Departmental Scoping</span>
            </div>
            <div class="flex items-center gap-1.5">
              <UIcon name="lucide:check-circle-2" class="size-4 text-indigo-400" />
              <span>Automatic Video/Image Thumbnails</span>
            </div>
            <div class="flex items-center gap-1.5">
              <UIcon name="lucide:check-circle-2" class="size-4 text-indigo-400" />
              <span>Zero-Storage Cloud Workers</span>
            </div>
          </div>
        </div>

        <!-- Right Side: Auth Card -->
        <div class="lg:col-span-5 flex justify-center lg:justify-end w-full">
          <AuthCard
            title="Sign In to DAM"
            description="Sign in through Google OAuth to access your organization workspace."
          />
        </div>
      </div>
    </main>

    <!-- Clean Footer -->
    <footer class="w-full border-t border-white/5 py-6 px-6 sm:px-12 text-center text-xs text-zinc-400 flex flex-col sm:flex-row items-center justify-between gap-3">
      <div>
        © 2026 Digital Asset Management (DAM). All rights reserved.
      </div>
      <div class="flex items-center gap-6 text-zinc-400">
        <span>Pinecone Index Connected</span>
        <span>•</span>
        <span>AES-256 Storage</span>
        <span>•</span>
        <span>GDrive & Local Buckets</span>
      </div>
    </footer>
  </div>
</template>
