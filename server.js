import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 4011;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Multer configuration for file uploads
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const uploadsDir = path.join(__dirname, 'public', 'uploads');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            cb(null, uploadsDir);
        },
        filename: (req, file, cb) => {
            const timestamp = Date.now();
            cb(null, `${timestamp}-${file.originalname}`);
        }
    }),
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.ply', '.splat', '.ksplat', '.spz'].includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file format. Only PLY, SPLAT, KSPLAT, SPZ are supported.'));
        }
    }
});

// Queue system
let jobQueue = [];
let jobIdCounter = 0;

function generateJobId() {
    return `job-${++jobIdCounter}-${Date.now()}`;
}

// Views storage file
const VIEWS_FILE = path.join(__dirname, 'public', 'views.json');

// Load existing views
function loadViews() {
    if (fs.existsSync(VIEWS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(VIEWS_FILE, 'utf8'));
        } catch (e) {
            console.error('Error loading views:', e);
            return {};
        }
    }
    return {};
}

// Save views
function saveViews(views) {
    try {
        fs.writeFileSync(VIEWS_FILE, JSON.stringify(views, null, 2));
    } catch (e) {
        console.error('Error saving views:', e);
    }
}

// Validate manifest against actual files
function validateManifest() {
    try {
        const manifestPath = path.join(__dirname, 'public', 'splats.json');
        const splatsDir = path.join(__dirname, 'public', 'splats');

        let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const originalLength = manifest.length;

        // Filter manifest to only include splats that actually exist
        manifest = manifest.filter(item => {
            const filePath = path.join(splatsDir, item.filename);
            return fs.existsSync(filePath);
        });

        // If files were removed, update the manifest
        if (manifest.length < originalLength) {
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            console.log(`🔄 Manifest synced: ${originalLength - manifest.length} missing splats removed`);
        }

        return manifest;
    } catch (e) {
        console.error('Error validating manifest:', e);
        return [];
    }
}

// Convert PLY to SPLAT format
async function convertPlyToSplat(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            const script = path.join(__dirname, 'scripts', 'convert_ply_to_splat.cjs');
            execSync(`node ${script} "${inputPath}" "${outputPath}"`, { stdio: 'pipe' });
            resolve(true);
        } catch (e) {
            reject(e);
        }
    });
}

// Process upload queue
async function processQueue() {
    if (jobQueue.length === 0) return;

    const job = jobQueue[0];
    try {
        job.status = 'processing';
        const splatsDir = path.join(__dirname, 'public', 'splats');
        const uploadsDir = path.join(__dirname, 'public', 'uploads');
        const manifestPath = path.join(__dirname, 'public', 'splats.json');

        const ext = path.extname(job.filePath).toLowerCase();
        const baseName = path.basename(job.filePath, ext);
        const outputPath = path.join(splatsDir, `${baseName}.splat`);

        // Check for duplicates
        if (fs.existsSync(outputPath)) {
            throw new Error(`Splat ${baseName} already exists`);
        }

        if (ext === '.ply') {
            // Convert PLY to SPLAT
            console.log(`🔄 Converting ${baseName}.ply to SPLAT...`);
            await convertPlyToSplat(job.filePath, outputPath);
            console.log(`✅ Converted: ${baseName}`);
        } else {
            // Direct copy for already-converted formats
            fs.copyFileSync(job.filePath, outputPath);
            console.log(`✅ Copied: ${baseName}${ext}`);
        }

        // Update manifest
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const stats = fs.statSync(outputPath);
        const sizeGB = (stats.size / 1024 / 1024 / 1024).toFixed(2);

        manifest.push({
            id: baseName,
            filename: `${baseName}.splat`,
            format: 'splat',
            sizeGB: parseFloat(sizeGB),
            originalSizeGB: ext === '.ply' ? parseFloat(sizeGB) : undefined,
            hasThumb: false
        });

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`✅ Added to manifest: ${baseName}`);

        // Clean up uploaded file
        fs.unlinkSync(job.filePath);

        job.status = 'completed';
        console.log(`✅ Job completed: ${job.originalName}`);

        // Keep job in queue for 2 seconds so frontend can see completion
        setTimeout(() => {
            jobQueue.shift();
            processQueue();
        }, 2000);
    } catch (e) {
        console.error(`❌ Job failed: ${job.originalName}`, e.message);
        job.status = 'failed';
        job.error = e.message;

        // Clean up failed file
        try {
            fs.unlinkSync(job.filePath);
        } catch { }

        // Keep job in queue for 2 seconds so frontend can see failure
        setTimeout(() => {
            jobQueue.shift();
            processQueue();
        }, 2000);
    }
}

