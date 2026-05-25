<template>
  <header class="topbar">
    <div class="brand">
      <span>WEBGIS METRO FINDER</span>
      <strong>武汉地铁查询系统</strong>
    </div>
    <div class="topbar-meta">
      <button @click="$emit('refresh')">刷新数据</button>
      <span class="status-pill">
        <i :class="['dot', status.pg ? 'on' : 'off']"></i>
        PG
      </span>
      <span class="status-pill">
        <i :class="['dot', status.neo4j ? 'on' : 'off']"></i>
        Neo4j
      </span>
    </div>
  </header>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { healthCheck } from '../api'

defineEmits(['refresh'])

const status = ref({ pg: false, neo4j: false })

async function checkHealth() {
  try {
    const { data } = await healthCheck()
    if (data.success) status.value = data.status
  } catch (_) {
    status.value = { pg: false, neo4j: false }
  }
}

onMounted(checkHealth)
</script>
