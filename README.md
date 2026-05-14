# 3DGS Gallery

An interactive 3D Gaussian Splat viewer and gallery manager built with React, TypeScript, Three.js, and Express.js. Upload, convert, view, and manage 3D Gaussian Splats in your browser with automatic format conversion and saved camera views.

**Live at:** https://splat.steadiczech.com/

## Features

### Viewer
- 📷 Interactive 3D viewer with smooth camera controls (WASD + mouse orbit)
- 🎮 Multiple input methods: keyboard, mouse, mobile touch, device tilt
- 🥽 AR/XR support (WebXR on Android Chrome/Edge)
- 💾 Save and auto-restore camera viewing angles
- 📥 Download original PLY files from the viewer
- ⚡ Support for multiple formats: `.ply`, `.splat`, `.ksplat`, `.spz`

### Gallery Management
- 📤 Drag-and-drop upload with automatic format conversion
- 🔄 Automatic PLY → SPLAT conversion (90% file size reduction)
- 🗑️ Delete splats with automatic cleanup
- ✏️ Rename splats with synchronized file system updates
- 📊 View file information (original size, conversion status)
- 🖼️ Auto-save thumbnails when saving camera views

### Queue System
- ⏳ Real-time upload/conversion queue with status tracking
- 🔄 Sequential job processing prevents conflicts
- 🎯 Auto-return to gallery after conversions complete
- ⚠️ Duplicate detection prevents duplicate uploads

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **3D Rendering:** Three.js + SplatMesh
- **State Management:** Zustand
- **Backend:** Express.js + Node.js
- **Styling:** TailwindCSS + Framer Motion
- **File Handling:** Multer + Node.js fs

## Local Development

### Prerequisites
- Node.js 16+
- npm or yarn

### Quick Start

```bash
# Install dependencies
npm install

# Terminal 1: Start backend server (port 4011)
npm run server

# Terminal 2: Start frontend dev server (port 4010)
npm run dev
```

Then open http://localhost:4010/

### Configuration

**Frontend Port:** 4010  
**Backend Port:** 4011  
**API Proxy:** `/api` → `http://localhost:4011`

Ports can be changed in:
- Frontend: `vite.config.ts`
- Backend: `server.js` (const PORT = 4011)

## Usage

### Uploading Splats
1. Click "Upload New" button in gallery
2. Drag & drop or select files
3. Supported formats: `.ply`, `.splat`, `.ksplat`, `.spz`
4. PLY files automatically convert to SPLAT format
5. View progress in queue status
6. Auto-returns to gallery when done

### Saving Camera Views
1. Open a splat in the viewer
2. Position camera to desired angle
3. Click 📷 camera button
4. View auto-restores next time splat opens

### Managing Splats
- **Download:** Click ⬇️ button to download original PLY file
- **Delete:** Click 🗑️ button to remove splat (cleans up all related files)
- **Rename:** Click ✏️ button to rename splat (updates files, manifest, and saved views)

## File Structure

```
public/
├── splats/              # All splat files (.splat, .ply, .ksplat, .spz)
├── splats.json          # Manifest (auto-validated on each request)
├── views.json           # Saved camera positions
├── thumbnails/          # Saved view thumbnails (.jpg)
└── uploads/             # Temporary upload directory (auto-cleaned)

scripts/
├── generate_manifest.cjs    # Scan splats/ and generate splats.json
├── convert_ply_to_splat.cjs # Convert single PLY to SPLAT format
└── convert_all_ply.cjs      # Batch convert all PLY files

src/
├── components/
│   ├── Gallery.tsx       # Gallery view and upload button
│   ├── SplatViewer.tsx   # 3D viewer with controls
│   ├── Ingest.tsx        # Upload dialog
│   └── UIOverlay.tsx     # Action buttons
├── App.tsx               # Main router
├── store.ts              # Zustand global state
└── constants.ts          # Camera settings
```

## API Endpoints

### GET `/api/splats`
Returns manifest of all available splats (auto-validates against disk)

### POST `/api/ingest`
Upload file for conversion. Returns job ID and status.

### GET `/api/queue`
Check upload/conversion queue status

### POST `/api/splats/:id/view`
Save camera position and thumbnail for a splat

### GET `/api/splats/:id/view`
Retrieve saved camera view data

### DELETE `/api/splats/:id`
Delete splat file, thumbnail, view data, and manifest entry

### PUT `/api/splats/:id`
Rename splat (updates file, manifest, views, thumbnails)

### GET `/api/health`
Health check endpoint

## Creating Splats from Photos

This gallery displays pre-generated 3D Gaussian Splats. To create splats from photos:

1. Use Gaussian Splatting software (e.g., [Nerfies](https://nerfies.github.io/), [COLMAP](https://colmap.github.io/), or commercial tools)
2. Export as `.ply` format (the standard Gaussian Splats format)
3. Upload via "Upload New" button in gallery
4. Automatic conversion to `.splat` format happens server-side

## Known Limitations

- **Edit/Rename:** Requires page refresh to see updated name in gallery UI (backend correctly updates files)
- **PLY Conversion Speed:** Large files (1GB+) take 15-30+ seconds to convert (CPU-intensive)
- **Thumbnails:** Auto-save may fail on some browsers with strict CORS policies
- **AR on iOS:** WebXR AR not supported in Safari (Apple limitation)
- **iOS Gyro Mode:** Device tilt control is opt-in only (pass `enableTiltControl` prop); not auto-enabled on mobile to avoid conflicts with touch orbit

## License

MIT