// GET /api/splats - List all splats (auto-validates manifest)
app.get('/api/splats', (req, res) => {
    try {
        const manifest = validateManifest();
        res.json(manifest);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load manifest' });
    }
});

// POST /api/splats/:id/view - Save view
app.post('/api/splats/:id/view', (req, res) => {
    const { id } = req.params;
    const { position, target, up, thumbnail } = req.body;

    if (!id || !position || !target || !up) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const views = loadViews();
    views[id] = {
        position,
        target,
        up,
        // Don't store full thumbnail in JSON - it's too large
        // Just store metadata
        savedAt: new Date().toISOString()
    };

    // Save thumbnail separately if provided
    if (thumbnail) {
        try {
            const base64Data = thumbnail.replace(/^data:image\/jpeg;base64,/, '');
            const thumbnailPath = path.join(__dirname, 'public', 'thumbnails', `${id}.jpg`);
            const thumbDir = path.join(__dirname, 'public', 'thumbnails');

            // Create thumbnails directory if it doesn't exist
            if (!fs.existsSync(thumbDir)) {
                fs.mkdirSync(thumbDir, { recursive: true });
            }

            fs.writeFileSync(thumbnailPath, Buffer.from(base64Data, 'base64'));
            console.log(`📸 Saved thumbnail for splat: ${id}`);
        } catch (e) {
            console.warn(`Could not save thumbnail for ${id}:`, e.message);
        }
    }

    saveViews(views);
    console.log(`✅ Saved view for splat: ${id}`);
    res.json({ success: true, message: `View saved for ${id}` });
});

// GET /api/splats/:id/view - Get saved view
app.get('/api/splats/:id/view', (req, res) => {
    const { id } = req.params;
    const views = loadViews();

    if (views[id]) {
        res.json(views[id]);
    } else {
        res.status(404).json({ error: 'View not found' });
    }
});

// DELETE /api/splats/:id - Delete splat
app.delete('/api/splats/:id', (req, res) => {
    const { id } = req.params;

    try {
        const splatsDir = path.join(__dirname, 'public', 'splats');
        const thumbsDir = path.join(__dirname, 'public', 'thumbnails');
        const manifestPath = path.join(__dirname, 'public', 'splats.json');

        let deleted = false;

        // Delete .splat file
        const splatPath = path.join(splatsDir, `${id}.splat`);
        if (fs.existsSync(splatPath)) {
            fs.unlinkSync(splatPath);
            console.log(`🗑️  Deleted splat: ${id}.splat`);
            deleted = true;
        }

        // Delete .ply file if exists
        const plyPath = path.join(splatsDir, `${id}.ply`);
        if (fs.existsSync(plyPath)) {
            fs.unlinkSync(plyPath);
            console.log(`🗑️  Deleted original: ${id}.ply`);
        }

        // Delete thumbnail
        const thumbPath = path.join(thumbsDir, `${id}.jpg`);
        if (fs.existsSync(thumbPath)) {
            fs.unlinkSync(thumbPath);
            console.log(`🗑️  Deleted thumbnail: ${id}.jpg`);
        }

        // Delete view data
        const views = loadViews();
        if (views[id]) {
            delete views[id];
            saveViews(views);
            console.log(`🗑️  Deleted view data for: ${id}`);
        }

        // Remove from manifest
        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            const filteredManifest = manifest.filter(item => item.id !== id);
            if (filteredManifest.length < manifest.length) {
                fs.writeFileSync(manifestPath, JSON.stringify(filteredManifest, null, 2));
                console.log(`🗑️  Removed from manifest: ${id}`);
            }
        } catch (e) {
            console.warn(`Could not update manifest for ${id}:`, e.message);
        }

        if (!deleted) {
            return res.status(404).json({ error: `Splat ${id} not found` });
        }

        console.log(`✅ Successfully deleted splat: ${id}`);
        res.json({ success: true, message: `Splat ${id} deleted` });
    } catch (e) {
        console.error('Error deleting splat:', e);
        res.status(500).json({ error: 'Failed to delete splat', details: e.message });
    }
});

