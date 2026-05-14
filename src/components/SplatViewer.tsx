import { useEffect, useRef, useCallback, useState } from 'react'
import { useStore } from '../store'
import * as THREE from 'three'
import { SplatMesh, SplatFileType, dyno } from '@sparkjsdev/spark'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useDeviceOrientation } from '../hooks/useDeviceOrientation'
import { Camera, Trash2, CheckCircle2, AlertCircle, Pencil, Download } from 'lucide-react'

interface SplatViewerProps {
    enableTiltControl?: boolean
    enableXR?: boolean
}

// Everforest bg-hard color
import {
    CAMERA_SETTINGS,
    BG_COLOR,
    MOBILE_ZOOM_SPEED,
    AR_INITIAL_DISTANCE,
    AR_INITIAL_SCALE,
    AR_MIN_SCALE,
    AR_MAX_SCALE
} from '../constants'

declare global {
    interface Window {
        isSplatLoaded: boolean;
    }
}


function getFileType(filename: string): SplatFileType | undefined {
    const ext = filename.toLowerCase().split('.').pop()
    switch (ext) {
        case 'splat': return SplatFileType.SPLAT
        case 'ksplat': return SplatFileType.KSPLAT
        case 'spz': return SplatFileType.SPZ
        default: return undefined
    }
}

