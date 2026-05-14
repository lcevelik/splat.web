import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Browser Polyfills for @sparkjsdev/spark in Node.js ---
if (typeof global.navigator === 'undefined') {
    global.navigator = {
        xr: {
            addEventListener: () => { },
            removeEventListener: () => { },
            isSessionSupported: () => Promise.resolve(false),
        },
        userAgent: 'node',
        platform: 'linux'
    };
}
if (typeof global.window === 'undefined') {
    global.window = global;
}
if (typeof global.document === 'undefined') {
    global.document = {
        createElement: () => ({ style: {} }),
        querySelector: () => null,
        addEventListener: () => { },
    };
}
if (typeof global.self === 'undefined') {
    global.self = global;
}
// Polyfill Blob if missing (Node 20 has it, but just in case)
// if (typeof global.Blob === 'undefined') ... Node 20 has Blob globally.

// --- End Polyfills ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPLATS_DIR = path.join(__dirname, '../public/splats');
const OUTPUT_DIR = path.join(__dirname, '../public/splats-compressed');

// Ensure output dir exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

let transcodeSpz;

async function compressFile(filename) {
    // Dynamic import to ensure polyfills are set before module loads
    if (!transcodeSpz) {
        const spark = await import('@sparkjsdev/spark');
        transcodeSpz = spark.transcodeSpz;
    }

    const inputPath = path.join(SPLATS_DIR, filename);
    const outputName = filename.replace(/\.ply$/i, '.spz');
    const outputPath = path.join(OUTPUT_DIR, outputName);

    if (fs.existsSync(outputPath)) {
        // console.log(`Skipping ${filename} (exists)`);
        return false;
    }

    console.log(`Compressing ${filename}...`);

    try {
        const fileBuffer = fs.readFileSync(inputPath);
        const fileBytes = new Uint8Array(fileBuffer);

        const transcodeInfo = {
            inputs: [{
                fileBytes: fileBytes,
                pathOrUrl: filename,
                format: 'ply'
            }],
            maxSh: 1, // Start safely
            fractionalBits: 12,
            opacityThreshold: 0
        };

        const result = await transcodeSpz(transcodeInfo);

        if (result.fileBytes) {
            fs.writeFileSync(outputPath, result.fileBytes);

            const inSize = fileBytes.length / 1024 / 1024;
            const outSize = result.fileBytes.length / 1024 / 1024;
            const ratio = (1 - outSize / inSize) * 100;
            console.log(`  ✓ Done: ${inSize.toFixed(2)}MB -> ${outSize.toFixed(2)}MB (${ratio.toFixed(1)}%)`);
            return true;
        } else {
            throw new Error("No output bytes returned");
        }

    } catch (err) {
        console.error(`  ✗ Failed ${filename}:`, err);
        return false;
    }
}

async function main() {
    const files = fs.readdirSync(SPLATS_DIR).filter(f => f.toLowerCase().endsWith('.ply'));

    if (files.length === 0) {
        console.log("No .ply files to compress.");
        return;
    }

    console.log(`Checking ${files.length} splats for compression...`);

    let processed = 0;
    for (const file of files) {
        if (await compressFile(file)) {
            processed++;
        }
    }

    if (processed > 0) {
        console.log(`Compressed ${processed} files.`);
    }
}

main().catch(console.error);
