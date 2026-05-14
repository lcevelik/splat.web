import { useState, useEffect, useCallback, useRef } from 'react'

interface OrientationData {
    alpha: number | null
    beta: number | null
    gamma: number | null
}

interface UseDeviceOrientationReturn {
    orientation: OrientationData
    isSupported: boolean
    hasPermission: boolean | null
    isMobile: boolean
    requestPermission: () => Promise<boolean>
    error: string | null
}

function isMobileDevice(): boolean {
    if (typeof window === 'undefined') return false
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

export function isIOSDevice(): boolean {
    if (typeof window === 'undefined') return false
    return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function isAndroidDevice(): boolean {
    if (typeof window === 'undefined') return false
    return /Android/i.test(navigator.userAgent)
}

export function useDeviceOrientation(): UseDeviceOrientationReturn {
    const [orientation, setOrientation] = useState<OrientationData>({
        alpha: null,
        beta: null,
        gamma: null,
    })
    const [isSupported] = useState(() => typeof window !== 'undefined' && 'DeviceOrientationEvent' in window)
    const [hasPermission, setHasPermission] = useState<boolean | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isMobile] = useState(() => isMobileDevice())
    const listenerAddedRef = useRef(false)

    // Handle orientation event
    const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
        // Only update if we have real values
        if (event.alpha !== null || event.beta !== null || event.gamma !== null) {
            setOrientation({
                alpha: event.alpha,
                beta: event.beta,
                gamma: event.gamma,
            })
        }
    }, [])

    // Request permission - required for iOS 13+ and now recommended for Android
    const requestPermission = useCallback(async (): Promise<boolean> => {
        console.log('[DeviceOrientation] Requesting permission...')

        // Check if we need to use requestPermission API
        if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            try {
                const permission = await (DeviceOrientationEvent as any).requestPermission()
                console.log('[DeviceOrientation] Permission result:', permission)
                if (permission === 'granted') {
                    setHasPermission(true)
                    setError(null)
                    return true
                } else {
                    setHasPermission(false)
                    setError('Permission denied by user')
                    return false
                }
            } catch (err) {
                console.error('[DeviceOrientation] Permission request error:', err)
                setError('Failed to request permission')
                setHasPermission(false)
                return false
            }
        }

        // For browsers that don't have requestPermission, just try to add the listener
        // This covers older Android Chrome and desktop
        console.log('[DeviceOrientation] No requestPermission API, trying direct event listener')
        setHasPermission(true)
        return true
    }, [])

    // Automatically request permission on mobile devices
    useEffect(() => {
        if (!isSupported || !isMobile) return

        // Try to get permission automatically
        requestPermission()
    }, [isSupported, isMobile, requestPermission])

    // Set up the event listener when permission is granted
    useEffect(() => {
        if (!isSupported || hasPermission !== true || listenerAddedRef.current) return

        console.log('[DeviceOrientation] Adding event listener')
        window.addEventListener('deviceorientation', handleOrientation, true)
        listenerAddedRef.current = true

        return () => {
            console.log('[DeviceOrientation] Removing event listener')
            window.removeEventListener('deviceorientation', handleOrientation, true)
            listenerAddedRef.current = false
        }
    }, [isSupported, hasPermission, handleOrientation])

    return {
        orientation,
        isSupported,
        hasPermission,
        isMobile,
        requestPermission,
        error,
    }
}
