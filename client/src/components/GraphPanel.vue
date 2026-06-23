<template>
  <aside class="query-panel">
    <section class="intro-block">
      <p class="eyebrow">WUHAN METRO</p>
      <h1>地铁站点查询与换乘规划</h1>
      <p>在高德地图上查看武汉地铁站点、线路走向，并生成站点间的最少换乘方案。</p>
    </section>

    <section class="query-card">
      <h2>站点或线路查询</h2>
      <div class="search-row">
        <div class="search-input-wrap">
          <input
            v-model="keyword"
            placeholder="搜索站名、行政区..."
            @input="onSearchInput"
            @focus="onSearchFocus"
            @keyup.enter="runSearch"
          />
          <div v-if="searchSuggestions.length && showSuggestions" class="suggest-dropdown">
            <button
              v-for="station in searchSuggestions"
              :key="station.id"
              class="suggest-item"
              @click="viewStationOnMap(station.id)"
            >
              <div class="suggest-info">
                <strong>{{ station.name }}</strong>
                <span>{{ station.district }} · {{ categoryLabel(station.category) }}</span>
              </div>
              <div class="suggest-actions" @click.stop>
                <span class="mini-btn" @click="setFrom(station.id)" title="设为起点">起</span>
                <span class="mini-btn" @click="setTo(station.id)" title="设为终点">终</span>
              </div>
            </button>
          </div>
          <div v-if="keyword && !searchSuggestions.length && searchDone" class="suggest-dropdown">
            <p class="no-result">未找到匹配站点</p>
          </div>
        </div>
        <button @click="runSearch">查询</button>
      </div>
    </section>

    <section class="query-card">
      <h2>路径规划</h2>

      <div class="endpoint-row">
        <span class="endpoint-tag from">起</span>
        <div class="endpoint-input-wrap">
          <input
            v-model="fromInput"
            placeholder="输入起点站名"
            @input="onFromInput"
            @focus="onFromFocus"
          />
          <div v-if="fromSuggestions.length && showFromSuggestions" class="suggest-dropdown">
            <button
              v-for="station in fromSuggestions"
              :key="station.id"
              class="suggest-item"
              @click="setFrom(station.id)"
            >
              <strong>{{ station.name }}</strong>
              <span>{{ station.district }}</span>
            </button>
          </div>
        </div>
        <button v-if="store.fromStationId" class="clear-btn" @click="clearFrom" title="清除起点">&times;</button>
      </div>

      <div class="endpoint-row">
        <span class="endpoint-tag to">终</span>
        <div class="endpoint-input-wrap">
          <input
            v-model="toInput"
            placeholder="输入终点站名"
            @input="onToInput"
            @focus="onToFocus"
          />
          <div v-if="toSuggestions.length && showToSuggestions" class="suggest-dropdown">
            <button
              v-for="station in toSuggestions"
              :key="station.id"
              class="suggest-item"
              @click="setTo(station.id)"
            >
              <strong>{{ station.name }}</strong>
              <span>{{ station.district }}</span>
            </button>
          </div>
        </div>
        <button v-if="store.toStationId" class="clear-btn" @click="clearTo" title="清除终点">&times;</button>
      </div>

      <div class="route-actions">
        <button class="wide" :disabled="routeLoading" @click="buildRoute">
          <span v-if="routeLoading" class="spinner"></span>
          {{ routeLoading ? '计算中...' : '生成最少换乘方案' }}
        </button>
        <button v-if="store.fromStationId || store.toStationId" class="wide outline" @click="clearAllEndpoints">
          清除全部
        </button>
      </div>

      <p v-if="routeError" class="error-msg">{{ routeError }}</p>

      <div v-if="route" class="route-summary">
        <div class="route-count">
          <span>{{ route.stops }}</span><small>站</small>
          <span>{{ route.transfers }}</span><small>次换乘</small>
        </div>
        <ol>
          <li v-for="(step, idx) in route.instructions" :key="idx">
            <i :style="{ background: step.color }"></i>
            <span class="step-text">
              <strong>{{ step.lineName }}</strong>
              {{ step.fromName }} → {{ step.toName }}
              <em>{{ step.stopCount }} 站</em>
            </span>
          </li>
        </ol>
      </div>
      <p v-else class="hint">可直接点击地图站点自动填入起终点。</p>
    </section>

    <section class="line-card">
      <h2>线路筛选</h2>
      <button
        v-for="line in lines"
        :key="line.id"
        class="line-filter"
        :class="{ active: store.selectedLineId === line.id }"
        @click="store.selectLine(line.id)"
      >
        <i :style="{ background: line.color }"></i>
        {{ line.name }}
      </button>
    </section>
  </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { planRoute, searchStations } from '../api'
import { useMapGraphStore } from '../stores/mapGraph'

