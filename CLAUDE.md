# 3DGS Gallery - Development Guide

This file contains development guidelines, architecture notes, and context for working on the 3DGS Gallery project.

## Quick Start

```bash
# Terminal 1: Start backend
npm run server

# Terminal 2: Start frontend
npm run dev
```

Visit: http://localhost:4010/

## Architecture Overview

### Ports & Configuration
- **Frontend (Vite):** Port 4010 → http://localhost:4010/
- **Backend (Express):** Port 4011 → http://localhost:4011
- **API Proxy:** Vite proxies /api requests to backend
- **Cache-Control:** no-cache headers to prevent stale manifest issues
- **Production:** https://splat.steadiczech.com/ (Apache reverse proxy + systemd service splat-backend.service)

### Key Flows

#### Upload & Conversion
1. User uploads file via Ingest dialog (drag & drop)
2. Frontend POST /api/ingest with file (multipart/form-data)
3. Backend creates Job, queues it, returns job ID
4. Frontend polls GET /api/queue every 300ms
5. Backend processes queue sequentially (execSync PLY conversion)
6. After 2 seconds in queue (for frontend detection), job removed
7. Frontend detects completion → auto-navigates to gallery

**Critical Detail:** Jobs must stay in queue 2 seconds after completion. Removing too fast causes auto-return logic to fail.

#### Saving Camera View
1. User adjusts camera in viewer → clicks camera button
2. Frontend POST /api/splats/:id/view with position/target/up vectors + thumbnail
3. Backend saves vectors to views.json, thumbnail as JPEG
4. On next load, viewer fetches GET /api/splats/:id/view
5. Camera automatically restores to saved position

#### Delete Splat
1. User clicks delete button
2. Frontend DELETE /api/splats/:id
3. Backend deletes: file, .ply (if exists), thumbnail, view data
4. Backend removes from manifest
5. Frontend navigates to gallery
6. On next load, splat gone from manifest

#### Rename Splat
1. User clicks edit (pencil) button
2. Frontend PUT /api/splats/:id with {newName}
3. Backend renames: file, .ply (if exists), thumbnail, view data, manifest
4. Frontend updates store and URL
5. **Known Issue:** UI doesn't refresh automatically (requires page refresh)

## Important Implementation Details

### Manifest Validation
- **WHERE:** Runs on every GET /api/splats call
- **WHAT:** Compares manifest to actual files on disk
- **RESULT:** Removes entries for deleted files automatically
- **WHY:** Prevents "ghost" splats showing in gallery after manual file deletion

### Queue Processing
```javascript
// Why sequential (not parallel)?
// - Ensures orderly file output
// - Prevents disk I/O conflicts
// - Each job gets 2-second window for frontend detection
// - execSync blocks, so parallel is not possible anyway
```

### Thumbnail Storage
- **NOT in JSON:** Base64 images bloat views.json unnecessarily
- **Separate JPEG files:** public/thumbnails/{id}.jpg
- **Size:** Compressed to 1/10 of splat size
- **Auto-cleaned:** Deleted when splat deleted

### File Extensions
When renaming or managing splats, always check multiple extensions:
- `.splat` - Primary format (converted from PLY)
- `.ply` - Original raw format (kept for download)
- `.ksplat` - Compressed variant
- `.spz` - Another compressed variant

## Common Tasks

### Adding a New API Endpoint
1. Add route to server.js
2. Import necessary modules (fs, path, etc.)
3. Log important operations (console.log for debugging)
4. Handle errors with try/catch
5. Return JSON responses
6. Test with curl or Postman
7. Update this guide with endpoint details

### Modifying Viewer Controls
1. Files: src/components/SplatViewer.tsx
2. Camera setup in useEffect hook
3. Controls handled by OrbitControls (Three.js)
4. Restore saved view in camera restoration section (lines 106-133)
5. Test with multiple splats to ensure views restore correctly

### Fixing Upload Issues
1. Check browser console for network errors
2. Check server logs (terminal running npm run server)
3. Verify /api/queue shows jobs being created
4. Check public/uploads/ for temporary files (should be cleaned up)
5. Ensure convert_ply_to_splat.cjs exists and is executable
6. Check public/splats/ for converted files

