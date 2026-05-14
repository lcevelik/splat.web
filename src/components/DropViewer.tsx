import React, { useEffect, useRef, useCallback, useState } from 'react'
import * as THREE from 'three'
import { CAMERA_SETTINGS, BG_COLOR } from '../constants'
import { SplatMesh, SplatFileType } from '@sparkjsdev/spark'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useStore } from '../store'
import { ArrowLeft, Upload } from 'lucide-react'


function getFileType(filename: string): SplatFileType {
    const ext = filename.toLowerCase().split('.').pop()
    switch (ext) {
        case 'splat': return SplatFileType.SPLAT
        case 'ksplat': return SplatFileType.KSPLAT
        case 'spz': return SplatFileType.SPZ
        case 'ply':
        default: return SplatFileType.PLY
    }
}

export default function DropViewer() {
    const { setViewMode } = useStore()

    const containerRef = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<THREE.Scene | null>(null)
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
    const controlsRef = useRef<OrbitControls | null>(null)
    const splatRef = useRef<SplatMesh | null>(null)
    const animationRef = useRef<number | null>(null)
    const keysRef = useRef<Set<string>>(new Set())
    const flySpeedRef = useRef(0.05)

    const [fileName, setFileName] = useState<string | null>(null)

    // WASD fly movement
    const applyFlyMovement = useCallback(() => {
        if (!cameraRef.current || !controlsRef.current) return
        const camera = cameraRef.current
        const controls = controlsRef.current
        const speed = flySpeedRef.current
        const keys = keysRef.current

        const forward = new THREE.Vector3()
        camera.getWorldDirection(forward)
        const right = new THREE.Vector3()
        right.crossVectors(forward, camera.up).normalize()

        let moved = false
        if (keys.has('w')) { camera.position.addScaledVector(forward, speed); moved = true }
        if (keys.has('s')) { camera.position.addScaledVector(forward, -speed); moved = true }
        if (keys.has('a')) { camera.position.addScaledVector(right, -speed); moved = true }
        if (keys.has('d')) { camera.position.addScaledVector(right, speed); moved = true }
        if (keys.has('q')) { camera.position.y -= speed; moved = true }
        if (keys.has('e')) { camera.position.y += speed; moved = true }

        if (moved) controls.target.copy(camera.position).add(forward)
        flySpeedRef.current = keys.has('shift') ? 0.15 : 0.05
    }, [])

    // Keyboard handlers
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.key.toLowerCase())
        const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase())
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [])

    // Initialize scene
    useEffect(() => {
        if (!containerRef.current) return

        const scene = new THREE.Scene()
        scene.background = new THREE.Color(BG_COLOR)
        sceneRef.current = scene

        const camera = new THREE.PerspectiveCamera(60, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.01, 1000)
        camera.position.copy(CAMERA_SETTINGS.position)
        camera.up.copy(CAMERA_SETTINGS.up)
        camera.lookAt(CAMERA_SETTINGS.target)
        cameraRef.current = camera

        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1))
        containerRef.current.appendChild(renderer.domElement)
        rendererRef.current = renderer

        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.05
        controls.target.copy(CAMERA_SETTINGS.target)
        controls.update()
        controlsRef.current = controls

        function animate() {
            animationRef.current = requestAnimationFrame(animate)
            applyFlyMovement()
            controls.update()
            renderer.render(scene, camera)
        }
        animate()

        const handleResize = () => {
            if (!containerRef.current || !camera || !renderer) return
            camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
            camera.updateProjectionMatrix()
            renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
        }
        window.addEventListener('resize', handleResize)

        return () => {
            window.removeEventListener('resize', handleResize)
            if (animationRef.current) cancelAnimationFrame(animationRef.current)
            if (splatRef.current) splatRef.current.dispose()
            if (controlsRef.current) controlsRef.current.dispose()
            if (rendererRef.current && containerRef.current) {
                containerRef.current.removeChild(rendererRef.current.domElement)
                rendererRef.current.dispose()
            }
        }
    }, [applyFlyMovement])

    // Handle file drop
    const handleFileDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const file = e.dataTransfer.files[0]
        if (!file || !sceneRef.current) return

        // Remove old splat
        if (splatRef.current) {
            sceneRef.current.remove(splatRef.current)
            splatRef.current.dispose()
        }

        const url = URL.createObjectURL(file)
        const fileType = getFileType(file.name)

        console.log('[DropViewer] Loading:', file.name, 'type:', fileType)

        const splat = new SplatMesh({ url, fileType })
        sceneRef.current.add(splat)
        splatRef.current = splat
        setFileName(file.name)
    }, [])

    // Take screenshot
    const handleScreenshot = useCallback(() => {
        if (!rendererRef.current) return
        const dataUrl = rendererRef.current.domElement.toDataURL('image/jpeg', 0.9)
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = 'splat-screenshot.jpg'
        a.click()
    }, [])

    // Check for "clean" mode synchronously
    const isMinimal = new URLSearchParams(window.location.search).get('clean') === 'true'

    return (
        <div className="w-full h-full bg-everforest-bg-hard flex flex-col"
            onDragOver={(e) => e.preventDefault()} onDrop={handleFileDrop}>
            {/* Header */}
            {!isMinimal && (
                <div className="p-4 flex items-center gap-4 bg-everforest-bg-medium border-b border-everforest-bg-soft">
                    <button onClick={() => setViewMode('gallery')} className="bg-everforest-bg-soft p-2 rounded-full hover:bg-everforest-bg-hard">
                        <ArrowLeft className="w-5 h-5 text-everforest-fg" />
                    </button>
                    <h1 className="text-xl font-bold text-everforest-green">Drop Viewer</h1>
                    {fileName && <span className="text-everforest-fg/50 text-sm">{fileName}</span>}
                    <div className="flex-1" />
                    {fileName && (
                        <button onClick={handleScreenshot} className="px-4 py-2 bg-everforest-green text-everforest-bg-hard rounded-lg hover:bg-everforest-aqua text-sm font-bold">
                            📸 Screenshot
                        </button>
                    )}
                </div>
            )}

            {/* Main viewer */}
            <div className="flex-1 relative min-h-0 overflow-hidden">
                <div ref={containerRef} className="absolute inset-0" />

                {/* Drop overlay when no file */}
                {!fileName && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-everforest-bg-hard/90 pointer-events-none">
                        <Upload className="w-16 h-16 text-everforest-green/50 mb-4" />
                        <p className="text-xl text-everforest-fg/70 mb-2">Drop a splat file here</p>
                        <p className="text-sm text-everforest-fg/40">Supports .ply, .splat, .ksplat, .spz</p>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-everforest-bg-medium border-t border-everforest-bg-soft">
                <p className="text-xs text-everforest-fg/40">WASD: Fly • Q/E: Up/Down • Mouse: Orbit • Drop new file to replace</p>
            </div>
        </div>
    )
}