const props = defineProps({
  stations: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['route-built'])
const store = useMapGraphStore()

const keyword = ref('')
const searchSuggestions = ref([])
const showSuggestions = ref(false)
const searchDone = ref(false)
const fromInput = ref('')
const toInput = ref('')
const fromSuggestions = ref([])
const showFromSuggestions = ref(false)
const toSuggestions = ref([])
const showToSuggestions = ref(false)
const route = ref(null)
const routeError = ref('')
const routeLoading = ref(false)

let searchTimer = null
let fromTimer = null
let toTimer = null

const stations = computed(() => [...props.stations].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')))

const lines = computed(() => {
  const lineMap = new Map()
  props.stations.forEach((station) => {
    ;(station.lines || []).forEach((line) => {
      if (typeof line === 'object') lineMap.set(line.id, line)
    })
  })
  return Array.from(lineMap.values()).sort((a, b) => a.id.localeCompare(b.id))
})

const categoryMap = {
  airport_hub: '机场枢纽',
  rail_hub: '铁路枢纽',
  commercial: '商圈',
  university: '高校',
  transfer: '换乘站',
  hospital: '医院',
  landmark: '地标',
  normal: '普通站',
}

function categoryLabel(category) {
  return categoryMap[category] || '站点'
}

function filterStations(query) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return stations.value.filter((s) => {
    if (s.name.toLowerCase().includes(q)) return true
    if (s.district.toLowerCase().includes(q)) return true
    if (categoryLabel(s.category).includes(q)) return true
    if ((s.lines || []).some((l) => l.name.includes(q))) return true
    return false
  }).slice(0, 8)
}

// ── 搜索自动补全 ──
function onSearchInput() {
  clearTimeout(searchTimer)
  searchDone.value = false
  searchTimer = setTimeout(() => {
    searchSuggestions.value = filterStations(keyword.value)
    showSuggestions.value = true
    if (keyword.value && !searchSuggestions.value.length) searchDone.value = true
  }, 200)
}

function onSearchFocus() {
  if (searchSuggestions.value.length) showSuggestions.value = true
}

function runSearch() {
  clearTimeout(searchTimer)
  const q = keyword.value.trim()
  if (!q) {
    searchSuggestions.value = []
    showSuggestions.value = false
    searchDone.value = false
    return
  }
  // 动态匹配线路号
  const lineNumMatch = q.match(/(\d+)号线?/)
  if (lineNumMatch) {
    const candidate = `L${lineNumMatch[1]}`
    if (lines.value.some((l) => l.id === candidate)) store.selectLine(candidate)
  }
  searchSuggestions.value = filterStations(q)
  showSuggestions.value = true
  searchDone.value = searchSuggestions.value.length === 0
}

function viewStationOnMap(id) {
  store.selectStation(id, 'query')
  showSuggestions.value = false
}

// ── 起终点搜索 ──
function onFromInput() {
  clearTimeout(fromTimer)
  fromTimer = setTimeout(() => {
    fromSuggestions.value = filterStations(fromInput.value || '')
    showFromSuggestions.value = true
  }, 200)
}

function onFromFocus() {
  if (fromSuggestions.value.length) showFromSuggestions.value = true
}

function onToInput() {
  clearTimeout(toTimer)
  toTimer = setTimeout(() => {
    toSuggestions.value = filterStations(toInput.value || '')
    showToSuggestions.value = true
  }, 200)
}

function onToFocus() {
  if (toSuggestions.value.length) showToSuggestions.value = true
}

function setFrom(id) {
  store.setFromStation(id)
  const station = stations.value.find((s) => s.id === id)
  fromInput.value = station ? station.name : ''
  fromSuggestions.value = []
  showFromSuggestions.value = false
  routeError.value = ''
}

function setTo(id) {
  store.setToStation(id)
  const station = stations.value.find((s) => s.id === id)
  toInput.value = station ? station.name : ''
  toSuggestions.value = []
  showToSuggestions.value = false
  routeError.value = ''
}

function clearFrom() {
  store.clearFromStation()
  fromInput.value = ''
  routeError.value = ''
}

function clearTo() {
  store.clearToStation()
  toInput.value = ''
  routeError.value = ''
}

function clearAllEndpoints() {
  clearFrom()
  clearTo()
  route.value = null
  store.clearRoute()
}

function clearPlanningPanel() {
  keyword.value = ''
  searchSuggestions.value = []
  showSuggestions.value = false
  searchDone.value = false
  fromInput.value = ''
  toInput.value = ''
  fromSuggestions.value = []
  toSuggestions.value = []
  showFromSuggestions.value = false
  showToSuggestions.value = false
  route.value = null
  routeError.value = ''
}

// ── 路径规划 ──
async function buildRoute() {
  routeError.value = ''
  if (!store.fromStationId || !store.toStationId) {
    routeError.value = '请先选择起点站和终点站'
    return
  }
  if (store.fromStationId === store.toStationId) {
    routeError.value = '起点和终点不能相同'
    return
  }
  routeLoading.value = true
  try {
    const { data } = await planRoute(store.fromStationId, store.toStationId)
    if (!data.success || !data.data) {
      routeError.value = data.error || '未找到可达路径'
      route.value = null
      store.clearRoute()
    } else {
      route.value = data.data
      store.setRoute(route.value)
      emit('route-built', route.value)
    }
  } catch (e) {
    routeError.value = '网络请求失败，请检查后端服务是否启动'
    route.value = null
    store.clearRoute()
  } finally {
    routeLoading.value = false
  }
}

// ── 地图点击自动填入起终点 ──
watch(() => store.selectedStationId, (id) => {
  if (!id) return
  if (!store.fromStationId) {
    setFrom(id)
  } else if (!store.toStationId && id !== store.fromStationId) {
    setTo(id)
  }
})

// ── 外部点击关闭下拉 ──
function closeAllDropdowns(e) {
  if (!e.target.closest('.suggest-dropdown') && !e.target.closest('input')) {
    showSuggestions.value = false
    showFromSuggestions.value = false
    showToSuggestions.value = false
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('click', closeAllDropdowns)
}

defineExpose({ clearPlanningPanel })
</script>
