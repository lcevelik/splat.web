const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const multer = require('multer');
const chokidar = require('chokidar');

const app = express();
const PORT = 3001;

// Configuration
const PROJECT_ROOT = path.join(__dirname, '..');
const SPLATS_DIR = path.join(PROJECT_ROOT, 'public', 'splats');
const COMPRESSED_DIR = path.join(PROJECT_ROOT, 'public', 'splats-compressed');
const THUMBS_DIR_PUBLIC = path.join(PROJECT_ROOT, 'public', 'thumbnails');
const THUMBS_DIR_DIST = path.join(PROJECT_ROOT, 'dist', 'thumbnails');
const CONFIGS_DIR = path.join(PROJECT_ROOT, 'public', 'configs');
const UPLOADS_DIR = path.join(PROJECT_ROOT, 'uploads');
const ML_SHARP_PATH = path.join(process.env.HOME, 'Projects/ml-sharp'); // Assumed path

// Ensure directories exist
[SPLATS_DIR, THUMBS_DIR_PUBLIC, THUMBS_DIR_DIST, CONFIGS_DIR, UPLOADS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Global State
const jobQueue = [];
let isProcessing = false;
const processedFiles = new Set(); // To avoid infinite loops with watcher

// CORS & Middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
});
app.use(express.json({ limit: '10mb' }));

// --- Job Queue System ---

function processNextJob() {
    if (jobQueue.length === 0) {
        isProcessing = false;
        return;
    }

    isProcessing = true;
    const job = jobQueue[0];
    job.status = 'processing';
    job.startedAt = Date.now();

    console.log(`Resource Job [${job.id}]: Starting prediction for ${job.originalName}`);

    // Command to run ml-sharp
    // We assume the user has a .venv in ~/Projects/ml-sharp
    const cmd = `source ${path.join(ML_SHARP_PATH, '.venv/bin/activate')} && sharp predict -o "${SPLATS_DIR}" -i "${job.filePath}"`;

    const child = exec(cmd, { shell: '/bin/bash' });

    child.stdout.on('data', (data) => console.log(`[Job ${job.id}]: ${data.toString().trim()}`));
    child.stderr.on('data', (data) => console.error(`[Job ${job.id} ERROR]: ${data.toString().trim()}`));

    child.on('exit', (code) => {
        if (code === 0) {
            console.log(`Resource Job [${job.id}]: Completed successfully.`);
            job.status = 'completed';
            job.completedAt = Date.now();

            // Clean up upload
            try { fs.unlinkSync(job.filePath); } catch (e) { }
        } else {
            console.error(`Resource Job [${job.id}]: Failed with code ${code}`);
            job.status = 'failed';
            job.error = `Process exited with code ${code}`;
        }

        jobQueue.shift(); // Remove current job
        processNextJob(); // Process next
    });
}

function addToQueue(file) {
    const job = {
        id: Date.now().toString(),
        originalName: file.originalname,
        filePath: file.path,
        status: 'queued', // queued, processing, completed, failed
        addedAt: Date.now()
    };
    jobQueue.push(job);
    if (!isProcessing) processNextJob();
    return job;
}

// --- Watcher & Automation ---

const watcher = chokidar.watch(SPLATS_DIR, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
    }
});

watcher.on('add', (filePath) => {
    const fileName = path.basename(filePath);

    // Only process .ply files
    if (!fileName.toLowerCase().endsWith('.ply')) return;
    if (processedFiles.has(fileName)) return;

    console.log(`✨ New Splat Detected: ${fileName}`);
    processedFiles.add(fileName);

    // 1. Generate Thumbnail (Python script)
    // 2. Compress to .spz (Node script)

    // We run these in sequence roughly
    const venvPath = path.join(PROJECT_ROOT, '.venv');
    const pythonPath = fs.existsSync(path.join(venvPath, 'bin/python'))
        ? path.join(venvPath, 'bin/python')
        : 'python3';

    console.log('   Running auto-processing...');

    // Run Thumbnail Generation (Quick pass just for this file? The script does all, which is safe but maybe slow)
    // We'll run the existing scripts which scan everything.
    // Run Thumbnail Generation (Puppeteer)
    // Needs the server running, which it should be if api is running
    const thumbProc = spawn('node', ['scripts/generate_thumbnails_puppeteer.cjs'], { cwd: PROJECT_ROOT });

    thumbProc.on('close', (code) => {
        console.log(`   Thumbnail generation finished (code ${code}).`);

        // Run Compression (Spark)
        const compressProc = spawn('node', ['scripts/compress_spark.js'], { cwd: PROJECT_ROOT });
        compressProc.stdout.on('data', d => process.stdout.write(`   [Compress] ${d}`));
        compressProc.on('close', c => {
            console.log(`   Compression finished (code ${c}).`);
        });
    });
});

// --- API Endpoints ---

