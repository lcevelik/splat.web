import { ArrowLeft, Box, Eye, EyeOff, X, Smartphone, Maximize, Minimize } from 'lucide-react'
import { useStore } from '../store'
import { useEffect, useState } from 'react'
import { useDeviceOrientation } from '../hooks/useDeviceOrientation'

export default function UIOverlay() {
    const { setViewMode, setCurrentSplat, enterAR, exitAR, isARActive, arShowCameraFeed, toggleARCameraFeed } = useStore()
    const { hasPermission, requestPermission, isMobile, orientation } = useDeviceOrientation()
    const [showSensorButton, setShowSensorButton] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)

    // Check for clean mode synchronously
    const isClean = new URLSearchParams(window.location.search).get('clean') === 'true'

    // Handle fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement)
        }
        document.addEventListener('fullscreenchange', handleFullscreenChange)
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }, [])

    const toggleFullscreen = async () => {
        if (!document.fullscreenElement) {
            try {
                await document.documentElement.requestFullscreen()
            } catch (e) {
                console.error("Failed to enter fullscreen", e)
            }
        } else {
            if (document.exitFullscreen) {
                await document.exitFullscreen()
            }
        }
    }

    // Show sensor button if on mobile and orientation isn't working
    useEffect(() => {
        if (isMobile && (hasPermission === null || (hasPermission === true && orientation.beta === null))) {
            setShowSensorButton(true)
        } else if (orientation.beta !== null) {
            setShowSensorButton(false)
        }
    }, [isMobile, hasPermission, orientation])

    // Strict AR Support Check
    const [supportsAR, setSupportsAR] = useState(false)
    useEffect(() => {
        if ('xr' in navigator) {
            // @ts-ignore
            navigator.xr.isSessionSupported('immersive-ar')
                .then((supported: boolean) => setSupportsAR(supported))
                .catch(() => setSupportsAR(false))
        }
    }, [])

    const handleBack = () => {
        if (isARActive) {
            exitAR()
        }
        // Clear URL params when going back
        window.history.pushState({}, '', window.location.pathname)
        setCurrentSplat(null)
        setViewMode('gallery')
    }

    if (isClean) return null

    return (
        <>
            <div className="absolute top-0 left-0 right-0 p-4 z-40 flex justify-between items-start pointer-events-none">
                {/* Back Button - Always visible */}
                <button
                    onClick={handleBack}
                    className="pointer-events-auto bg-everforest-bg-medium/50 backdrop-blur p-2 rounded-full hover:bg-everforest-bg-soft transition-colors group"
                    title="Back to Gallery (ESC)"
                >
                    <ArrowLeft className="w-6 h-6 text-everforest-fg group-hover:text-everforest-green" />
                </button>

                <div className="flex gap-2 pointer-events-auto">
                    {/* Fullscreen Toggle */}
                    <button
                        onClick={toggleFullscreen}
                        className="p-2 rounded-full backdrop-blur bg-everforest-bg-medium/50 text-everforest-fg hover:bg-everforest-bg-soft transition-colors"
                        title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                    >
                        {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
                    </button>

                    {/* AR Camera Feed Toggle - Only during AR */}
                    {isARActive && (
                        <button
                            onClick={toggleARCameraFeed}
                            className="p-2 rounded-full backdrop-blur bg-everforest-bg-medium/50 text-everforest-fg hover:bg-everforest-bg-soft transition-colors"
                            title={arShowCameraFeed ? "Hide Camera (VR Mode)" : "Show Camera (AR Mode)"}
                        >
                            {arShowCameraFeed ? <Eye className="w-6 h-6" /> : <EyeOff className="w-6 h-6" />}
                        </button>
                    )}

                    {/* Exit AR Button - Only during AR */}
                    {isARActive && (
                        <button
                            onClick={exitAR}
                            className="p-2 rounded-full backdrop-blur bg-red-500/80 text-white hover:bg-red-600 transition-colors"
                            title="Exit AR"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    )}

                    {/* AR Mode Start Button - Only when not in AR and supported */}
                    {supportsAR && !isARActive && (
                        <button
                            onClick={enterAR}
                            className="p-2 rounded-full backdrop-blur bg-everforest-bg-medium/50 text-everforest-fg hover:bg-everforest-bg-soft transition-colors"
                            title="Start AR Experience"
                        >
                            <Box className="w-6 h-6" />
                        </button>
                    )}

                    {/* Sensor Permission Button - Only on mobile when sensors not working */}
                    {showSensorButton && !isARActive && (
                        <button
                            onClick={async () => {
                                const granted = await requestPermission()
                                if (granted) {
                                    setShowSensorButton(false)
                                }
                            }}
                            className="p-2 rounded-full backdrop-blur bg-everforest-orange/80 text-white hover:bg-everforest-orange transition-colors animate-pulse"
                            title="Enable Tilt Sensor"
                        >
                            <Smartphone className="w-6 h-6" />
                        </button>
                    )}
                </div>
            </div>
        </>
    )
}
