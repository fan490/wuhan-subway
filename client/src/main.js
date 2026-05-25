import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './assets/style.css'
import 'vis-network/styles/vis-network.css'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
