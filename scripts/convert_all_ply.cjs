const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SPLATS_DIR = path.join(__dirname, '..', 'public', 'splats');

console.log('🔍 Finding PLY files...');

const files = fs.readdirSync(SPLATS_DIR)
    .filter(f => f.toLowerCase().endsWith('.ply'))
    .sort();

if (files.length === 0) {
    console.log('✅ No PLY files to convert');
    process.exit(0);
}

console.log(`📦 Found ${files.length} PLY files to convert\n`);

let converted = 0;
let skipped = 0;

for (const file of files) {
    const inputPath = path.join(SPLATS_DIR, file);
    const outputName = path.basename(file, '.ply') + '.splat';
    const outputPath = path.join(SPLATS_DIR, outputName);

    // Skip if already converted
    if (fs.existsSync(outputPath)) {
        console.log(`⏭️  Skipped (already exists): ${outputName}`);
        skipped++;
        continue;
    }

    console.log(`🔄 Converting: ${file}`);
    try {
        execSync(`node scripts/convert_ply_to_splat.cjs "${inputPath}" "${outputPath}"`, {
            cwd: __dirname + '/..',
            stdio: 'ignore'
        });
        converted++;
        console.log(`✅ Done: ${outputName}`);
    } catch (err) {
        console.error(`❌ Error: ${file}`);
        console.error(err.message);
    }
}

console.log(`\n📊 Summary: ${converted} converted, ${skipped} skipped`);
console.log('\n🔧 Regenerating manifest...');

try {
    execSync('node scripts/generate_manifest.cjs', {
        cwd: __dirname + '/..',
        stdio: 'inherit'
    });
    console.log('✅ Complete! Refresh your browser to see the new splats.');
} catch (err) {
    console.error('❌ Error regenerating manifest:', err.message);
    process.exit(1);
}
