#!/usr/bin/env node
/**
 * Compress PLY Gaussian Splats to SPZ format
 * 
 * Usage:
 *   node scripts/compress_splats.cjs [input.ply] [output.spz]
 *   node scripts/compress_splats.cjs --all  # Compress all in public/splats/
 * 
 * The SPZ format (by Niantic) provides ~90% size reduction with minimal quality loss.
 */

const fs = require('fs');
const path = require('path');

async function compressSplat(inputPath, outputPath) {
    console.log(`Compressing: ${path.basename(inputPath)}`);

    // Dynamic import for ESM module
    const spzJs = await import('spz-js');

    // Read the PLY file
    const plyData = fs.readFileSync(inputPath);

    // Load PLY to gaussian cloud data
    const gaussianCloud = await spzJs.loadPly(new Uint8Array(plyData));

    // Serialize to SPZ format
    const spzData = await spzJs.serializeSpz(gaussianCloud);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write output
    fs.writeFileSync(outputPath, Buffer.from(spzData));

    const inputSize = fs.statSync(inputPath).size;
    const outputSize = fs.statSync(outputPath).size;
    const reduction = ((1 - outputSize / inputSize) * 100).toFixed(1);

    console.log(`  ${(inputSize / 1024 / 1024).toFixed(1)} MB -> ${(outputSize / 1024 / 1024).toFixed(1)} MB (${reduction}% smaller)`);

    return { inputSize, outputSize };
}

async function compressAll() {
    const splatsDir = path.join(__dirname, '../public/splats');
    const compressedDir = path.join(__dirname, '../public/splats-compressed');

    // Create output directory
    if (!fs.existsSync(compressedDir)) {
        fs.mkdirSync(compressedDir, { recursive: true });
    }

    const files = fs.readdirSync(splatsDir).filter(f => f.endsWith('.ply'));

    if (files.length === 0) {
        console.log('No PLY files found in public/splats/');
        return;
    }

    console.log(`Found ${files.length} PLY files to compress\n`);

    let totalInput = 0;
    let totalOutput = 0;

    for (const file of files) {
        const inputPath = path.join(splatsDir, file);
        const outputPath = path.join(compressedDir, file.replace('.ply', '.spz'));

        try {
            const { inputSize, outputSize } = await compressSplat(inputPath, outputPath);
            totalInput += inputSize;
            totalOutput += outputSize;
        } catch (err) {
            console.error(`  Error: ${err.message}`);
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Total: ${(totalInput / 1024 / 1024).toFixed(1)} MB -> ${(totalOutput / 1024 / 1024).toFixed(1)} MB`);
    console.log(`Overall reduction: ${((1 - totalOutput / totalInput) * 100).toFixed(1)}%`);
    console.log(`\nCompressed files saved to: public/splats-compressed/`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help') {
        console.log(`
Gaussian Splat Compression Tool

Usage:
  node scripts/compress_splats.cjs <input.ply> [output.spz]   Compress single file
  node scripts/compress_splats.cjs --all                      Compress all in public/splats/

Options:
  --all     Compress all PLY files in public/splats/ to public/splats-compressed/
  --help    Show this help message
`);
        return;
    }

    if (args[0] === '--all') {
        await compressAll();
        return;
    }

    // Single file mode
    const inputPath = args[0];
    const outputPath = args[1] || inputPath.replace('.ply', '.spz');

    if (!fs.existsSync(inputPath)) {
        console.error(`Error: File not found: ${inputPath}`);
        process.exit(1);
    }

    await compressSplat(inputPath, outputPath);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
