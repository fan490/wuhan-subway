import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

export function fetchMetroNetwork() {
  return api.get('/metro/network')
}

export function searchStations(q) {
  return api.get('/metro/search', { params: { q } })
}

export function planRoute(from, to) {
  return api.get('/metro/route', { params: { from, to } })
}

export function fetchGraph() {
  return api.get('/graph')
}

export function fetchStacCatalog() {
  return api.get('/stac/catalog')
}

export function fetchJsonSource() {
  return api.get('/source-data/json')
}

export function fetchXmlSource() {
  return api.get('/source-data/xml')
}

export function healthCheck() {
  return api.get('/health')
}
