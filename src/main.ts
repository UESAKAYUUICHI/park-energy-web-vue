import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import AppLoadingState from './components/app/AppLoadingState.vue'
import AppSelect from './components/app/AppSelect.vue'
import './styles/index.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.component('AppSelect', AppSelect)
app.component('AppLoadingState', AppLoadingState)

app.mount('#app')