### Updating Gallery UI
1. Files: src/components/Gallery.tsx
2. Gallery fetches manifest on mount
3. Maps manifest to card components
4. Shows splat name and file size on hover
5. Click navigates to SplatViewer
6. Test that manifest validation works (delete file, refresh, should be gone)

## Known Issues & Workarounds

### Edit Button Doesn't Update Name Immediately
**Status:** Backend works, frontend UI doesn't refresh  
**Workaround:** User must refresh page to see new name  
**Fix:** Add useEffect to Gallery that watches URL changes or update store after rename completes

### PLY Conversion Very Slow
**Status:** Expected for large files (30+ seconds for 1GB+)  
**Info:** CPU-intensive binary format processing  
**Not a bug:** Just slow (could be improved with worker threads)

### Browser Shows Old Manifest
**Status:** Fixed with Cache-Control headers  
**Solution:** Hard refresh (Ctrl+Shift+R) may be needed on first load  
**Why:** Vite dev server should send no-cache, but browser might cache anyway

### Splats Not Showing After Upload
**Status:** Usually means file not in public/splats/  
**Debug:** Check server logs for conversion errors  
**Check:** Is convert_ply_to_splat.cjs in scripts/ folder?  
**Verify:** Do files exist in public/splats/? Compare with splats.json

### iOS Scroll (Fixed)
**Status:** Fixed — added `touchAction: 'pan-y'` to gallery cards
**Root cause:** framer-motion sets `touch-action: none` on elements with gesture handlers, which kills iOS momentum scrolling

### iOS Viewer Controls (Fixed)
**Status:** Fixed — gyro tilt no longer auto-activates on mobile
**Root cause:** `shouldEnableTilt` was `isMobile || enableTiltControl`, causing gyro and OrbitControls to fight each frame
**Current behavior:** OrbitControls handles all touch (one-finger orbit, pinch zoom). Tilt only activates when `enableTiltControl` prop is explicitly passed.

## Testing Checklist

Before closing a session, test:
- ✅ Upload small file (should complete in 1-3 seconds)
- ✅ Upload large PLY file (wait for conversion, check queue)
- ✅ Auto-return to gallery after upload
- ✅ Save camera view (camera button)
- ✅ Close and reopen splat (view restores)
- ✅ Rename splat (edit button - note: requires refresh)
- ✅ Download PLY (download button)
- ✅ Delete splat (trash button, verify deleted)
- ✅ Hard refresh gallery (manifest auto-validates)
- ✅ Check manifest matches actual files

## Code Style Notes

- **No comments:** Self-documenting code preferred (good naming)
- **Console.log:** Keep for debugging, clearly show what operation happened
- **Error handling:** Wrap file operations in try/catch, log errors
- **Async:** Use async/await for clarity, not .then() chains
- **Types:** Use TypeScript for React components (avoid any)
- **Imports:** Group by: react, external libs, local components, utils

## Useful Commands

```bash
# Check manifest against actual files
node scripts/generate_manifest.cjs

# Convert all PLY files (if any PLY files exist)
node scripts/convert_all_ply.cjs

# View server logs (already running in npm run server)
# Just look at the terminal output

# Test API endpoint
curl http://localhost:4011/api/splats | jq
curl http://localhost:4011/api/queue | jq
curl http://localhost:4011/api/health | jq
```

## Dependencies & Versions

**Frontend:**
- react 19, typescript, vite, three.js, zustand
- framer-motion (animations), tailwindcss, lucide-react (icons)

**Backend:**
- express, multer (uploads), node.js built-ins (fs, path, child_process)

**Scripts:**
- Node.js built-ins (fs, path, child_process)
- ImageMagick (convert_ply_to_splat.cjs uses system convert command)

**Known Issue:** If ImageMagick not installed, PLY conversion fails silently

## Session Closure

Before ending a session:
1. Update this CLAUDE.md if adding new patterns
2. Update project_status.md if major changes made
3. Test all core features work
4. Leave servers running or document final state
5. Commit changes to git if applicable
