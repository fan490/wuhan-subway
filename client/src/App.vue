<template>
  <div class="app-shell">
    <ControlBar @refresh="reloadKey++" />
    <main class="workspace">
      <GraphPanel class="side-panel" :stations="stations" @route-built="currentRoute = $event" />
      <MapPanel :key="reloadKey" class="map-panel" @network-loaded="stations = $event.stations" />
    </main>
  </div>
</template>

<script setup>
import ControlBar from './components/ControlBar.vue'
import GraphPanel from './components/GraphPanel.vue'
import MapPanel from './components/MapPanel.vue'
import { ref } from 'vue'

const stations = ref([])
const currentRoute = ref(null)
const reloadKey = ref(0)
</script>
