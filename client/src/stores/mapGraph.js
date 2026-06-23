import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMapGraphStore = defineStore('mapGraph', () => {
  const selectedStationId = ref(null)
  const selectedLineId = ref(null)
  const fromStationId = ref(null)
  const toStationId = ref(null)
  const routeStationIds = ref([])
  const routeSegmentKeys = ref([])
  const routeSegments = ref([])
  const routeInstructions = ref([])
  const source = ref(null)

  function selectStation(id, src = 'diagram') {
    selectedStationId.value = id
    source.value = src
  }

  function selectLine(id) {
    selectedLineId.value = selectedLineId.value === id ? null : id
  }

  function setFromStation(id) {
    fromStationId.value = id
  }

  function setToStation(id) {
    toStationId.value = id
  }

  function clearFromStation() {
    fromStationId.value = null
  }

  function clearToStation() {
    toStationId.value = null
  }

  function setRoute(route) {
    routeStationIds.value = route?.stations?.map(station => station.id) || []
    routeSegmentKeys.value = route?.segments?.map(segment => `${segment.from}-${segment.to}-${segment.lineId}`) || []
    routeSegments.value = route?.segments || []
    routeInstructions.value = route?.instructions || []
  }

  function clearRoute() {
    routeStationIds.value = []
    routeSegmentKeys.value = []
    routeSegments.value = []
    routeInstructions.value = []
  }

  function resetPlanning() {
    selectedStationId.value = null
    selectedLineId.value = null
    fromStationId.value = null
    toStationId.value = null
    source.value = null
    clearRoute()
  }

  return {
    selectedStationId,
    selectedLineId,
    fromStationId,
    toStationId,
    routeStationIds,
    routeSegmentKeys,
    routeSegments,
    routeInstructions,
    source,
    selectStation,
    selectLine,
    setFromStation,
    setToStation,
    clearFromStation,
    clearToStation,
    setRoute,
    clearRoute,
    resetPlanning,
  }
})
