import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMapGraphStore = defineStore('mapGraph', () => {
  const selectedStationId = ref(null)
  const selectedLineId = ref(null)
  const routeStationIds = ref([])
  const routeSegmentKeys = ref([])
  const source = ref(null)

  function selectStation(id, src = 'diagram') {
    selectedStationId.value = id
    source.value = src
  }

  function selectLine(id) {
    selectedLineId.value = selectedLineId.value === id ? null : id
  }

  function setRoute(route) {
    routeStationIds.value = route?.stations?.map(station => station.id) || []
    routeSegmentKeys.value = route?.segments?.map(segment => `${segment.from}-${segment.to}-${segment.lineId}`) || []
  }

  function clearRoute() {
    routeStationIds.value = []
    routeSegmentKeys.value = []
  }

  return {
    selectedStationId,
    selectedLineId,
    routeStationIds,
    routeSegmentKeys,
    source,
    selectStation,
    selectLine,
    setRoute,
    clearRoute,
  }
})
