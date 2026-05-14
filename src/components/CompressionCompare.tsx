import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { SplatMesh, SplatFileType } from '@sparkjsdev/spark'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useStore } from '../store'
import { ArrowLeft, Upload, Loader2 } from 'lucide-react'
import { CAMERA_SETTINGS } from '../constants'

// Everforest bg-hard
const BG_COLOR = 0x272e33

interface FileInfo {
    url: string
    name: string
    size: number
    fileType?: SplatFileType
}

function getFileType(filename: string): SplatFileType {
    const ext = filename.toLowerCase().split('.').pop()
    console.log('[Compare] File extension:', ext, 'from', filename)
    switch (ext) {
        case 'splat': return SplatFileType.SPLAT
        case 'ksplat': return SplatFileType.KSPLAT
        case 'spz': return SplatFileType.SPZ
        case 'ply':
        default: return SplatFileType.PLY // Default to PLY
    }
}

export default function CompressionCompare() {
    const { setViewMode } = useStore()

    const containerRef = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<THREE.Scene | null>(null)
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
    const controlsRef = useRef<OrbitControls | null>(null)
    const leftSplatRef = useRef<SplatMesh | null>(null)
    const rightSplatRef = useRef<SplatMesh | null>(null)
    const animationRef = useRef<number | null>(null)
    const keysRef = useRef<Set<string>>(new Set())
    const flySpeedRef = useRef(0.05)

    const [leftFile, setLeftFile] = useState<FileInfo | null>(null)
    const [rightFile, setRightFile] = useState<FileInfo | null>(null)
    const [dividerPosition, setDividerPosition] = useState(50)
    const [isDragging, setIsDragging] = useState(false)
    const [loadingLeft, setLoadingLeft] = useState(false)
    const [loadingRight, setLoadingRight] = useState(false)

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
        // Use camera.up for correct left/right since up is inverted
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

    // Initialize scene - use SAME camera settings as main viewer
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

        const renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
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
            if (leftSplatRef.current) leftSplatRef.current.dispose()
            if (rightSplatRef.current) rightSplatRef.current.dispose()
            if (controlsRef.current) controlsRef.current.dispose()
            if (rendererRef.current && containerRef.current) {
                containerRef.current.removeChild(rendererRef.current.domElement)
                rendererRef.current.dispose()
            }
        }
    }, [applyFlyMovement])

    // Load left splat
    useEffect(() => {
        if (!leftFile || !sceneRef.current) return
        if (leftSplatRef.current) {
            sceneRef.current.remove(leftSplatRef.current)
            leftSplatRef.current.dispose()
        }
        setLoadingLeft(true)
        console.log('[Compare] Loading left splat:', leftFile.name, 'type:', leftFile.fileType)
        const splat = new SplatMesh({ url: leftFile.url, fileType: leftFile.fileType })
        sceneRef.current.add(splat)
        leftSplatRef.current = splat
        setTimeout(() => setLoadingLeft(false), 2000)
    }, [leftFile])

    // Load right splat
    useEffect(() => {
        if (!rightFile || !sceneRef.current) return
        if (rightSplatRef.current) {
            sceneRef.current.remove(rightSplatRef.current)
            rightSplatRef.current.dispose()
        }
        setLoadingRight(true)
        console.log('[Compare] Loading right splat:', rightFile.name, 'type:', rightFile.fileType)
        const splat = new SplatMesh({ url: rightFile.url, fileType: rightFile.fileType })
        sceneRef.current.add(splat)
        rightSplatRef.current = splat
        setTimeout(() => setLoadingRight(false), 2000)
    }, [rightFile])

    // File drop
    const handleFileDrop = useCallback((e: React.DragEvent, side: 'left' | 'right') => {
        e.preventDefault()
        e.stopPropagation()
        const file = e.dataTransfer.files[0]
        if (!file) return
        const url = URL.createObjectURL(file)
        const info: FileInfo = { url, name: file.name, size: file.size, fileType: getFileType(file.name) }
        if (side === 'left') setLeftFile(info)
        else setRightFile(info)
    }, [])

    // Divider drag
    const handleDividerMouseDown = useCallback(() => setIsDragging(true), [])
    useEffect(() => {
        if (!isDragging) return
        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return
            const rect = containerRef.current.getBoundingClientRect()
            setDividerPosition(Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100)))
        }
        const handleMouseUp = () => setIsDragging(false)
        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging])

    const formatSize = (bytes: number) => {
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    const reduction = leftFile && rightFile ? ((1 - rightFile.size / leftFile.size) * 100).toFixed(1) : null

    return (
        <div className="w-full h-full bg-everforest-bg-hard flex flex-col">
            {/* Header */}
            <div className="p-4 flex items-center gap-4 bg-everforest-bg-medium border-b border-everforest-bg-soft">
                <button onClick={() => setViewMode('gallery')} className="bg-everforest-bg-soft p-2 rounded-full hover:bg-everforest-bg-hard">
                    <ArrowLeft className="w-5 h-5 text-everforest-fg" />
                </button>
                <h1 className="text-xl font-bold text-everforest-green">Compare Splats</h1>
                <div className="flex-1" />
                <span className="text-sm text-everforest-fg/50">Drop .ply, .splat, .ksplat, .spz</span>
            </div>

            {/* Main - using min-h-0 to fix flex overflow */}
            <div className="flex-1 relative min-h-0 overflow-hidden">
                {/* Three.js canvas - absolute to fill container */}
                <div ref={containerRef} className="absolute inset-0" />

                {/* Left drop zone overlay */}
                <div className="absolute top-0 bottom-0 left-0 z-10 pointer-events-none" style={{ width: `${dividerPosition}%` }}>
                    {!leftFile && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-yellow-500/10 border-2 border-dashed border-yellow-500/30 m-2 rounded-lg pointer-events-auto"
                            onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleFileDrop(e, 'left')}>
                            <Upload className="w-12 h-12 text-yellow-500/50 mb-2" />
                            <p className="text-yellow-500/70 font-medium">Drop ORIGINAL here</p>
                        </div>
                    )}
                    {leftFile && <div className="absolute top-4 left-4 bg-yellow-500/90 text-black px-3 py-1 rounded font-bold text-sm pointer-events-none">Original • {formatSize(leftFile.size)}</div>}
                    {loadingLeft && <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none"><Loader2 className="w-8 h-8 text-yellow-500 animate-spin" /></div>}
                </div>

                {/* Right drop zone overlay */}
                <div className="absolute top-0 bottom-0 right-0 z-10 pointer-events-none" style={{ width: `${100 - dividerPosition}%` }}>
                    {!rightFile && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-everforest-green/10 border-2 border-dashed border-everforest-green/30 m-2 rounded-lg pointer-events-auto"
                            onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleFileDrop(e, 'right')}>
                            <Upload className="w-12 h-12 text-everforest-green/50 mb-2" />
                            <p className="text-everforest-green/70 font-medium">Drop COMPRESSED here</p>
                        </div>
                    )}
                    {rightFile && <div className="absolute top-4 right-4 bg-everforest-green/90 text-black px-3 py-1 rounded font-bold text-sm pointer-events-none">Compressed • {formatSize(rightFile.size)}</div>}
                    {loadingRight && <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none"><Loader2 className="w-8 h-8 text-everforest-green animate-spin" /></div>}
                </div>

                {/* Divider */}
                {leftFile && rightFile && (
                    <div className="absolute top-0 bottom-0 w-1 bg-white cursor-col-resize z-20" style={{ left: `${dividerPosition}%`, transform: 'translateX(-50%)' }} onMouseDown={handleDividerMouseDown}>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-16 bg-white rounded flex items-center justify-center shadow-lg">
                            <div className="flex gap-0.5"><div className="w-0.5 h-8 bg-gray-400" /><div className="w-0.5 h-8 bg-gray-400" /></div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-everforest-bg-medium border-t border-everforest-bg-soft">
                {leftFile && rightFile && reduction && (
                    <div className="flex items-center gap-4 mb-2">
                        <span className="text-everforest-fg/70">Size reduction:</span>
                        <div className="flex-1 h-4 bg-everforest-bg-soft rounded overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-yellow-500 to-everforest-green" style={{ width: `${Math.max(5, (rightFile.size / leftFile.size) * 100)}%` }} />
                        </div>
                        <span className="text-everforest-green font-bold">{reduction}% smaller</span>
                    </div>
                )}
                <p className="text-xs text-everforest-fg/40">WASD: Fly • Q/E: Up/Down • Mouse: Orbit • Drag divider to compare</p>
            </div>
        </div>
    )
}
