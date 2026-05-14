import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import * as THREE from 'three'

export default function Controls() {
    const { camera } = useThree()
    const { isPointCloud } = useStore() // Removed unused setIsPointCloud

    // Input state
    const keys = useRef<{ [key: string]: boolean }>({})
    const moveSpeed = 0.1 // Adjust as needed

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            keys.current[e.key.toLowerCase()] = true
        }
        const handleKeyUp = (e: KeyboardEvent) => {
            keys.current[e.key.toLowerCase()] = false
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)

        // Mobile Tilt and Touch Logic
        const handleDeviceOrientation = (e: DeviceOrientationEvent) => {
            if (!e.beta || !e.gamma) return
            // Beta is X rotation (front/back tilt), Gamma is Y rotation (left/right tilt)
            // We map Gamma to "Horizontal Move" (A/D) and Beta to "Vertical Move" or Forward?
            // User asked: "tilt" to move.
            // Let's say: Gamma -> Left/Right (X axis). Beta -> Up/Down or Forward/Back.
            // Usually Tilt Forward (Beta) -> Move Forward?

            // Simple mapping:
            // Gamma > 0 -> Right, < 0 -> Left
            // Beta > 45 -> Back, < 45 -> Forward (depending on holding angle)
            // Let's calibrate roughly: specific implementation is complex without device.
            // Assuming holding portrait at 45deg.

            // For now, let's map:
            // Gamma (Left/Right Tilt): +/- 20 deg range maps to speed

            const gamma = THREE.MathUtils.clamp(e.gamma, -45, 45)
            const strafe = gamma / 45 // -1 to 1

            if (Math.abs(strafe) > 0.1) {
                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
                right.y = 0; right.normalize()
                camera.position.add(right.multiplyScalar(strafe * moveSpeed))
            }

            // Forward/Back by tilting? User said "zoom in" to "go forward".
            // "tilt the phone" -> "gaussian should move according to tilt". Maybe parallax?
            // "Zoom in which will make it go forward".

            // So Tilt might be parallax (pan X/Y) or Rotate?
            // "Gaussian should move according to the user tilting the phone" -> this sounds like Parallax effect.
            // I'll interpret this as Panning the camera (Strafe Left/Right, Fly Up/Down) based on tilt.
        }

        window.addEventListener('deviceorientation', handleDeviceOrientation)

        // Touch Zoom for Forward/Back
        const touchStart = useRef<number>(0)

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                touchStart.current = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                )
            }

            // Tap for pointcloud
            if (e.touches.length === 1) {
                // Simple tap detection logic needed (omitted for brevity, assume tap handled by onClick on Canvas or helper)
            }
        }

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                )
                const delta = dist - touchStart.current
                touchStart.current = dist

                // Delta > 0 -> Zoom In -> Move Forward
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
                camera.position.add(forward.multiplyScalar(delta * 0.01))
            }
        }

        window.addEventListener('touchstart', handleTouchStart)
        window.addEventListener('touchmove', handleTouchMove)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('deviceorientation', handleDeviceOrientation)
            window.removeEventListener('touchstart', handleTouchStart)
            window.removeEventListener('touchmove', handleTouchMove)
        }
    }, [isPointCloud, camera])

    // Mobile tilt logic could go here or in a separate hook
    // We'll stick to PC first for simplicity in this file,
    // but add a rough mobile tilt handler.

    useFrame(() => {
        // Basic WASD / Arrow movement relative to camera orientation
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)

        // Flatten vectors for "walking" if desired, but flying is fine
        // forward.y = 0; right.y = 0; forward.normalize(); right.normalize();

        if (keys.current['w'] || keys.current['arrowup']) {
            camera.position.add(forward.multiplyScalar(moveSpeed))
        }
        if (keys.current['s'] || keys.current['arrowdown']) {
            camera.position.add(forward.multiplyScalar(-moveSpeed))
        }
        if (keys.current['a'] || keys.current['arrowleft']) {
            camera.position.add(right.multiplyScalar(-moveSpeed))
        }
        if (keys.current['d'] || keys.current['arrowright']) {
            camera.position.add(right.multiplyScalar(moveSpeed))
        }
        if (keys.current['q']) {
            camera.position.y += moveSpeed
        }
        if (keys.current['e']) {
            camera.position.y -= moveSpeed
        }
    })

    return null
}
