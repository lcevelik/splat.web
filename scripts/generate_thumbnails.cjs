#!/usr/bin/env node
/**
 * Thumbnail Generation Helper
 * 
 * This script helps generate thumbnails for your Gaussian splats.
 * 
 * Since headless rendering of Gaussian splats is complex and your PLY format
 * may not be compatible with all libraries, here are your best options:
 * 
 * == OPTION 1: Use the Drop Viewer (Recommended) ==
 * 
 * 1. Run the dev server: npm run dev
 * 2. Go to: http://localhost:5174/photo-splat-gallery/?view=drop
 * 3. Drop each splat file
 * 4. Navigate to the right angle
 * 5. Click "Screenshot" button
 * 6. Save the screenshot as public/thumbnails/{splat-id}.jpg
 * 
 * == OPTION 2: SuperSplat Editor ==
 * 
 * 1. Go to: https://playcanvas.com/supersplat
 * 2. Upload your PLY file
 * 3. Position the camera
 * 4. Take a screenshot (browser screenshot or export)
 * 5. Save as public/thumbnails/{splat-id}.jpg
 * 
 * == Naming Convention ==
 * 
 * Thumbnail filenames should match the splat ID (filename without extension):
 *   - Splat: public/splats/IMG_0058~2.ply
 *   - Thumb: public/thumbnails/IMG_0058~2.jpg
 * 
 * The gallery will automatically pick up thumbnails that match this pattern.
 */

const fs = require('fs');
const path = require('path');

const splatsDir = path.join(__dirname, '../public/splats');
const thumbsDir = path.join(__dirname, '../public/thumbnails');

// Ensure thumbnails directory exists
if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir, { recursive: true });
    console.log('Created thumbnails directory:', thumbsDir);
}

// List splats that need thumbnails
const splats = fs.readdirSync(splatsDir)
    .filter(f => /\.(ply|splat|spz|ksplat)$/i.test(f));

const existingThumbs = fs.readdirSync(thumbsDir)
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .map(f => f.replace(/\.(jpg|jpeg|png|webp)$/i, ''));

const needsThumbs = splats
    .map(f => f.replace(/\.(ply|splat|spz|ksplat)$/i, ''))
    .filter(id => !existingThumbs.includes(id));

console.log('\n=== Thumbnail Status ===\n');
console.log(`Total splats: ${splats.length}`);
console.log(`Existing thumbnails: ${existingThumbs.length}`);
console.log(`Missing thumbnails: ${needsThumbs.length}`);

if (needsThumbs.length > 0) {
    console.log('\nSplats needing thumbnails:');
    needsThumbs.forEach(id => console.log(`  - ${id}`));

    console.log('\n=== How to Generate ===\n');
    console.log('1. Run: npm run dev');
    console.log('2. Open: http://localhost:5174/photo-splat-gallery/?view=drop');
    console.log('3. Drop each splat file listed above');
    console.log('4. Click "Screenshot" button');
    console.log('5. Rename and save to: public/thumbnails/{id}.jpg');
} else {
    console.log('\n✓ All splats have thumbnails!');
}
