import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useStore } from './store'
import SplatViewer from './components/SplatViewer'
import Gallery from './components/Gallery'
import UIOverlay from './components/UIOverlay'
import ZoomTransition from './components/ZoomTransition'
import DropViewer from './components/DropViewer'
import Ingest from './components/Ingest'

function App() {
  const { viewMode, setViewMode, setCurrentSplat, currentSplatId } = useStore()

  // Tilt and XR state
  const [tiltEnabled, setTiltEnabled] = useState(false)
  const [xrEnabled, setXrEnabled] = useState(false)

  // Handle URL params for easy sharing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const splatParam = params.get('splat')
    const view = params.get('view')

    if (splatParam) {
      // If param is just an ID (no slashes), assume it's a .ply in splats/
      const isPath = splatParam.includes('/')
      const url = isPath ? splatParam : `splats/${splatParam}.ply`
      const id = isPath ? 'custom-splat' : splatParam
      setCurrentSplat(url, id)
      setViewMode('viewer')
    } else if (view === 'drop') {
      setViewMode('drop')
    } else if (view === 'ingest') {
      setViewMode('ingest')
    }
  }, [setCurrentSplat, setViewMode])

  // ESC key to exit viewer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (viewMode === 'viewer' || viewMode === 'drop' || viewMode === 'ingest')) {
        setCurrentSplat(null)
        setViewMode('gallery')
        window.history.pushState({}, '', window.location.pathname)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, setCurrentSplat, setViewMode])

  // Reset tilt/XR when exiting viewer
  useEffect(() => {
    const isMobileNow = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    console.log('Tilt enable check:', { viewMode, isMobileNow, userAgent: navigator.userAgent })

    if (viewMode !== 'viewer') {
      setTiltEnabled(false)
      setXrEnabled(false)
    } else if (isMobileNow) {
      console.log('Enabling tilt for mobile!')
      setTiltEnabled(true)
    }
  }, [viewMode])

  // Update tab title
  useEffect(() => {
    if (viewMode === 'viewer' && currentSplatId) {
      document.title = `${currentSplatId} | 3DGS Gallery`
    } else {
      document.title = '3DGS Gallery'
    }
  }, [viewMode, currentSplatId])

  return (
    <div className="w-screen h-screen bg-everforest-bg-hard text-everforest-fg relative overflow-hidden">
      <AnimatePresence mode="popLayout">
        {viewMode === 'gallery' ? (
          <Gallery key="gallery" />
        ) : viewMode === 'viewer' ? (
          <motion.div
            key="viewer"
            className="w-full h-full relative z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <SplatViewer
              enableTiltControl={tiltEnabled}
              enableXR={xrEnabled}
            />
            <UIOverlay />
          </motion.div>
        ) : viewMode === 'drop' ? (
          <motion.div
            key="drop"
            className="w-full h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <DropViewer />
          </motion.div>
        ) : viewMode === 'ingest' ? (
          <motion.div
            key="ingest"
            className="w-full h-full z-20 bg-everforest-bg-hard relative overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <Ingest />
            {/* Close Button */}
            <button
              className="absolute top-4 right-4 p-2 bg-everforest-bg-soft rounded-full hover:bg-everforest-bg-medium transition-colors"
              onClick={() => setViewMode('gallery')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ZoomTransition />
    </div>
  )
}

export default App
