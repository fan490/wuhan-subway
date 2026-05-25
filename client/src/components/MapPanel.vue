<template>
  <section class="map-shell">
    <div class="map-header">
      <strong>高德地图 — 武汉地铁线网</strong>
      <span>点击站点可定位，选择线路可筛选显示</span>
      <span v-if="loading" class="loading-tag">加载中...</span>
    </div>
    <div ref="mapContainer" class="leaflet-map"></div>

    <div v-if="loading" class="map-overlay">
      <div class="map-spinner"></div>
    </div>

    <div class="map-legend">
      <div class="legend-item">
        <span class="legend-line"></span> 路径方案
      </div>
      <div class="legend-item">
        <span class="legend-transfer"></span> 换乘站
      </div>
      <div class="legend-item">
        <span class="legend-start"></span> 起点 / <span class="legend-end"></span> 终点
      </div>
    </div>

    <div v-if="activeStation" class="station-dock">
      <strong>{{ activeStation.name }}</strong>
      <span>{{ activeStation.district }} · {{ categoryLabel(activeStation.category) }}</span>
      <div>
        <i v-for="line in activeStation.lines" :key="line.id" :style="{ background: line.color }">
          {{ line.name }}
        </i>
      </div>
      <div v-if="isRouteEndpoint" class="endpoint-badge">
        <span v-if="store.fromStationId === activeStation.id" class="badge from-badge">起点站</span>
        <span v-if="store.toStationId === activeStation.id" class="badge to-badge">终点站</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, watch, ref } from 'vue'
import L from 'leaflet'
import { fetchMetroNetwork } from '../api'
import { useMapGraphStore } from '../stores/mapGraph'

const emit = defineEmits(['network-loaded'])
const mapContainer = ref(null)
const network = ref(null)
const store = useMapGraphStore()
const loading = ref(false)

let map = null
let markerLayer = null
let lineLayer = null
let routeLayer = null
let highlightLayer = null
let endpointLayer = null

const AMAP_TILE_URL = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'

const stationMap = computed(() => new Map((network.value?.stations || []).map(station => [station.id, station])))
const lineMap = computed(() => new Map((network.value?.lines || []).map(line => [line.id, line])))
const activeStation = computed(() => stationMap.value.get(store.selectedStationId))

const isRouteEndpoint = computed(() =>
  store.fromStationId === store.selectedStationId || store.toStationId === store.selectedStationId
)

const transferStationIds = computed(() => {
  const instructions = store.routeInstructions
  if (!instructions.length) return new Set()
  const ids = new Set()
  ids.add(instructions[0].from)
  ids.add(instructions[instructions.length - 1].to)
  for (let i = 1; i < instructions.length; i++) {
    ids.add(instructions[i].from)
  }
  return ids
})

