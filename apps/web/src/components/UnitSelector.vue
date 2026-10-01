<script setup lang="ts">
import { onMounted, ref } from "vue";

interface Unit {
  id: string;
  order: number;
  title: string;
}

const emit = defineEmits<{
  unitSelected: [unitId: string];
}>();

const units = ref<Unit[]>([]);
const selectedUnitId = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const searchQuery = ref("");

async function loadUnits() {
  loading.value = true;
  error.value = null;

  try {
    const res = await fetch("/api/graph/units");
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(errorData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    units.value = data.units || [];

    // Auto-select first unit if available
    if (units.value.length > 0 && !selectedUnitId.value) {
      selectUnit(units.value[0].id);
    }
  } catch (err) {
    console.error("[UnitSelector] Error loading units:", err);
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function selectUnit(unitId: string) {
  selectedUnitId.value = unitId;
  emit("unitSelected", unitId);
}

async function searchGraph() {
  if (!searchQuery.value.trim()) return;

  try {
    const res = await fetch(`/api/graph/search?q=${encodeURIComponent(searchQuery.value)}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log("[UnitSelector] Search results:", data.nodes);
    // For MVP, just log the results. Could emit them to the graph viewer in the future.
  } catch (err) {
    console.error("[UnitSelector] Search error:", err);
  }
}

onMounted(() => {
  loadUnits();
});
</script>

<template>
  <div class="unit-selector">
    <div class="selector-header">
      <h4>选择单元</h4>
      <button v-if="error" @click="loadUnits" class="btn-retry">重试</button>
    </div>

    <div class="search-box">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索词根或单词..."
        @keyup.enter="searchGraph"
      />
      <button @click="searchGraph" :disabled="!searchQuery.trim()">
        搜索
      </button>
    </div>

    <div v-if="loading" class="status-message">加载中...</div>
    <div v-else-if="error" class="status-message error">{{ error }}</div>
    <div v-else-if="units.length === 0" class="status-message">暂无数据</div>

    <div v-else class="units-list">
      <button
        v-for="unit in units"
        :key="unit.id"
        :class="['unit-item', { active: selectedUnitId === unit.id }]"
        @click="selectUnit(unit.id)"
      >
        <span class="unit-order">{{ typeof unit.order === 'number' ? unit.order : '?' }}</span>
        <span class="unit-title">{{ unit.title }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.unit-selector {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border-right: 1px solid #ddd;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #ddd;
}

.selector-header h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #2c3e50;
}

.btn-retry {
  padding: 0.25rem 0.75rem;
  background: #4ecdc4;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
}

.search-box {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  border-bottom: 1px solid #ddd;
}

.search-box input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  min-height: 44px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: inherit;
}

.search-box input:focus {
  outline: none;
  border-color: #4ecdc4;
}

.search-box button {
  padding: 0.5rem 1rem;
  min-height: 44px;
  background: #4ecdc4;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.search-box button:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}

.status-message {
  padding: 1rem;
  text-align: center;
  color: #7f8c8d;
  font-size: 0.875rem;
}

.status-message.error {
  color: #e74c3c;
}

.units-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.unit-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  min-height: 48px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  text-align: left;
  font-family: inherit;
}

.unit-item:hover {
  background: #f8f9fa;
}

.unit-item.active {
  background: #e8f8f5;
  border-left: 3px solid #4ecdc4;
}

.unit-order {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  background: #4ecdc4;
  color: white;
  border-radius: 50%;
  font-size: 0.875rem;
  font-weight: 600;
}

.unit-item.active .unit-order {
  background: #45b8af;
}

.unit-title {
  flex: 1;
  color: #2c3e50;
  font-size: 0.95rem;
}

@media (max-width: 768px) {
  .selector-header {
    padding: 1rem;
  }

  .search-box {
    padding: 0.75rem;
  }

  .units-list {
    padding: 0.25rem;
  }

  .unit-item {
    padding: 0.625rem 0.875rem;
  }
}

@media (max-width: 480px) {
  .selector-header {
    padding: 0.75rem 1rem;
  }

  .selector-header h4 {
    font-size: 0.95rem;
  }

  .search-box {
    padding: 0.625rem;
  }
}
</style>
