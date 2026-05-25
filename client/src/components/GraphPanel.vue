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
        <input v-model="keyword" placeholder="例如：光谷广场、2号线" @keyup.enter="runSearch" />
        <button @click="runSearch">查询</button>
      </div>
      <div v-if="searchResults.length" class="result-list">
        <button
          v-for="station in searchResults"
          :key="station.id"
          class="result-item"
          @click="pickStation(station.id)"
        >
          <strong>{{ station.name }}</strong>
          <span>{{ station.district }} · {{ categoryLabel(station.category) }}</span>
        </button>
      </div>
      <p v-else class="hint">支持站名、行政区、站点类型和线路号查询。</p>
    </section>

    <section class="query-card">
      <h2>路径规划</h2>
      <select v-model="fromStation">
        <option value="">起点站</option>
        <option v-for="station in stations" :key="station.id" :value="station.id">{{ station.name }}</option>
      </select>
      <select v-model="toStation">
        <option value="">终点站</option>
        <option v-for="station in stations" :key="station.id" :value="station.id">{{ station.name }}</option>
      </select>
      <button class="wide" @click="buildRoute">生成最少换乘方案</button>
      <div v-if="route" class="route-summary">
        <div class="route-count">
          <span>{{ route.stops }}</span><small>站</small>
          <span>{{ route.transfers }}</span><small>次换乘</small>
        </div>
        <ol>
          <li v-for="step in route.instructions" :key="`${step.lineId}-${step.from}-${step.to}`">
            <i :style="{ background: step.color }"></i>
            {{ step.lineName }}：{{ step.fromName }} 到 {{ step.toName }}，{{ step.stopCount }} 站
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
const searchResults = ref([])
const fromStation = ref('')
const toStation = ref('')
const route = ref(null)

const stations = computed(() => [...props.stations].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')))
const lines = computed(() => {
  const lineMap = new Map()
  props.stations.forEach((station) => {
    ;(station.lines || station.line_ids || []).forEach((line) => {
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

async function runSearch() {
  const q = keyword.value.trim()
  if (!q) {
    searchResults.value = []
    return
  }
  const matchedLine = q.match(/[2478]/)
  if (matchedLine) store.selectLine(`L${matchedLine[0]}`)
  const { data } = await searchStations(q)
  searchResults.value = data.success ? data.data : []
}

function pickStation(id) {
  store.selectStation(id, 'query')
}

async function buildRoute() {
  if (!fromStation.value || !toStation.value) return
  const { data } = await planRoute(fromStation.value, toStation.value)
  route.value = data.data
  store.setRoute(route.value)
  emit('route-built', route.value)
}

watch(() => store.selectedStationId, (id) => {
  if (!id) return
  if (!fromStation.value) {
    fromStation.value = id
  } else if (!toStation.value && id !== fromStation.value) {
    toStation.value = id
  }
})
</script>
