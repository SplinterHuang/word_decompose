<script setup lang="ts">
import { onMounted, ref } from "vue";

/** Sidebar 「单元」 entry — non-affix Root (unit_order optional). */
interface CourseRoot {
  id: string;
  unit_order?: number | null;
  title: string;
  form?: string;
  gloss_zh?: string;
}

interface Affix {
  id: string;
  form: string;
  role: string;
  gloss_zh?: string;
}

interface Example {
  id: string;
  kind: string;
  title: string;
  word_lemma?: string;
}

const emit = defineEmits<{
  unitSelected: [unitId: string];
  affixSelected: [affixId: string];
  exampleSelected: [exampleId: string];
  nodeSelected: [nodeId: string];
}>();

const units = ref<CourseRoot[]>([]);
const affixes = ref<Affix[]>([]);
const examples = ref<Example[]>([]);
const selectedUnitId = ref<string | null>(null);
const selectedAffixId = ref<string | null>(null);
const selectedExampleId = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const searchQuery = ref("");
const browseMode = ref<"units" | "affixes" | "examples">("units");

async function loadUnits() {
  loading.value = true;
  error.value = null;

  try {
    // Root list only (never /api/graph/units or Unit nodes in Neo4j)
    const res = await fetch("/api/graph/course-roots");
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(errorData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    units.value = data.courseRoots || [];

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

async function loadAffixes() {
  loading.value = true;
  error.value = null;

  try {
    const res = await fetch("/api/graph/affixes");
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(errorData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    affixes.value = data.affixes || [];

    // Auto-select first affix if available
    if (affixes.value.length > 0 && !selectedAffixId.value) {
      selectAffix(affixes.value[0].id);
    }
  } catch (err) {
    console.error("[UnitSelector] Error loading affixes:", err);
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function loadExamples() {
  loading.value = true;
  error.value = null;

  try {
    const res = await fetch("/api/graph/examples");
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(errorData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    examples.value = data.examples || [];

    if (examples.value.length > 0 && !selectedExampleId.value) {
      selectExample(examples.value[0].id);
    }
  } catch (err) {
    console.error("[UnitSelector] Error loading examples:", err);
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function clearSelection() {
  selectedUnitId.value = null;
  selectedAffixId.value = null;
  selectedExampleId.value = null;
}

function selectUnit(unitId: string) {
  selectedUnitId.value = unitId;
  selectedAffixId.value = null;
  selectedExampleId.value = null;
  emit("unitSelected", unitId);
}

function selectAffix(affixId: string) {
  selectedAffixId.value = affixId;
  selectedUnitId.value = null;
  selectedExampleId.value = null;
  emit("affixSelected", affixId);
}

function selectExample(exampleId: string) {
  selectedExampleId.value = exampleId;
  selectedUnitId.value = null;
  selectedAffixId.value = null;
  emit("exampleSelected", exampleId);
}

function reloadCurrentMode() {
  if (browseMode.value === "units") {
    loadUnits();
  } else if (browseMode.value === "affixes") {
    loadAffixes();
  } else {
    loadExamples();
  }
}

function switchMode(mode: "units" | "affixes" | "examples") {
  browseMode.value = mode;
  clearSelection();
  
  if (mode === "units") {
    if (units.value.length === 0) {
      loadUnits();
    } else if (units.value.length > 0) {
      selectUnit(units.value[0].id);
    }
  } else if (mode === "affixes") {
    if (affixes.value.length === 0) {
      loadAffixes();
    } else if (affixes.value.length > 0) {
      selectAffix(affixes.value[0].id);
    }
  } else if (examples.value.length === 0) {
    loadExamples();
  } else if (examples.value.length > 0) {
    selectExample(examples.value[0].id);
  }
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
    
    // If we get results, allow selecting them
    if (data.nodes && data.nodes.length > 0) {
      // For MVP: if first result is an affix Root, emit affixSelected
      // Otherwise emit nodeSelected to load its neighborhood
      const firstNode = data.nodes[0];
      if (firstNode.type === "Root" && firstNode.isAffix) {
        selectAffix(firstNode.id);
      } else if (firstNode.type === "Example") {
        selectExample(firstNode.id);
      } else {
        clearSelection();
        emit("nodeSelected", firstNode.id);
      }
    }
  } catch (err) {
    console.error("[UnitSelector] Search error:", err);
  }
}

function exampleKindLabel(kind: string): string {
  if (kind === "user_dialogue") return "对话";
  if (kind === "usage") return "用法";
  return "例";
}

onMounted(() => {
  loadUnits();
});
</script>

<template>
  <div class="unit-selector">
    <div class="selector-header">
      <h4>浏览</h4>
      <button v-if="error" @click="reloadCurrentMode" class="btn-retry">重试</button>
    </div>

    <div class="mode-switcher">
      <button 
        :class="['mode-btn', { active: browseMode === 'units' }]"
        @click="switchMode('units')"
      >
        单元
      </button>
      <button 
        :class="['mode-btn', { active: browseMode === 'affixes' }]"
        @click="switchMode('affixes')"
      >
        词缀
      </button>
      <button 
        :class="['mode-btn', { active: browseMode === 'examples' }]"
        @click="switchMode('examples')"
      >
        例句
      </button>
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
    <div v-else-if="browseMode === 'units' && units.length === 0" class="status-message">暂无单元</div>
    <div v-else-if="browseMode === 'affixes' && affixes.length === 0" class="status-message">暂无词缀</div>
    <div v-else-if="browseMode === 'examples' && examples.length === 0" class="status-message">暂无例句</div>

    <div v-else-if="browseMode === 'units'" class="units-list">
      <button
        v-for="unit in units"
        :key="unit.id"
        :class="['unit-item', { active: selectedUnitId === unit.id }]"
        @click="selectUnit(unit.id)"
      >
        <span class="unit-order">{{ typeof unit.unit_order === 'number' ? unit.unit_order : '?' }}</span>
        <div class="unit-text">
          <span class="unit-title">{{ unit.title }}</span>
          <span
            v-if="unit.gloss_zh && unit.gloss_zh !== unit.title"
            class="unit-gloss"
          >{{ unit.gloss_zh }}</span>
        </div>
      </button>
    </div>

    <div v-else-if="browseMode === 'affixes'" class="affixes-list">
      <button
        v-for="affix in affixes"
        :key="affix.id"
        :class="['affix-item', { active: selectedAffixId === affix.id }]"
        @click="selectAffix(affix.id)"
      >
        <span :class="['affix-badge', affix.role]">{{ affix.role === 'prefix' ? '前' : '后' }}</span>
        <div class="affix-info">
          <span class="affix-form">{{ affix.form }}</span>
          <span v-if="affix.gloss_zh" class="affix-gloss">{{ affix.gloss_zh }}</span>
        </div>
      </button>
    </div>

    <div v-else class="examples-list">
      <button
        v-for="example in examples"
        :key="example.id"
        :class="['example-item', { active: selectedExampleId === example.id }]"
        @click="selectExample(example.id)"
      >
        <span class="example-badge">{{ exampleKindLabel(example.kind) }}</span>
        <div class="example-info">
          <span class="example-title">{{ example.title }}</span>
          <span v-if="example.word_lemma" class="example-word">→ {{ example.word_lemma }}</span>
        </div>
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

.mode-switcher {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #ddd;
}

.mode-btn {
  flex: 1;
  padding: 0.5rem 1rem;
  background: #f8f9fa;
  color: #7f8c8d;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:hover {
  background: #e8f8f5;
}

.mode-btn.active {
  background: #4ecdc4;
  color: white;
  border-color: #4ecdc4;
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

.unit-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.unit-title {
  color: #2c3e50;
  font-size: 0.95rem;
  line-height: 1.3;
}

.unit-gloss {
  color: #7f8c8d;
  font-size: 0.8rem;
  line-height: 1.25;
}

.affixes-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.affix-item {
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

.affix-item:hover {
  background: #f8f9fa;
}

.affix-item.active {
  background: #fff4e6;
  border-left: 3px solid #ff9f40;
}

.affix-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  background: #ff9f40;
  color: white;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  flex-shrink: 0;
}

.affix-badge.suffix {
  background: #ff6b6b;
}

.affix-item.active .affix-badge {
  background: #ff8c1a;
}

.affix-item.active .affix-badge.suffix {
  background: #e74c3c;
}

.affix-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.affix-form {
  color: #2c3e50;
  font-size: 0.95rem;
  font-weight: 600;
}

.affix-gloss {
  color: #7f8c8d;
  font-size: 0.8rem;
}

.examples-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.example-item {
  width: 100%;
  display: flex;
  align-items: flex-start;
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

.example-item:hover {
  background: #f8f9fa;
}

.example-item.active {
  background: #f0ebff;
  border-left: 3px solid #9b59b6;
}

.example-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 0.25rem;
  background: #9b59b6;
  color: white;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  flex-shrink: 0;
}

.example-item.active .example-badge {
  background: #8e44ad;
}

.example-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.example-title {
  color: #2c3e50;
  font-size: 0.875rem;
  line-height: 1.35;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.example-word {
  color: #7f8c8d;
  font-size: 0.8rem;
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

  .mode-switcher {
    padding: 0.5rem 0.75rem;
  }

  .mode-btn {
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
  }

  .affix-item {
    padding: 0.625rem 0.875rem;
  }

  .unit-order,
  .affix-badge {
    min-width: 24px;
    height: 24px;
    font-size: 0.75rem;
  }

  .unit-title,
  .affix-form {
    font-size: 0.875rem;
  }

  .affix-gloss {
    font-size: 0.75rem;
  }

  .example-item {
    padding: 0.625rem 0.875rem;
  }

  .example-badge {
    min-width: 24px;
    height: 24px;
    font-size: 0.65rem;
  }

  .example-title {
    font-size: 0.8125rem;
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
