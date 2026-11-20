import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import EqWindow from './EqWindow'
import SearchWindow from './SearchWindow'
import './styles/global.css'

const route = window.location.hash.replace('#', '')

function Root() {
  if (route === 'eq') return <EqWindow />
  if (route === 'search') return <SearchWindow />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