// List Splats
app.get('/api/splats', (req, res) => {
    try {
        const files = fs.readdirSync(SPLATS_DIR)
            .filter(f => f.endsWith('.ply'))
            .map(f => {
                const id = f.replace('.ply', '');
                return {
                    id: id,
                    filename: f,
                    hasThumb: fs.existsSync(path.join(THUMBS_DIR_PUBLIC, id + '.jpg')),
                    config: fs.existsSync(path.join(CONFIGS_DIR, id + '.json'))
                        ? JSON.parse(fs.readFileSync(path.join(CONFIGS_DIR, id + '.json')))
                        : null
                };
            });
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ingest / Upload
app.post('/api/ingest', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
    }

    // Check if a splat with similar name already exists
    const originalName = req.file.originalname;
    const baseName = path.basename(originalName, path.extname(originalName));

    // Check for existing splats with similar base name
    const existingSplats = fs.readdirSync(SPLATS_DIR);
    const duplicate = existingSplats.find(f => {
        const splatBase = path.basename(f, path.extname(f));
        return splatBase.toLowerCase() === baseName.toLowerCase() ||
            splatBase.toLowerCase().includes(baseName.toLowerCase()) ||
            baseName.toLowerCase().includes(splatBase.toLowerCase());
    });

    if (duplicate) {
        // Clean up the uploaded file since we're not using it
        try { fs.unlinkSync(req.file.path); } catch (e) { }
        return res.status(409).json({
            error: 'duplicate',
            message: `A splat with a similar name already exists: ${duplicate}`,
            existingFile: duplicate
        });
    }

    const job = addToQueue(req.file);
    res.json({ success: true, job });
});

// Get Queue Status
app.get('/api/queue', (req, res) => {
    res.json({
        queue: jobQueue,
        isProcessing
    });
});

// Save Default View (and optionally update thumbnail)
app.post('/api/splats/:id/view', (req, res) => {
    const id = req.params.id;
    const configPath = path.join(CONFIGS_DIR, `${id}.json`);

    try {
        // Save camera config (position, target, up)
        const { thumbnail, ...config } = req.body;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        // If thumbnail provided (base64 data URL), save it
        if (thumbnail && thumbnail.startsWith('data:image/')) {
            const base64Data = thumbnail.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            const thumbPathPublic = path.join(THUMBS_DIR_PUBLIC, `${id}.jpg`);
            const thumbPathDist = path.join(THUMBS_DIR_DIST, `${id}.jpg`);

            fs.writeFileSync(thumbPathPublic, buffer);
            // Ensure dist dir exists
            if (!fs.existsSync(THUMBS_DIR_DIST)) fs.mkdirSync(THUMBS_DIR_DIST, { recursive: true });
            fs.writeFileSync(thumbPathDist, buffer);
            console.log(`   Updated thumbnail for ${id}`);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Failed to save view config:', err);
        res.status(500).json({ error: 'Failed to save view config' });
    }
});

// Delete Splat
app.delete('/api/splats/:id', (req, res) => {
    const id = req.params.id;
    const filesToDelete = [
        path.join(SPLATS_DIR, `${id}.ply`),
        path.join(COMPRESSED_DIR, `${id}.spz`), // Compressed version
        path.join(SPLATS_DIR, `${id}.splat`), // Legacy version?
        path.join(THUMBS_DIR_PUBLIC, `${id}.jpg`),
        path.join(THUMBS_DIR_DIST, `${id}.jpg`),
        path.join(CONFIGS_DIR, `${id}.json`)
    ];

    const deleted = [];
    const errors = [];

    filesToDelete.forEach(f => {
        if (fs.existsSync(f)) {
            try {
                fs.unlinkSync(f);
                deleted.push(path.basename(f));
            } catch (err) {
                errors.push(`Failed to delete ${path.basename(f)}: ${err.message}`);
            }
        }
    });

    if (errors.length === 0 && deleted.length === 0) {
        res.status(404).json({ error: 'Splat not found' });
    } else {
        res.json({ success: true, deleted, errors });
    }
});

// Rename Splat
app.put('/api/splats/:id', (req, res) => {
    const oldId = req.params.id;
    const { newName } = req.body;

    if (!newName || typeof newName !== 'string') {
        return res.status(400).json({ error: 'newName is required' });
    }

    // Sanitize new name (remove special chars, spaces to underscores)
    const newId = newName.trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_{2,}/g, '_');

    if (!newId || newId === oldId) {
        return res.status(400).json({ error: 'Invalid or same name' });
    }

    // Check if new name already exists
    if (fs.existsSync(path.join(SPLATS_DIR, `${newId}.ply`))) {
        return res.status(409).json({ error: 'A splat with this name already exists' });
    }

    const filesToRename = [
        { dir: SPLATS_DIR, ext: '.ply' },
        { dir: COMPRESSED_DIR, ext: '.spz' },
        { dir: THUMBS_DIR_PUBLIC, ext: '.jpg' },
        { dir: THUMBS_DIR_DIST, ext: '.jpg' },
        { dir: CONFIGS_DIR, ext: '.json' }
    ];

    const renamed = [];
    const errors = [];

    filesToRename.forEach(({ dir, ext }) => {
        const oldPath = path.join(dir, `${oldId}${ext}`);
        const newPath = path.join(dir, `${newId}${ext}`);

        if (fs.existsSync(oldPath)) {
            try {
                fs.renameSync(oldPath, newPath);
                renamed.push(`${oldId}${ext} -> ${newId}${ext}`);
            } catch (err) {
                errors.push(`Failed to rename ${oldId}${ext}: ${err.message}`);
            }
        }
    });

    if (renamed.length === 0 && errors.length === 0) {
        res.status(404).json({ error: 'Splat not found' });
    } else {
        res.json({ success: true, newId, renamed, errors });
    }
});

app.listen(PORT, () => {
    console.log(`🔧 Splat API server running on http://localhost:${PORT}`);
    console.log('   Watching public/splats for new files...');
});
