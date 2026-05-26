# 3DGS Gallery (splat.web)

## Goals
- [ ] Achieve stable AR/XR viewer experience on Android Chrome/Edge via WebXR by 2026-07-15
- [ ] Reach 99% reliable PLY-to-SPLAT automatic conversion pipeline by 2026-06-15
- [ ] Support all four formats (.ply, .splat, .ksplat, .spz) with seamless upload and viewing by 2026-07-01

## In Progress
- [ ] Refine the upload/conversion queue system for real-time status tracking and sequential job processing
- [ ] Improve thumbnail auto-generation when saving camera views

## To Do
- [ ] Add bulk upload support for multiple splat files at once with progress tracking
- [ ] Implement search and filtering in the gallery view for large collections
- [ ] Add batch delete functionality with confirmation dialog
- [ ] Support drag-and-drop reordering of gallery items
- [ ] Add download option for converted .splat files (not just original PLY)

## Done
- [x] Interactive 3D viewer with WASD + mouse orbit camera controls and mobile touch/tilt support
- [x] Drag-and-drop upload with automatic PLY-to-SPLAT conversion (~90% file size reduction)

## Blocked

## Releases
- v0.1.0 — planned 2026-06-01 — Initial release with gallery management, 3D viewer, and PLY conversion

## Notes
- Live at https://splat.steadiczech.com/ — React 19 + TypeScript + Three.js + SplatMesh + Express.js backend
- Saves and auto-restores camera viewing angles per splat; duplicate detection prevents redundant uploads
