<script setup lang="ts">
import { onMounted, ref } from "vue";

const health = ref<string>("checking…");

onMounted(async () => {
  try {
    const res = await fetch("/api/health");
    const data = (await res.json()) as { ok?: boolean; service?: string };
    health.value = data.ok
      ? `API ok (${data.service ?? "unknown"})`
      : "API returned unexpected payload";
  } catch {
    health.value = "API unreachable — start apps/api with pnpm dev:api (127.0.0.1:4000)";
  }
});
</script>

<template>
  <main class="page">
    <h1>word-decompose</h1>
    <p>Vue 3 + Vite frontend scaffold</p>
    <p class="health">{{ health }}</p>
  </main>
</template>

<style scoped>
.page {
  font-family: "Segoe UI", system-ui, sans-serif;
  max-width: 40rem;
  margin: 4rem auto;
  padding: 0 1.5rem;
}
.health {
  color: #345;
}
</style>