// PUT /api/splats/:id - Rename splat
app.put('/api/splats/:id', (req, res) => {
    const { id } = req.params;
    const { newName } = req.body;

    if (!newName || newName === id) {
        return res.status(400).json({ error: 'Invalid new name' });
    }

    try {
        const splatsDir = path.join(__dirname, 'public', 'splats');
        const thumbsDir = path.join(__dirname, 'public', 'thumbnails');
        const manifestPath = path.join(__dirname, 'public', 'splats.json');

        // Find the original file extension
        let originalExt = null;
        const validExts = ['.splat', '.ply', '.spz', '.ksplat'];
        for (const ext of validExts) {
            const testPath = path.join(splatsDir, `${id}${ext}`);
            if (fs.existsSync(testPath)) {
                originalExt = ext;
                break;
            }
        }

        if (!originalExt) {
            return res.status(404).json({ error: `Splat ${id} not found` });
        }

        // Rename splat file
        const oldSplatPath = path.join(splatsDir, `${id}${originalExt}`);
        const newSplatPath = path.join(splatsDir, `${newName}${originalExt}`);
        fs.renameSync(oldSplatPath, newSplatPath);
        console.log(`✏️  Renamed splat: ${id}${originalExt} → ${newName}${originalExt}`);

        // Rename PLY file if exists
        const oldPlyPath = path.join(splatsDir, `${id}.ply`);
        if (fs.existsSync(oldPlyPath)) {
            const newPlyPath = path.join(splatsDir, `${newName}.ply`);
            fs.renameSync(oldPlyPath, newPlyPath);
            console.log(`✏️  Renamed original: ${id}.ply → ${newName}.ply`);
        }

        // Rename thumbnail
        const oldThumbPath = path.join(thumbsDir, `${id}.jpg`);
        const newThumbPath = path.join(thumbsDir, `${newName}.jpg`);
        if (fs.existsSync(oldThumbPath)) {
            fs.renameSync(oldThumbPath, newThumbPath);
            console.log(`✏️  Renamed thumbnail: ${id}.jpg → ${newName}.jpg`);
        }

        // Update view data
        const views = loadViews();
        if (views[id]) {
            views[newName] = views[id];
            delete views[id];
            saveViews(views);
            console.log(`✏️  Updated view data: ${id} → ${newName}`);
        }

        // Update manifest
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const splatIndex = manifest.findIndex(s => s.id === id);
        if (splatIndex !== -1) {
            manifest[splatIndex].id = newName;
            manifest[splatIndex].filename = `${newName}${originalExt}`;
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            console.log(`✏️  Updated manifest: ${id} → ${newName}`);
        }

        console.log(`✅ Successfully renamed splat: ${id} → ${newName}`);
        res.json({ success: true, newId: newName, message: `Splat renamed to ${newName}` });
    } catch (e) {
        console.error('Error renaming splat:', e);
        res.status(500).json({ error: 'Failed to rename splat', details: e.message });
    }
});

// POST /api/ingest - Upload and queue splat for processing
app.post('/api/ingest', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const manifests = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'splats.json'), 'utf8'));
        const baseName = path.basename(req.file.filename, path.extname(req.file.filename));

        // Check for duplicates
        const ext = path.extname(req.file.originalname).toLowerCase();
        const dupeName = ext === '.ply' ? `${baseName}.splat` : req.file.originalname;

        if (manifests.some(m => m.filename === dupeName)) {
            fs.unlinkSync(req.file.path);
            return res.status(409).json({
                error: 'duplicate',
                message: `${path.basename(req.file.originalname)} already exists in the gallery`
            });
        }

        // Create job
        const job = {
            id: generateJobId(),
            originalName: req.file.originalname,
            filename: path.basename(req.file.filename),
            filePath: req.file.path,
            status: 'queued',
            progress: 0
        };

        jobQueue.push(job);
        console.log(`📤 Queued upload: ${job.originalName}`);

        // Start processing if idle
        if (jobQueue.length === 1) {
            processQueue();
        }

        res.json({ success: true, job });
    } catch (e) {
        console.error('Ingest error:', e);
        if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch { }
        }
        res.status(500).json({ error: 'Upload failed', details: e.message });
    }
});

// GET /api/queue - Get queue status
app.get('/api/queue', (req, res) => {
    res.json({ queue: jobQueue });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', server: 'photo-splat-gallery backend' });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║  🎯 Photo Splat Gallery Backend Running   ║
╠════════════════════════════════════════════╣
║  Server: http://localhost:${PORT}             ║
║  Frontend: http://localhost:4010           ║
║  API: /api/splats                          ║
║  View Save: POST /api/splats/:id/view      ║
╚════════════════════════════════════════════╝
    `);
});
