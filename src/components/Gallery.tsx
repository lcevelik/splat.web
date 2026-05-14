import React from 'react'
import { useStore } from '../store'
import { motion } from 'framer-motion'
import { useRef, useEffect, useState } from 'react'
import { Upload } from 'lucide-react'


const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '') // Remove trailing slash if any

interface SplatItem {
    id: string
    name: string
    url: string
    thumbnail: string
    sizeGB?: number
    originalSizeGB?: number
}

export default function Gallery() {
    const { setViewMode, setCurrentSplat, startTransition, setIsStatic, isStatic, galleryScrollY, setGalleryScrollY } = useStore()
    const containerRef = useRef<HTMLDivElement>(null)
    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
    const [splats, setSplats] = useState<SplatItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Fetch splats from API or static manifest
    useEffect(() => {
        const fetchSplats = async () => {
            try {
                let data

                try {
                    // Try API first (only really works on localhost)
                    const res = await fetch(`/api/splats`) // Use proxy
                    if (!res.ok) throw new Error('API not available')
                    data = await res.json()
                    setIsStatic(false)
                } catch (apiErr) {
                    // Fallback to static manifest
                    console.log('API not available, falling back to static manifest...')
                    const res = await fetch(`${BASE_URL}/splats.json`)
                    if (!res.ok) throw new Error('Failed to load splat manifest')
                    data = await res.json()
                    setIsStatic(true)
                }

                const items: SplatItem[] = data.map((s: { id: string; filename: string; sizeGB?: number; originalSizeGB?: number }) => {
                    const splatUrl = `${BASE_URL}/splats/${s.filename}`

                    return {
                        id: s.id,
                        name: s.id,
                        url: splatUrl,
                        sizeGB: s.sizeGB,
                        originalSizeGB: s.originalSizeGB,
                        thumbnail: `${BASE_URL}/thumbnails/${s.id}.jpg`
                    }
                })

                setSplats(items)
                setError(null)
            } catch (err) {
                console.error('Failed to fetch splats:', err)
                setError('Could not load splats. Even the static manifest is missing.')
            } finally {
                setLoading(false)
            }
        }

        fetchSplats()
    }, [setIsStatic])

    // Scroll restoration
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = galleryScrollY
        }
    }, [galleryScrollY, loading])

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setGalleryScrollY(e.currentTarget.scrollTop)
    }

    const handleSelect = (item: SplatItem, element: HTMLDivElement | null) => {
        // Capture the thumbnail's position for the zoom animation
        if (element) {
            const rect = element.getBoundingClientRect()
            startTransition(
                { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
                item.thumbnail || ''
            )
        }

        // Update URL for shareable link
        const newUrl = `${window.location.pathname}?splat=${encodeURIComponent(item.id)}`
        window.history.pushState({ splatId: item.id }, '', newUrl)

        // Set the current splat and switch to viewer
        setCurrentSplat(item.url, item.id)
        setViewMode('viewer')
    }

    return (
        <div
            ref={containerRef}
            onScroll={handleScroll}
            className="p-8 w-full h-full bg-everforest-bg-hard"
            style={{ overflowY: 'scroll', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' } as React.CSSProperties}
        >
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <h1 className="text-4xl font-bold text-everforest-green font-display">3DGS Gallery</h1>
                    {!isStatic && (
                        <span className="text-xs px-2 py-1 bg-everforest-orange/20 text-everforest-orange rounded-full font-medium">
                            Dev Mode
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {!isStatic && (
                        <button
                            onClick={() => setViewMode('ingest')}
                            className="flex items-center gap-2 px-4 py-2 bg-everforest-green text-everforest-bg-hard rounded-lg font-bold hover:bg-everforest-aqua transition-colors shadow-lg"
                        >
                            <Upload size={20} />
                            <span>Upload New</span>
                        </button>
                    )}
                </div>
            </div>

            {loading && (
                <div className="text-everforest-fg/50 text-center py-12">Loading splats...</div>
            )}

            {error && (
                <div className="bg-red-900/30 text-red-300 p-4 rounded-lg mb-6">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {splats.map((item) => (
                    <motion.div
                        key={item.id}
                        ref={(el) => {
                            if (el) cardRefs.current.set(item.id, el)
                        }}
                        onClick={(e) => handleSelect(item, e.currentTarget as HTMLDivElement)}
                        className="group relative aspect-video bg-everforest-bg-medium rounded-xl overflow-hidden border-2 border-transparent hover:border-everforest-green cursor-pointer shadow-lg hover:shadow-everforest-green/20 transition-all"
                        style={{ touchAction: 'pan-y' }}
                        whileHover={window.matchMedia('(pointer: coarse)').matches ? {} : { scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <img
                            src={item.thumbnail}
                            alt={item.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                // Hide broken image, show placeholder
                                (e.target as HTMLImageElement).style.display = 'none'
                            }}
                        />
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-everforest-bg-soft text-everforest-fg/50 group-hover:text-everforest-fg transition-colors -z-10">
                            <div className="w-12 h-12 rounded-full border-2 border-current mb-2 flex items-center justify-center opacity-50 group-hover:opacity-100">
                                <span className="text-xl font-bold">3D</span>
                            </div>
                            <span>{item.name}</span>
                        </div>

                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                            <span className="text-white font-bold text-lg">{item.name}</span>
                            {item.originalSizeGB && <span className="text-white/70 text-xs mb-1">{item.originalSizeGB} GB</span>}
                            <span className="text-white/70 text-sm">Tap to view</span>
                        </div>
                    </motion.div>
                ))}
            </div>

            {!loading && splats.length === 0 && !error && (
                <div className="text-everforest-fg/50 text-center py-12">
                    No splats found. Add .ply files to public/splats/
                </div>
            )}
        </div>
    )
}
