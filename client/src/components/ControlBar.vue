<template>
  <header class="topbar">
    <div class="brand">
      <span>WEBGIS METRO FINDER</span>
      <strong>武汉地铁查询系统</strong>
    </div>
    <div class="topbar-meta">
      <button class="recheck-btn" :disabled="checking" @click="checkHealth">
        <span v-if="checking" class="spinner-sm"></span>
        {{ checking ? '检查中...' : '检查连接' }}
      </button>
      <button @click="$emit('refresh')">刷新数据</button>
      <span class="status-pill">
        <i :class="['dot', status.pg ? 'on' : 'off']"></i>
        PG{{ checking ? '' : '' }}
      </span>
      <span class="status-pill">
        <i :class="['dot', status.neo4j ? 'on' : 'off']"></i>
        Neo4j
      </span>
      <span v-if="checkResult" class="check-toast" :class="checkResult">{{ checkResult === 'ok' ? '全部在线' : '连接异常' }}</span>
    </div>
  </header>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { healthCheck } from '../api'

defineEmits(['refresh'])

const status = ref({ pg: false, neo4j: false })
const checking = ref(false)
const checkResult = ref('')
let pollTimer = null
let toastTimer = null

async function checkHealth() {
  checking.value = true
  checkResult.value = ''
  try {
    const { data } = await healthCheck()
    if (data.success) {
      status.value = data.status
      checkResult.value = data.status.pg && data.status.neo4j ? 'ok' : 'fail'
    } else {
      status.value = { pg: false, neo4j: false }
      checkResult.value = 'fail'
    }
  } catch (_) {
    status.value = { pg: false, neo4j: false }
    checkResult.value = 'fail'
  } finally {
    checking.value = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { checkResult.value = '' }, 2500)
  }
}

onMounted(() => {
  checkHealth()
  pollTimer = setInterval(checkHealth, 30000)
})

onBeforeUnmount(() => {
  clearInterval(pollTimer)
  clearTimeout(toastTimer)
})
</script>
