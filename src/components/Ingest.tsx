import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDropzone } from 'react-dropzone'
import { Upload, X, Loader2, CheckCircle2 } from 'lucide-react'
import { useStore } from '../store'

interface Job {
    id: string
    originalName: string
    status: 'queued' | 'processing' | 'completed' | 'failed'
    error?: string
}

export default function Ingest() {
    const { setViewMode } = useStore()
    const [jobs, setJobs] = useState<Job[]>([])
    const [hasUploaded, setHasUploaded] = useState(false)
    const uploadedJobIdsRef = useRef<string[]>([])

    // Poll queue status
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch('/api/queue')
                if (res.ok) {
                    const data = await res.json()
                    setJobs(data.queue)
                }
            } catch (e) {
                console.error("Failed to fetch queue", e)
            }
        }, 300)
        return () => clearInterval(interval)
    }, [])

    // Auto-return to gallery when all uploads complete
    useEffect(() => {
        if (!hasUploaded || uploadedJobIdsRef.current.length === 0) return

        // Check if all uploaded jobs are either completed or failed
        const uploadedJobs = jobs.filter(j => uploadedJobIdsRef.current.includes(j.id))
        const allDone = uploadedJobIdsRef.current.length > 0 &&
                       (uploadedJobs.length === 0 || uploadedJobs.every(j => j.status === 'completed' || j.status === 'failed'))

        if (allDone) {
            console.log('✅ All uploads complete, returning to gallery')
            setTimeout(() => {
                setViewMode('gallery')
            }, 800)
        }
    }, [jobs, hasUploaded, setViewMode])

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            setHasUploaded(true)
        }

        for (const file of acceptedFiles) {
            const formData = new FormData()
            formData.append('image', file)

            try {
                const res = await fetch('/api/ingest', {
                    method: 'POST',
                    body: formData,
                })
                const data = await res.json()

                if (res.status === 409 && data.error === 'duplicate') {
                    // Duplicate detected
                    alert(`Skipped: ${file.name}\n\n${data.message}`)
                    continue
                }

                if (data.success && data.job) {
                    uploadedJobIdsRef.current.push(data.job.id)
                    setJobs(prev => [...prev, data.job])
                }
            } catch (e) {
                console.error("Upload failed", e)
            }
        }
    }, [])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'model/*': ['.ply', '.splat', '.ksplat', '.spz']
        }
    })

    return (
        <div className="w-full h-full p-8 flex flex-col gap-8">
            <h1 className="text-3xl font-bold font-serif text-everforest-aqua">Ingest New Splats</h1>

            <div
                {...getRootProps()}
                className={`
                    w-full h-64 border-4 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors
                    ${isDragActive ? 'border-everforest-green bg-everforest-green/10' : 'border-everforest-fg/20 hover:border-everforest-green/50'}
                `}
            >
                <input {...getInputProps()} />
                <Upload size={48} className={isDragActive ? 'text-everforest-green' : 'text-everforest-fg/50'} />
                <p className="mt-4 text-lg text-everforest-fg/70 font-display">
                    {isDragActive ? "Drop splats here..." : "Drag & drop splats, or click to select"}
                </p>
                <p className="text-sm text-everforest-fg/40 mt-2">Supports PLY, SPLAT, KSPLAT, SPZ</p>
            </div>

            <div className="flex-1 overflow-y-auto">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    Queue <span className="text-sm font-normal text-everforest-fg/50">({jobs.length})</span>
                </h2>
                <div className="space-y-3">
                    <AnimatePresence>
                        {jobs.map(job => (
                            <motion.div
                                key={job.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-everforest-bg-soft p-4 rounded-lg flex items-center justify-between border border-everforest-fg/10"
                            >
                                <div className="flex items-center gap-3">
                                    {job.status === 'processing' && <Loader2 className="animate-spin text-everforest-yellow" />}
                                    {job.status === 'completed' && <CheckCircle2 className="text-everforest-green" />}
                                    {job.status === 'failed' && <X className="text-everforest-red" />}
                                    {job.status === 'queued' && <div className="w-6 h-6 rounded-full border-2 border-everforest-fg/30" />}

                                    <div>
                                        <p className="font-medium">{job.originalName}</p>
                                        <p className="text-xs text-everforest-fg/50 uppercase tracking-wider">{job.status}</p>
                                    </div>
                                </div>
                                {job.error && (
                                    <span className="text-sm text-everforest-red">{job.error}</span>
                                )}
                            </motion.div>
                        ))}
                        {jobs.length === 0 && (
                            <div className="text-center py-10 text-everforest-fg/30 italic">
                                Queue is empty. Drop some images to start!
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    )
}