export default function SplatViewer({ enableTiltControl = false, enableXR = false }: SplatViewerProps) {
    const { currentSplat, currentSplatId, currentSplatFormat, setCurrentSplat, setViewMode, isStatic, arShowCameraFeed, isARActive, setIsSplatLoaded } = useStore()
    const containerRef = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<THREE.Scene | null>(null)
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
    const controlsRef = useRef<OrbitControls | null>(null)
    const contentGroupRef = useRef<THREE.Group | null>(null)
    const splatRef = useRef<SplatMesh | null>(null)
    const animationIdRef = useRef<number | null>(null)
    const keysRef = useRef<Set<string>>(new Set())
    const animateTimeRef = useRef<{ value: number } | null>(null)
    const loadStartTimeRef = useRef<number>(0)
    const isPointcloudRef = useRef<{ value: number }>({ value: 0 })

    const [isSaving, setIsSaving] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [isDeleting, setIsDeleting] = useState(false)
    const [isRenaming, setIsRenaming] = useState(false)

    // AR State
    const isARSessionActiveRef = useRef(false)
    const arBackgroundMeshRef = useRef<THREE.Mesh | null>(null)

    const flySpeedRef = useRef(0.05)
    const { orientation, hasPermission } = useDeviceOrientation()

    // Clean mode synchronously
    const isMinimal = new URLSearchParams(window.location.search).get('clean') === 'true'
    const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '')
    const pendingConfigRef = useRef<{ position: number[], target: number[], up: number[] } | null>(null)

    // Detect if mobile device - AUTO-ENABLE TILT ON MOBILE
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    const shouldEnableTilt = isMobile || enableTiltControl

    // React to camera feed toggle during AR - use a large sphere to block camera
    useEffect(() => {
        if (!sceneRef.current || !isARActive) return

        if (arShowCameraFeed) {
            // Remove background blocker if it exists
            if (arBackgroundMeshRef.current) {
                sceneRef.current.remove(arBackgroundMeshRef.current)
                arBackgroundMeshRef.current.geometry.dispose()
                    ; (arBackgroundMeshRef.current.material as THREE.Material).dispose()
                arBackgroundMeshRef.current = null
                console.log('[AR] Camera feed ON - background removed')
            }
        } else {
            // Add a large sphere around the scene to block camera feed
            if (!arBackgroundMeshRef.current) {
                const geometry = new THREE.SphereGeometry(50, 32, 32)
                const material = new THREE.MeshBasicMaterial({
                    color: BG_COLOR,
                    side: THREE.BackSide // Render inside of sphere
                })
                arBackgroundMeshRef.current = new THREE.Mesh(geometry, material)
                sceneRef.current.add(arBackgroundMeshRef.current)
                console.log('[AR] Camera feed OFF - background sphere added')
            }
        }
    }, [arShowCameraFeed, isARActive])

    // Fetch saved view data from API
    useEffect(() => {
        if (!currentSplatId || currentSplatId === 'deep-linked') return;

        fetch(`/api/splats/${currentSplatId}/view`)
            .then(res => {
                if (res.ok) return res.json();
                return null;
            })
            .then(viewData => {
                if (viewData && viewData.position && viewData.target && viewData.up) {
                    // If camera is ready, apply immediately
                    if (cameraRef.current && controlsRef.current) {
                        console.log("Applying saved view:", viewData);
                        cameraRef.current.position.fromArray(viewData.position);
                        cameraRef.current.up.fromArray(viewData.up);
                        controlsRef.current.target.fromArray(viewData.target);
                        controlsRef.current.update();
                    } else {
                        // Store for later application
                        pendingConfigRef.current = viewData;
                    }
                }
            })
            .catch(() => {
                // Ignore 404s (no saved view)
            });
    }, [currentSplatId]);

    const handleSaveView = async () => {
        if (!cameraRef.current || !controlsRef.current || !currentSplatId || !rendererRef.current) return;

        setIsSaving(true);

        // Capture current view as thumbnail
        let thumbnail: string | undefined;
        try {
            // Render one frame to ensure we capture current state
            if (sceneRef.current) {
                rendererRef.current.render(sceneRef.current, cameraRef.current);
            }
            thumbnail = rendererRef.current.domElement.toDataURL('image/jpeg', 0.9);
        } catch (e) {
            console.warn('Could not capture thumbnail:', e);
        }

        const payload = {
            position: cameraRef.current.position.toArray(),
            target: controlsRef.current.target.toArray(),
            up: cameraRef.current.up.toArray(),
            thumbnail // Include thumbnail if captured
        };

        try {
            const res = await fetch(`/api/splats/${currentSplatId}/view`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setSaveStatus('success');
                setTimeout(() => setSaveStatus('idle'), 2000);
            } else {
                setSaveStatus('error');
                setTimeout(() => setSaveStatus('idle'), 2000);
            }
        } catch (e) {
            console.error(e);
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!currentSplatId || !confirm("Are you sure you want to delete this splat? This cannot be undone.")) return;

        setIsDeleting(true);
        try {
            const res = await fetch(`/api/splats/${currentSplatId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                setCurrentSplat(null);
                setViewMode('gallery');
            } else {
                alert("Failed to delete splat");
            }
        } catch (e) {
            console.error(e);
            alert("Failed to delete splat");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleDownloadPLY = () => {
        if (!currentSplatId) return;
        const downloadUrl = `${BASE_URL}/splats/${currentSplatId}.ply`;
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `${currentSplatId}.ply`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Lenticular Effect - Velocity-based tilt control like mouse drag
    // Track current orbit angles (persistent across frames)
    const orbitAnglesRef = useRef<{ theta: number, phi: number } | null>(null)
    const lastTiltRef = useRef<{ beta: number, gamma: number } | null>(null)

    useEffect(() => {
        if (!shouldEnableTilt || !hasPermission || !cameraRef.current || !controlsRef.current || isARSessionActiveRef.current) return
        const { beta, gamma } = orientation
        if (beta === null || gamma === null) return

        const camera = cameraRef.current
        const controls = controlsRef.current
        const target = controls.target.clone()
        const offset = camera.position.clone().sub(target)
        const radius = offset.length()

        // Initialize orbit angles from current camera position on first reading
        if (!orbitAnglesRef.current) {
            orbitAnglesRef.current = {
                theta: Math.atan2(offset.x, offset.z),
                phi: Math.acos(Math.max(-1, Math.min(1, offset.y / radius)))
            }
            lastTiltRef.current = { beta, gamma }
            return
        }

        // Calculate delta (change) from last frame - this is the "velocity"
        const deltaBeta = beta - (lastTiltRef.current?.beta ?? beta)
        const deltaGamma = gamma - (lastTiltRef.current?.gamma ?? gamma)
        lastTiltRef.current = { beta, gamma }

        // Apply deltas with sensitivity (like mouse drag)
        const sensitivity = 0.015
        orbitAnglesRef.current.theta += deltaGamma * sensitivity
        orbitAnglesRef.current.phi += deltaBeta * sensitivity * 0.5

        // Clamp orbit angles to boundaries
        // Theta (horizontal): Allow ±60° from initial position
        const maxTheta = Math.PI / 3  // 60 degrees
        const initialTheta = Math.atan2(CAMERA_SETTINGS.position.x - CAMERA_SETTINGS.target.x,
            CAMERA_SETTINGS.position.z - CAMERA_SETTINGS.target.z)
        orbitAnglesRef.current.theta = Math.max(initialTheta - maxTheta,
            Math.min(initialTheta + maxTheta, orbitAnglesRef.current.theta))

        // Phi (vertical): Keep between 20° and 160° to avoid flipping
        orbitAnglesRef.current.phi = Math.max(0.35, Math.min(Math.PI - 0.35, orbitAnglesRef.current.phi))

        // Convert spherical to Cartesian
        const theta = orbitAnglesRef.current.theta
        const phi = orbitAnglesRef.current.phi
        const newOffset = new THREE.Vector3(
            radius * Math.sin(phi) * Math.sin(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.cos(theta)
        )

        // Set camera position with lerp for smoothness
        const newPos = target.clone().add(newOffset)
        camera.position.lerp(newPos, 0.15)
        camera.lookAt(target)

    }, [orientation, shouldEnableTilt, hasPermission])

    // Keyboard
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        keysRef.current.add(e.key.toLowerCase())
        // Spacebar toggles pointcloud mode
        if (e.key === ' ') {
            isPointcloudRef.current.value = isPointcloudRef.current.value > 0.5 ? 0 : 1
            if (splatRef.current) splatRef.current.updateVersion()
        }
    }, [])

    const handleKeyUp = useCallback((e: KeyboardEvent) => {
        keysRef.current.delete(e.key.toLowerCase())
    }, [])

    // WASD fly
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

    // Main setup
    useEffect(() => {
        if (!containerRef.current || !currentSplat) return

        console.log('[SplatViewer] Loading:', currentSplat)

        // Cleanup
        if (animationIdRef.current) {
            cancelAnimationFrame(animationIdRef.current)
            animationIdRef.current = null
        }
        if (splatRef.current) {
            splatRef.current.dispose()
            splatRef.current = null
        }
        if (rendererRef.current && containerRef.current) {
            try { containerRef.current.removeChild(rendererRef.current.domElement) } catch { }
            rendererRef.current.dispose()
            rendererRef.current = null
        }
        // Remove AR Button if it exists
        const oldArBtn = document.getElementById('ar-button')
        if (oldArBtn) oldArBtn.remove()

        // Scene
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(BG_COLOR)
        sceneRef.current = scene

        // Content Group (for splat and tilt/AR manipulations)
        const contentGroup = new THREE.Group()
        scene.add(contentGroup)
        contentGroupRef.current = contentGroup

        // Camera - standard settings
        const camera = new THREE.PerspectiveCamera(
            60,
            containerRef.current.clientWidth / containerRef.current.clientHeight,
            0.01,
            1000
        )
        camera.position.copy(CAMERA_SETTINGS.position)
        camera.up.copy(CAMERA_SETTINGS.up)
        camera.lookAt(CAMERA_SETTINGS.target)
        cameraRef.current = camera

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true }) // No AA for mobile perf
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
        renderer.setPixelRatio(1) // Force 1x pixel ratio for mobile performance
        renderer.xr.enabled = true
        containerRef.current.appendChild(renderer.domElement)
        rendererRef.current = renderer

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.1
        controls.rotateSpeed = 0.4
        // Use slower zoom on mobile for better control
        controls.zoomSpeed = isMobile ? MOBILE_ZOOM_SPEED : 0.5
        controls.target.copy(CAMERA_SETTINGS.target)

        // Disable rotate/pan in lenticular mode (sensors control camera)
        if (enableTiltControl && isMobile) {
            controls.enableRotate = false
            controls.enablePan = false
        }

        controls.update()
        controlsRef.current = controls

        // Apply pending config if it was fetched before camera was ready
        if (pendingConfigRef.current) {
            console.log("Applying pending config...", pendingConfigRef.current);
            camera.position.fromArray(pendingConfigRef.current.position);
            camera.up.fromArray(pendingConfigRef.current.up);
            controls.target.fromArray(pendingConfigRef.current.target);
            controls.update();
            pendingConfigRef.current = null;
        }

        // AR Session Logic
        // Register the enterAR function to the store so UIOverlay can call it
        const { setEnterAR, setExitAR, setIsARActive } = useStore.getState()
        let currentXRSession: XRSession | null = null

        // Define the AR starter function
        const startAR = async () => {
            if (!renderer || !navigator.xr) return
            try {
                const session = await navigator.xr.requestSession('immersive-ar', {
                    requiredFeatures: ['hit-test'],
                    optionalFeatures: ['dom-overlay'],
                    // Get the motion.div wrapper that contains both SplatViewer and UIOverlay
                    domOverlay: { root: containerRef.current?.parentElement?.parentElement || document.body }
                })
                renderer.xr.setReferenceSpaceType('local')
                await renderer.xr.setSession(session)

                // Session listener
                session.addEventListener('end', () => {
                    setIsARActive(false)
                    isARSessionActiveRef.current = false
                    scene.background = new THREE.Color(BG_COLOR)

                    // Reset content
                    if (contentGroupRef.current) {
                        contentGroupRef.current.position.set(0, 0, 0)
                        contentGroupRef.current.scale.setScalar(1)
                        contentGroupRef.current.rotation.set(0, 0, 0)
                    }
                    // Reset camera
                    camera.position.copy(CAMERA_SETTINGS.position)
                    camera.lookAt(CAMERA_SETTINGS.target)
                    controls.reset()

                    // Remove pinch handlers
                    containerRef.current?.removeEventListener('touchstart', handleTouchStart as any)
                    containerRef.current?.removeEventListener('touchmove', handleTouchMove as any)

                    // Restore pixel ratio
                    renderer.setPixelRatio(1)
                })

                // AR Started
                setIsARActive(true)
                isARSessionActiveRef.current = true
                currentXRSession = session
                scene.background = null

                // Reduce pixel ratio on slow devices (low CPU cores or low memory)
                const cpuCores = navigator.hardwareConcurrency || 4
                const deviceMemory = (navigator as any).deviceMemory || 4 // GB, defaults to 4 if unavailable
                const isSlowDevice = cpuCores <= 4 || deviceMemory <= 4

                if (isSlowDevice) {
                    renderer.setPixelRatio(0.75)
                    console.log(`[AR] Pixel ratio 0.75 (cores: ${cpuCores}, memory: ${deviceMemory}GB)`)
                } else {
                    console.log(`[AR] Full quality (cores: ${cpuCores}, memory: ${deviceMemory}GB)`)
                }

                // Initial AR Placement - closer to user with larger scale
                // Rotate 180° on X-axis to flip right-side up (gallery uses inverted camera)
                if (contentGroupRef.current) {
                    contentGroupRef.current.position.set(0, 0, -AR_INITIAL_DISTANCE)
                    contentGroupRef.current.scale.setScalar(AR_INITIAL_SCALE)
                    contentGroupRef.current.rotation.set(Math.PI, 0, 0) // Flip 180° on X
                }

                // Add pinch-to-zoom handlers
                containerRef.current?.addEventListener('touchstart', handleTouchStart as any, { passive: false })
                containerRef.current?.addEventListener('touchmove', handleTouchMove as any, { passive: false })

            } catch (e) {
                console.error("Failed to start AR", e)
            }
        }

        // Pinch-to-zoom state
        let lastPinchDistance = 0

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX
                const dy = e.touches[0].clientY - e.touches[1].clientY
                lastPinchDistance = Math.sqrt(dx * dx + dy * dy)
            }
        }

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && contentGroupRef.current && isARSessionActiveRef.current) {
                e.preventDefault()
                const dx = e.touches[0].clientX - e.touches[1].clientX
                const dy = e.touches[0].clientY - e.touches[1].clientY
                const distance = Math.sqrt(dx * dx + dy * dy)

                if (lastPinchDistance > 0) {
                    const scaleFactor = distance / lastPinchDistance
                    const currentScale = contentGroupRef.current.scale.x
                    // Smoother scaling with lerp, extended range for closer inspection
                    const targetScale = Math.max(AR_MIN_SCALE, Math.min(AR_MAX_SCALE, currentScale * scaleFactor))
                    const newScale = currentScale + (targetScale - currentScale) * 0.3 // Damped scaling
                    contentGroupRef.current.scale.setScalar(newScale)
                }
                lastPinchDistance = distance
            }
        }

        setEnterAR(startAR)

        // Define the AR exit function
        const stopAR = () => {
            if (currentXRSession) {
                currentXRSession.end()
                currentXRSession = null
            }
        }
        setExitAR(stopAR)

        // Load splat
        const opts: any = { url: currentSplat }
        const fileType = getFileType(currentSplat)
        if (fileType) opts.fileType = fileType

        // Reveal effect and pointcloud toggle - setup animation timing
        // If minimal (clean mode), skip animation (start at 100s)
        const startT = isMinimal ? 100 : 0
        const animateT = dyno.dynoFloat(startT)
        animateTimeRef.current = animateT
        loadStartTimeRef.current = 0 // Will be set to performance.now() when loaded

        // Pointcloud mode toggle (reactive dynoFloat)
        const isPointcloudDyno = dyno.dynoFloat(0)
        isPointcloudRef.current = isPointcloudDyno

        // Setup magic shader after load via onLoad callback
        opts.onLoad = (loadedSplat: SplatMesh) => {
            loadedSplat.objectModifier = dyno.dynoBlock(
                { gsplat: dyno.Gsplat },
                { gsplat: dyno.Gsplat },
                ({ gsplat }: any) => {
                    const d = new dyno.Dyno({
                        inTypes: { gsplat: dyno.Gsplat, t: 'float', isPointcloud: 'float' },
                        outTypes: { gsplat: dyno.Gsplat },
                        globals: () => [
                            dyno.unindent(`
                                vec3 hash(vec3 p) {
                                    p = fract(p * 0.3183099 + 0.1);
                                    p *= 17.0;
                                    return fract(vec3(p.x * p.y * p.z, p.x + p.y * p.z, p.x * p.y + p.z));
                                }
                                vec3 noise(vec3 p) {
                                    vec3 i = floor(p);
                                    vec3 f = fract(p);
                                    f = f * f * (3.0 - 2.0 * f);
                                    vec3 n000 = hash(i + vec3(0,0,0));
                                    vec3 n100 = hash(i + vec3(1,0,0));
                                    vec3 n010 = hash(i + vec3(0,1,0));
                                    vec3 n110 = hash(i + vec3(1,1,0));
                                    vec3 n001 = hash(i + vec3(0,0,1));
                                    vec3 n101 = hash(i + vec3(1,0,1));
                                    vec3 n011 = hash(i + vec3(0,1,1));
                                    vec3 n111 = hash(i + vec3(1,1,1));
                                    vec3 x0 = mix(n000, n100, f.x);
                                    vec3 x1 = mix(n010, n110, f.x);
                                    vec3 x2 = mix(n001, n101, f.x);
                                    vec3 x3 = mix(n011, n111, f.x);
                                    vec3 y0 = mix(x0, x1, f.y);
                                    vec3 y1 = mix(x2, x3, f.y);
                                    return mix(y0, y1, f.z);
                                }
                            `)
                        ],
                        statements: ({ inputs, outputs }: any) => dyno.unindentLines(`
                            ${outputs.gsplat} = ${inputs.gsplat};
                            float t = ${inputs.t};
                            float isPointcloud = ${inputs.isPointcloud};
                            vec3 scales = ${inputs.gsplat}.scales;
                            vec3 localPos = ${inputs.gsplat}.center;
                            float l = length(localPos.xz);
                            
                            // Smoother Reveal Effect - Fast wave from center
                            float progress = smoothstep(0.0, 1.0, clamp(t * 1.0, 0.0, 1.0));
                            
                            // Scale up from 0 - wave spreads outward quickly
                            float scaleReveal = smoothstep(0.0, 1.0, clamp(t * 3.0 - l * 0.1, 0.0, 1.0));
                            
                            ${outputs.gsplat}.scales = scales * scaleReveal;
                            
                            // Pointcloud mode: tiny opaque dots
                            if (isPointcloud > 0.5) {
                                ${outputs.gsplat}.scales = vec3(0.003);
                                ${outputs.gsplat}.rgba.a = 1.0;
                            }
                        `)
                    })
                    gsplat = d.apply({ gsplat, t: animateT, isPointcloud: isPointcloudDyno }).gsplat
                    return { gsplat }
                }
            )
            loadedSplat.updateGenerator()

            // Signal loaded
            loadStartTimeRef.current = isMinimal ? 0 : performance.now()

            if (isMinimal) {
                // Ensure frame render happened
                requestAnimationFrame(() => {
                    window.isSplatLoaded = true;
                    setIsSplatLoaded(true)
                });
            } else {
                window.isSplatLoaded = true;
                setIsSplatLoaded(true)
            }
        }

        const splat = new SplatMesh(opts)
        contentGroup.add(splat)
        splatRef.current = splat

        // Add keyboard event listeners
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)

        // Animation Loop
        renderer.setAnimationLoop(() => {
            // Only use custom flight and orbital controls if NOT in AR
            if (!renderer.xr.isPresenting) {
                applyFlyMovement()
                controls.update()
            }

            // Update magic reveal animation (only if not minimal/clean)
            if (!isMinimal && animateTimeRef.current && loadStartTimeRef.current > 0) {
                const elapsed = (performance.now() - loadStartTimeRef.current) / 1000
                animateTimeRef.current.value = Math.min(elapsed, 20)
                if (splatRef.current) splatRef.current.updateVersion()
            }


            renderer.render(scene, camera)
        })

        // Resize handler
        const handleResize = () => {
            if (!containerRef.current || !camera || !renderer) return
            camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
            camera.updateProjectionMatrix()
            renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
        }
        window.addEventListener('resize', handleResize)

        // Cleanup function updates
        return () => {
            window.isSplatLoaded = false;
            setIsSplatLoaded(false)
            window.removeEventListener('resize', handleResize)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            renderer.setAnimationLoop(null) // Stop loop

            if (splatRef.current) splatRef.current.dispose()
            if (rendererRef.current && containerRef.current) {
                try { containerRef.current.removeChild(rendererRef.current.domElement) } catch { }
                rendererRef.current.dispose()
            }
            if (controlsRef.current) controlsRef.current.dispose()
            // Cleanup AR starter
            setEnterAR(async () => { })
        }
    }, [currentSplat, currentSplatFormat, enableXR, handleKeyDown, handleKeyUp, applyFlyMovement])

    if (!currentSplat) return null

    return (
        <div className="relative w-full h-full">
            <div
                ref={containerRef}
                className="w-full h-full"
                style={{ width: '100%', height: '100%' }}
            />

            {/* Controls hint - hide on mobile */}
            {!isMinimal && !isMobile && (
                <div className="absolute bottom-2 left-2 text-everforest-fg/30 text-xs shadow-black/50 drop-shadow-md pointer-events-none">
                    WASD: Fly • Q/E: Up/Down • Space: Pointcloud • Mouse: Orbit
                </div>
            )}

            {/* Action Buttons (Right Side) - Only show when API is available and not in AR */}
            {!isMinimal && currentSplatId && !isARActive && (
                <div className="absolute top-1/2 right-4 -translate-y-1/2 flex flex-col gap-4 pointer-events-auto z-50">
                    <button
                        onClick={handleSaveView}
                        disabled={isSaving}
                        className={`p-3 rounded-full backdrop-blur-md transition-all shadow-lg ${saveStatus === 'success' ? 'bg-everforest-green text-everforest-bg-hard' :
                            saveStatus === 'error' ? 'bg-everforest-red text-everforest-bg-hard' :
                                'bg-everforest-bg-medium/50 text-everforest-fg hover:bg-everforest-bg-soft'
                            }`}
                        title="Set as Default View"
                    >
                        {saveStatus === 'success' ? <CheckCircle2 size={24} /> :
                            saveStatus === 'error' ? <AlertCircle size={24} /> :
                                <Camera size={24} />}
                    </button>

                    <button
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="p-3 rounded-full backdrop-blur-md bg-everforest-bg-medium/50 text-everforest-red hover:bg-everforest-red/20 transition-all shadow-lg"
                        title="Delete Splat"
                    >
                        {isDeleting ? <div className="w-6 h-6 border-2 border-everforest-red border-t-transparent rounded-full animate-spin" /> : <Trash2 size={24} />}
                    </button>

                    <button
                        onClick={handleDownloadPLY}
                        className="p-3 rounded-full backdrop-blur-md bg-everforest-bg-medium/50 text-everforest-green hover:bg-everforest-green/20 transition-all shadow-lg"
                        title="Download Original PLY File"
                    >
                        <Download size={24} />
                    </button>

                    <button
                        onClick={async () => {
                            if (!currentSplatId || currentSplatId === 'custom-splat') {
                                alert("Cannot rename a custom-loaded splat.");
                                return;
                            }
                            const newName = prompt('Enter new name for this splat:', currentSplatId);
                            if (!newName || newName === currentSplatId) return;

                            setIsRenaming(true);
                            try {
                                const res = await fetch(`/api/splats/${currentSplatId}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ newName })
                                });
                                if (res.ok) {
                                    const data = await res.json();
                                    const newId = data.newId;

                                    // Update store state so saves/references work with new ID
                                    // Construct new URL (maintaining whatever format was used)
                                    if (currentSplat) {
                                        const newSplatUrl = currentSplat.replace(`/${currentSplatId}.`, `/${newId}.`);
                                        setCurrentSplat(newSplatUrl, newId);
                                    }

                                    // Update browser URL
                                    const newBrowserUrl = `${window.location.pathname}?splat=${encodeURIComponent(newId)}`;
                                    window.history.replaceState({ splatId: newId }, '', newBrowserUrl);

                                    alert(`Successfully renamed to: ${newId}`);
                                } else {
                                    const err = await res.json();
                                    alert(err.error || 'Failed to rename');
                                }
                            } catch (e) {
                                console.error(e);
                                alert('Failed to rename splat. Is the API server running?');
                            } finally {
                                setIsRenaming(false);
                            }
                        }}
                        disabled={isRenaming}
                        className="p-3 rounded-full backdrop-blur-md bg-everforest-bg-medium/50 text-everforest-fg hover:bg-everforest-bg-soft transition-all shadow-lg"
                        title="Rename Splat"
                    >
                        {isRenaming ? <div className="w-6 h-6 border-2 border-everforest-fg border-t-transparent rounded-full animate-spin" /> : <Pencil size={24} />}
                    </button>
                </div>
            )}
        </div>
    )
}
