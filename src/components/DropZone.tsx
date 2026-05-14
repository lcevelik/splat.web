import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload } from 'lucide-react'
import { useStore } from '../store'

interface DropZoneProps {
    showFullUI?: boolean  // Show the full drop area UI, not just overlay
}

export default function DropZone({ showFullUI = false }: DropZoneProps) {
    const { setViewMode, setCurrentSplat } = useStore()

    const onDrop = useCallback((acceptedFiles: File[]) => {
        console.log('Files dropped:', acceptedFiles) // Debug log
        if (acceptedFiles.length > 0) {
            const file = acceptedFiles[0]
            console.log('Processing file:', file.name, file.type) // Debug log

            // Determine format from file extension
            const ext = file.name.toLowerCase().split('.').pop() || 'ply'
            const format: 'ply' | 'splat' = ext === 'splat' ? 'splat' : 'ply'

            // Create blob URL with extension hint in fragment (workaround)
            const blobUrl = URL.createObjectURL(file)
            // Add a query parameter or hash that might help, but really we just need format
            const url = `${blobUrl}#${file.name}` // Some libs check this

            setCurrentSplat(url, file.name, format)
            setViewMode('viewer')
        }
    }, [setCurrentSplat, setViewMode])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        // Accept all files and filter by extension instead of MIME type
        accept: {
            'application/octet-stream': ['.ply', '.splat'],
            'model/ply': ['.ply'],
        },
        noClick: !showFullUI, // Allow click only in full UI mode
        noKeyboard: true,
    })

    // Full UI mode - shown on the Drop Zone page
    if (showFullUI) {
        return (
            <div
                {...getRootProps()}
                className={`
                    w-full max-w-lg aspect-video rounded-2xl border-4 border-dashed 
                    flex flex-col items-center justify-center cursor-pointer
                    transition-all duration-300
                    ${isDragActive
                        ? 'border-everforest-green bg-everforest-green/20 scale-105'
                        : 'border-everforest-fg/30 bg-everforest-bg-soft hover:border-everforest-green hover:bg-everforest-green/10'
                    }
                `}
            >
                <input {...getInputProps()} />
                <Upload className={`w-16 h-16 mb-4 transition-all ${isDragActive ? 'text-everforest-green animate-bounce' : 'text-everforest-fg/50'}`} />
                <p className="text-lg font-bold text-everforest-fg mb-2">
                    {isDragActive ? 'Drop it!' : 'Drop .ply or .splat file here'}
                </p>
                <p className="text-sm text-everforest-fg/50">or click to browse</p>
            </div>
        )
    }

    // Overlay mode - invisible until drag starts
    return (
        <div {...getRootProps()} className="absolute inset-0 pointer-events-none z-50">
            <input {...getInputProps()} />
            {isDragActive && (
                <div className="absolute inset-0 bg-everforest-bg-hard/80 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-auto transition-opacity">
                    <Upload className="w-16 h-16 text-everforest-green mb-4 animate-bounce" />
                    <p className="text-2xl font-bold text-everforest-fg">Drop Splat Here</p>
                </div>
            )}
        </div>
    )
}