const routeLineColors = computed(() => {
  const segMap = new Map()
  for (const seg of (store.routeSegmentKeys || [])) {
    const [from, to, lineId] = seg.split('-')
    const key = `${from}-${to}`
    segMap.set(key, lineId)
  }
  return segMap
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

function decorateNetwork(data) {
  const lines = data.lines
  const stations = data.stations.map((station) => ({
    ...station,
    lines: lines.filter(line => line.stations.includes(station.id)),
  }))
  return { ...data, stations }
}

function stationIcon(station, ghost) {
  const isTransfer = station.lines.length > 1
  const color = isTransfer ? '#103c35' : station.lines[0]?.color || '#e85d3f'
  const size = isTransfer ? 18 : 14
  const opacity = ghost ? ';opacity:0.25' : ''
  return L.divIcon({
    className: 'metro-marker',
    html: `<span style="width:${size}px;height:${size}px;border-color:${color};background:${isTransfer ? color : '#fff'}${opacity}"></span>`,
    iconSize: [size + 8, size + 8],
    iconAnchor: [(size + 8) / 2, (size + 8) / 2],
  })
}

function endpointIcon(label, color) {
  return L.divIcon({
    className: 'endpoint-marker',
    html: `<span style="background:${color}">${label}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function transferIcon() {
  return L.divIcon({
    className: 'transfer-marker',
    html: '<span></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function renderLines() {
  if (!network.value || !lineLayer) return
  lineLayer.clearLayers()

  for (const line of network.value.lines) {
    const highlight = !store.selectedLineId || store.selectedLineId === line.id
    const latlngs = line.stations
      .map(id => stationMap.value.get(id))
      .filter(Boolean)
      .map(station => [station.lat, station.lng])
    const polyline = L.polyline(latlngs, {
      color: line.color,
      weight: store.selectedLineId === line.id ? 8 : 6,
      opacity: highlight ? 0.88 : 0.18,
      lineCap: 'round',
      lineJoin: 'round',
    }).bindPopup(`<b>${line.name}</b><br/>${line.direction}`)
    polyline.on('click', () => store.selectLine(line.id))
    polyline.addTo(lineLayer)
  }
}

function renderMarkers() {
  if (!network.value || !markerLayer) return
  markerLayer.clearLayers()

  for (const station of network.value.stations) {
    const onSelectedLine = !store.selectedLineId || station.lines.some(line => line.id === store.selectedLineId)
    const ghost = !onSelectedLine
    const marker = L.marker([station.lat, station.lng], { icon: stationIcon(station, ghost), opacity: ghost ? 0.35 : 1 })
      .bindPopup(`<b>${station.name}</b><br/>${station.district}<br/>${station.lines.map(line => line.name).join(' / ')}`)
      .on('click', () => store.selectStation(station.id, 'map'))
    marker.addTo(markerLayer)
  }
}

function renderEndpoints() {
  if (!endpointLayer) return
  endpointLayer.clearLayers()

  if (store.fromStationId) {
    const station = stationMap.value.get(store.fromStationId)
    if (station) {
      L.marker([station.lat, station.lng], { icon: endpointIcon('起', '#10b981'), zIndexOffset: 1000 })
        .bindPopup(`<b>起点：${station.name}</b>`)
        .addTo(endpointLayer)
    }
  }
  if (store.toStationId) {
    const station = stationMap.value.get(store.toStationId)
    if (station) {
      L.marker([station.lat, station.lng], { icon: endpointIcon('终', '#ef4444'), zIndexOffset: 1000 })
        .bindPopup(`<b>终点：${station.name}</b>`)
        .addTo(endpointLayer)
    }
  }
}

function renderRoute() {
  if (!network.value || !routeLayer) return
  routeLayer.clearLayers()
  if (!store.routeStationIds.length) return

  // 逐段绘制路径，支持换乘站不同颜色
  const instructions = store.routeInstructions
  if (instructions.length) {
    for (const inst of instructions) {
      const fromStation = stationMap.value.get(inst.from)
      const toStation = stationMap.value.get(inst.to)
      if (!fromStation || !toStation) continue
      const latlngs = [[fromStation.lat, fromStation.lng], [toStation.lat, toStation.lng]]

      L.polyline(latlngs, {
        color: '#111827',
        weight: 10,
        opacity: 0.38,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(routeLayer)
      L.polyline(latlngs, {
        color: inst.color || '#f59e0b',
        weight: 5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(routeLayer)
    }
  } else {
    const latlngs = store.routeStationIds
      .map(id => stationMap.value.get(id))
      .filter(Boolean)
      .map(station => [station.lat, station.lng])
    L.polyline(latlngs, {
      color: '#111827',
      weight: 10,
      opacity: 0.38,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(routeLayer)
    L.polyline(latlngs, {
      color: '#f59e0b',
      weight: 5,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(routeLayer)
  }

  // 换乘站标记
  for (const id of transferStationIds.value) {
    const station = stationMap.value.get(id)
    if (!station) continue
    L.marker([station.lat, station.lng], { icon: transferIcon(), zIndexOffset: 500 })
      .addTo(routeLayer)
  }

  // 自动缩放
  const allLatlngs = store.routeStationIds
    .map(id => stationMap.value.get(id))
    .filter(Boolean)
    .map(station => [station.lat, station.lng])
  if (allLatlngs.length) map.fitBounds(allLatlngs, { padding: [70, 70] })
}

function highlightStation(id) {
  if (!map || !highlightLayer) return
  highlightLayer.clearLayers()
  const station = stationMap.value.get(id)
  if (!station) return
  const latlng = [station.lat, station.lng]
  L.circleMarker(latlng, {
    radius: 18,
    color: '#f59e0b',
    fillColor: '#f59e0b',
    fillOpacity: 0.22,
    weight: 4,
  }).addTo(highlightLayer)
  map.flyTo(latlng, Math.max(map.getZoom(), 13), { duration: 0.7 })
}

function refreshLayers() {
  renderLines()
  renderMarkers()
  renderRoute()
  renderEndpoints()
}

async function loadData() {
  loading.value = true
  try {
    const { data } = await fetchMetroNetwork()
    if (data.success) {
      network.value = decorateNetwork(data)
      emit('network-loaded', network.value)
      refreshLayers()
      const allPoints = network.value.stations.map(station => [station.lat, station.lng])
      if (!map) return
      map.fitBounds(allPoints, { padding: [50, 50] })
    }
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  map = L.map(mapContainer.value, {
    center: [30.56, 114.34],
    zoom: 11,
    zoomControl: true,
  })

  L.tileLayer(AMAP_TILE_URL, {
    subdomains: ['1', '2', '3', '4'],
    attribution: '&copy; 高德地图',
    maxZoom: 18,
  }).addTo(map)

  lineLayer = L.layerGroup().addTo(map)
  routeLayer = L.layerGroup().addTo(map)
  markerLayer = L.layerGroup().addTo(map)
  highlightLayer = L.layerGroup().addTo(map)
  endpointLayer = L.layerGroup().addTo(map)

  await loadData()
})

watch(() => store.selectedLineId, refreshLayers)
watch(() => store.routeStationIds, () => { renderRoute(); renderEndpoints() }, { deep: true })
watch(() => store.selectedStationId, highlightStation)
watch(() => store.fromStationId, renderEndpoints)
watch(() => store.toStationId, renderEndpoints)

defineExpose({ refresh: loadData })

onBeforeUnmount(() => {
  if (map) map.remove()
})
</script>
