<template>
  <div class="app-shell">
    <ControlBar @clear-route="clearRoute" />
    <main class="workspace">
      <GraphPanel ref="graphPanel" class="side-panel" :stations="stations" @route-built="currentRoute = $event" />
      <MapPanel ref="mapPanel" class="map-panel" @network-loaded="stations = $event.stations" />
    </main>
  </div>
</template>

<script setup>
import ControlBar from './components/ControlBar.vue'
import GraphPanel from './components/GraphPanel.vue'
import MapPanel from './components/MapPanel.vue'
import { ref } from 'vue'
import { useMapGraphStore } from './stores/mapGraph'

const stations = ref([])
const currentRoute = ref(null)
const mapPanel = ref(null)
const graphPanel = ref(null)
const store = useMapGraphStore()

function clearRoute() {
  currentRoute.value = null
  store.resetPlanning()
  graphPanel.value?.clearPlanningPanel()
}
</script>
