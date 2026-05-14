import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useStore } from '../store'
import { useEffect, useState, useRef } from 'react'

export default function ZoomTransition() {
    const { transition, viewMode, endTransition, isSplatLoaded } = useStore()
    const [phase, setPhase] = useState<'idle' | 'zooming' | 'holding' | 'fading'>('idle')
    const animationRef = useRef<{ startX: number; startY: number; startScale: number } | null>(null)

    // Motion values for smooth animations
    const progress = useMotionValue(0)
    const blur = useTransform(progress, [0, 0.5, 1], [8, 2, 0])
    const blurFilter = useTransform(blur, (b) => `blur(${b}px)`)
    const borderWidth = useTransform(progress, [0, 0.3, 1], [12, 6, 0])
    const borderRadius = useTransform(progress, [0, 1], [24, 0])
    const perspective = useTransform(progress, [0, 0.5, 1], [800, 1200, 2000])
    const rotateX = useTransform(progress, [0, 0.3, 1], [5, 2, 0])

    useEffect(() => {
        if (transition.isTransitioning && transition.thumbnailRect && viewMode === 'viewer') {
            // Calculate starting position - thumbnail center relative to screen center
            const { x, y, width, height } = transition.thumbnailRect
            const windowW = window.innerWidth
            const windowH = window.innerHeight

            // Calculate scale to match thumbnail size
            const scaleX = width / windowW
            const scaleY = height / windowH
            const startScale = Math.min(scaleX, scaleY) // Start at thumbnail size

            // Calculate offset to position at thumbnail center
            const thumbCenterX = x + width / 2
            const thumbCenterY = y + height / 2
            const startX = thumbCenterX - windowW / 2
            const startY = thumbCenterY - windowH / 2

            animationRef.current = { startX, startY, startScale }
            setPhase('zooming')

            // Animate progress for blur and border effects
            animate(progress, 1, {
                duration: 0.6,
                ease: [0.22, 1, 0.36, 1], // Custom easing for dramatic effect
            })

            // After zoom completes, enter holding phase
            setTimeout(() => setPhase('holding'), 600)
        }
    }, [transition.isTransitioning, transition.thumbnailRect, viewMode, progress])

    // Manage phase transitions based on loading state
    useEffect(() => {
        if (phase === 'holding' && isSplatLoaded) {
            // Once loaded, start fading out
            setPhase('fading')
        } else if (phase === 'fading') {
            // Wait for fade animation to complete
            const timer = setTimeout(() => {
                setPhase('idle')
                progress.set(0)
                endTransition()
            }, 500)
            return () => clearTimeout(timer)
        }
    }, [phase, isSplatLoaded, endTransition, progress])

    if (phase === 'idle' || !transition.thumbnailUrl || !animationRef.current) {
        return null
    }

    const { startX, startY, startScale } = animationRef.current

    const variants = {
        start: {
            x: startX,
            y: startY,
            scale: startScale,
            opacity: 1,
            rotateX: 8,
        },
        zoomed: {
            x: 0,
            y: 0,
            scale: 1,
            opacity: 1,
            rotateX: 0,
        },
        fading: {
            x: 0,
            y: 0,
            scale: 1.02,
            opacity: 0,
            rotateX: 0,
        },
    }

    return (
        <>
            {/* Vignette/tunnel effect background */}
            <motion.div
                className="fixed inset-0 z-30 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: phase === 'zooming' ? 0.7 : 0 }}
                transition={{ duration: 0.3 }}
                style={{
                    background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.9) 100%)',
                }}
            />

            {/* Main zoom container with perspective */}
            <motion.div
                className="fixed inset-0 z-30 pointer-events-none flex items-center justify-center"
                style={{
                    perspective,
                    perspectiveOrigin: 'center center',
                }}
            >
                {/* Window frame container */}
                <motion.div
                    className="relative overflow-hidden"
                    style={{
                        width: '100vw',
                        height: '100vh',
                        borderStyle: 'solid',
                        borderColor: 'rgba(168, 216, 166, 0.6)', // everforest-green
                        borderWidth,
                        borderRadius,
                        boxShadow: phase === 'zooming'
                            ? '0 0 60px rgba(168, 216, 166, 0.4), inset 0 0 100px rgba(0,0,0,0.3)'
                            : 'none',
                    }}
                    initial="start"
                    animate={phase === 'fading' ? 'fading' : 'zoomed'}
                    variants={variants}
                    transition={{
                        duration: phase === 'fading' ? 0.5 : 0.6,
                        ease: [0.22, 1, 0.36, 1], // Smooth dramatic easing
                    }}
                >
                    {/* Image with blur effect */}
                    <motion.div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `url(${transition.thumbnailUrl})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            filter: blurFilter,
                            rotateX,
                        }}
                    />

                    {/* Shine/glare effect during transition */}
                    <motion.div
                        className="absolute inset-0 pointer-events-none"
                        initial={{ opacity: 0, x: '-100%' }}
                        animate={{
                            opacity: phase === 'zooming' ? [0, 0.4, 0] : 0,
                            x: phase === 'zooming' ? ['-100%', '100%'] : '-100%',
                        }}
                        transition={{
                            duration: 0.8,
                            ease: 'easeInOut',
                        }}
                        style={{
                            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                        }}
                    />
                </motion.div>
            </motion.div>
        </>
    )
}
