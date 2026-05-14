const fs = require('fs');
const path = require('path');

const SPLATS_DIR = path.join(__dirname, '..', 'public', 'splats');
const COMPRESSED_DIR = path.join(__dirname, '..', 'public', 'splats-compressed');
const THUMBS_DIR = path.join(__dirname, '..', 'public', 'thumbnails');
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'splats.json');

console.log('📦 Generating static splats manifest...');

try {
    const validExtensions = ['.splat', '.ksplat', '.spz'];
    const splatMap = new Map(); // Use Map to dedupe by ID

    // Scan original splats directory (if exists)
    if (fs.existsSync(SPLATS_DIR)) {
        fs.readdirSync(SPLATS_DIR)
            .filter(f => validExtensions.some(ext => f.toLowerCase().endsWith(ext)))
            .forEach(f => {
                const ext = path.extname(f);
                const baseName = path.basename(f, ext);
                const filePath = path.join(SPLATS_DIR, f);
                const stats = fs.statSync(filePath);
                const sizeGB = (stats.size / (1024 * 1024 * 1024)).toFixed(2);

                // Check for original PLY file
                const plyPath = path.join(SPLATS_DIR, baseName + '.ply');
                let originalSizeGB = null;
                if (fs.existsSync(plyPath)) {
                    const plyStats = fs.statSync(plyPath);
                    originalSizeGB = parseFloat((plyStats.size / (1024 * 1024 * 1024)).toFixed(2));
                }

                splatMap.set(baseName, {
                    id: baseName,
                    filename: f,
                    format: ext.substring(1),
                    sizeGB: parseFloat(sizeGB),
                    originalSizeGB: originalSizeGB,
                    hasThumb: fs.existsSync(path.join(THUMBS_DIR, baseName + '.jpg'))
                });
            });
    }

    // Splats-compressed folder is no longer used

    const files = Array.from(splatMap.values());

    if (files.length === 0) {
        console.log('⚠️ No splat files found in splats/ or splats-compressed/');
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(files, null, 2));
    console.log(`✅ Manifest generated with ${files.length} items at ${OUTPUT_FILE}`);
} catch (err) {
    console.error('❌ Error generating manifest:', err.message);
    process.exit(1);
}
