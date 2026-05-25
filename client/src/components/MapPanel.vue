<template>
  <section class="map-shell">
    <div class="map-header">
      <strong>高德地图 — 武汉地铁线网</strong>
      <span>点击站点可定位，选择线路可筛选显示</span>
    </div>
    <div ref="mapContainer" class="leaflet-map"></div>
    <div v-if="activeStation" class="station-dock">
      <strong>{{ activeStation.name }}</strong>
      <span>{{ activeStation.district }} · {{ categoryLabel(activeStation.category) }}</span>
      <div>
        <i v-for="line in activeStation.lines" :key="line.id" :style="{ background: line.color }">
          {{ line.name }}
        </i>
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

let map = null
let markerLayer = null
let lineLayer = null
let routeLayer = null
let highlightLayer = null

const AMAP_TILE_URL = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'

const stationMap = computed(() => new Map((network.value?.stations || []).map(station => [station.id, station])))
const lineMap = computed(() => new Map((network.value?.lines || []).map(line => [line.id, line])))
const activeStation = computed(() => stationMap.value.get(store.selectedStationId))

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

function stationIcon(station) {
  const isTransfer = station.lines.length > 1
  const color = isTransfer ? '#103c35' : station.lines[0]?.color || '#e85d3f'
  const size = isTransfer ? 18 : 14
  return L.divIcon({
    className: 'metro-marker',
    html: `<span style="width:${size}px;height:${size}px;border-color:${color};background:${isTransfer ? color : '#fff'}"></span>`,
    iconSize: [size + 8, size + 8],
    iconAnchor: [(size + 8) / 2, (size + 8) / 2],
  })
}

function renderLines() {
  if (!network.value || !lineLayer) return
  lineLayer.clearLayers()

  for (const line of network.value.lines) {
    if (store.selectedLineId && store.selectedLineId !== line.id) continue
    const latlngs = line.stations
      .map(id => stationMap.value.get(id))
      .filter(Boolean)
      .map(station => [station.lat, station.lng])
    const polyline = L.polyline(latlngs, {
      color: line.color,
      weight: store.selectedLineId === line.id ? 8 : 6,
      opacity: 0.88,
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
    if (store.selectedLineId && !station.lines.some(line => line.id === store.selectedLineId)) continue
    const marker = L.marker([station.lat, station.lng], { icon: stationIcon(station) })
      .bindPopup(`<b>${station.name}</b><br/>${station.district}<br/>${station.lines.map(line => line.name).join(' / ')}`)
      .on('click', () => store.selectStation(station.id, 'map'))
    marker.addTo(markerLayer)
  }
}

function renderRoute() {
  if (!network.value || !routeLayer) return
  routeLayer.clearLayers()
  if (!store.routeStationIds.length) return
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
  if (latlngs.length) map.fitBounds(latlngs, { padding: [70, 70] })
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

  const { data } = await fetchMetroNetwork()
  if (data.success) {
    network.value = decorateNetwork(data)
    emit('network-loaded', network.value)
    refreshLayers()
    const allPoints = network.value.stations.map(station => [station.lat, station.lng])
    map.fitBounds(allPoints, { padding: [50, 50] })
  }
})

watch(() => store.selectedLineId, refreshLayers)
watch(() => store.routeStationIds, renderRoute, { deep: true })
watch(() => store.selectedStationId, highlightStation)

onBeforeUnmount(() => {
  if (map) map.remove()
})
</script>
