
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

const PORT = 5173; // Vite dev port, or we can use preview port 3000 if running?
// Let's assume we run against the PREVIEW server defined in start.sh (3000)
// OR we spin up our own vite server if needed.

const SPLATS_DIR = path.join(__dirname, '../public/splats');
const THUMBS_DIR = path.join(__dirname, '../public/thumbnails');
const DIST_THUMBS_DIR = path.join(__dirname, '../dist/thumbnails');
const URL_BASE = `http://localhost:3000/photo-splat-gallery/`;

async function main() {
    // Ensure directories
    if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });
    if (!fs.existsSync(DIST_THUMBS_DIR)) fs.mkdirSync(DIST_THUMBS_DIR, { recursive: true });

    // Find missing thumbnails
    const splats = fs.readdirSync(SPLATS_DIR).filter(f => f.endsWith('.ply'));
    const missing = splats.filter(f => {
        const id = f.replace('.ply', '');
        return !fs.existsSync(path.join(THUMBS_DIR, id + '.jpg'));
    });

    if (missing.length === 0) {
        console.log('✅ All thumbnails exist.');
        return;
    }

    console.log(`📸 Generating ${missing.length} missing thumbnails via Puppeteer...`);

    // Launch Browser (Visible as requested)
    const browser = await puppeteer.launch({
        headless: false, // Show browser
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720']
    });
    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });
    await page.setCacheEnabled(false);

    for (const filename of missing) {
        const id = filename.replace('.ply', '');
        const url = `${URL_BASE}?splat=${id}&clean=true`;

        console.log(`  Processing ${id}...`);

        try {
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

            // Wait for splat to be ready (requires global flag in app)
            // Fallback to timeout if flag not found to avoid infinite hang
            try {
                await page.waitForFunction(() => window.isSplatLoaded === true, { timeout: 15000 });
            } catch (e) {
                console.log('    (Wait timeout, taking screenshot anyway)');
            }

            // Small extra buffer for render catch-up
            await new Promise(r => setTimeout(r, 1000));

            const thumbPath = path.join(THUMBS_DIR, id + '.jpg');
            const distThumbPath = path.join(DIST_THUMBS_DIR, id + '.jpg');

            // Ensure dist thumbnails dir exists (might be wiped by build)
            if (!fs.existsSync(DIST_THUMBS_DIR)) fs.mkdirSync(DIST_THUMBS_DIR, { recursive: true });

            await page.screenshot({ path: thumbPath, type: 'jpeg', quality: 90 });

            try {
                fs.copyFileSync(thumbPath, distThumbPath);
            } catch (e) {
                console.warn(`    Warning: Could not copy to dist (not critical): ${e.message}`);
            }

            console.log(`  ✓ Saved ${thumbPath}`);
        } catch (e) {
            console.error(`  ✗ Failed ${id}:`, e.message);
        }
    }

    await browser.close();
    console.log('Done!');
}

main().catch(console.error);
