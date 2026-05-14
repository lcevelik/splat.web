const fs = require('fs');
const path = require('path');

const SPLATS_DIR = path.join(__dirname, '..', 'public', 'splats');
const INPUT_FILE = process.argv[2] || path.join(SPLATS_DIR, 'Canyons - 2.ply');
const OUTPUT_FILE = process.argv[3] || path.join(SPLATS_DIR, 'Canyons - 2.splat');

console.log(`📖 Reading PLY file: ${INPUT_FILE}`);
console.log(`📝 Output will be saved to: ${OUTPUT_FILE}`);

try {
    // Read the PLY file
    const buffer = fs.readFileSync(INPUT_FILE);
    const uint8Array = new Uint8Array(buffer);

    // Find header end
    console.log('🔍 Parsing PLY header...');
    let headerEnd = -1;
    for (let i = 0; i < uint8Array.length - 10; i++) {
        if (
            uint8Array[i] === 10 && // \n
            uint8Array[i + 1] === 101 && // e
            uint8Array[i + 2] === 110 && // n
            uint8Array[i + 3] === 100 && // d
            uint8Array[i + 4] === 95 && // _
            uint8Array[i + 5] === 104 && // h
            uint8Array[i + 6] === 101 && // e
            uint8Array[i + 7] === 97 && // a
            uint8Array[i + 8] === 100 && // d
            uint8Array[i + 9] === 101 && // e
            uint8Array[i + 10] === 114 // r
        ) {
            let j = i + 11;
            while (j < uint8Array.length && uint8Array[j] !== 10) j++;
            headerEnd = j + 1;
            break;
        }
    }

    if (headerEnd === -1) throw new Error('Header end not found');

    const headerText = buffer.toString('utf8', 0, headerEnd);
    const header = parseHeader(headerText);

    console.log(`✅ Header parsed: ${header.vertexCount} vertices, row size: ${header.rowSize} bytes`);

    // Convert PLY to splat format
    console.log('⚙️  Converting to splat format...');
    const vertexCount = header.vertexCount;
    const splatBuffer = Buffer.alloc(vertexCount * 32);
    const dataView = new DataView(buffer.buffer, buffer.byteOffset + headerEnd, buffer.length - headerEnd);

    let offset = 0;
    const logInterval = Math.max(1, Math.floor(vertexCount / 10));

    for (let i = 0; i < vertexCount; i++) {
        if (i % logInterval === 0) {
            process.stdout.write(`\r  ${Math.round((i / vertexCount) * 100)}%`);
        }

        const plyOffset = i * header.rowSize;

        // Position
        const x = dataView.getFloat32(plyOffset + header.offsets.x, true);
        const y = dataView.getFloat32(plyOffset + header.offsets.y, true);
        const z = dataView.getFloat32(plyOffset + header.offsets.z, true);

        splatBuffer.writeFloatLE(x, offset + 0);
        splatBuffer.writeFloatLE(y, offset + 4);
        splatBuffer.writeFloatLE(z, offset + 8);

        // Scale
        const sx = Math.exp(dataView.getFloat32(plyOffset + header.offsets.scale_0, true));
        const sy = Math.exp(dataView.getFloat32(plyOffset + header.offsets.scale_1, true));
        const sz = Math.exp(dataView.getFloat32(plyOffset + header.offsets.scale_2, true));

        splatBuffer.writeFloatLE(sx, offset + 12);
        splatBuffer.writeFloatLE(sy, offset + 16);
        splatBuffer.writeFloatLE(sz, offset + 20);

        // Color
        let r, g, b;
        if (header.types.f_dc_0 === 'float') {
            const r_sh = dataView.getFloat32(plyOffset + header.offsets.f_dc_0, true);
            const g_sh = dataView.getFloat32(plyOffset + header.offsets.f_dc_1, true);
            const b_sh = dataView.getFloat32(plyOffset + header.offsets.f_dc_2, true);

            r = Math.max(0, Math.min(255, (0.5 + 0.28209479177387814 * r_sh) * 255));
            g = Math.max(0, Math.min(255, (0.5 + 0.28209479177387814 * g_sh) * 255));
            b = Math.max(0, Math.min(255, (0.5 + 0.28209479177387814 * b_sh) * 255));
        } else {
            r = 255; g = 255; b = 255;
        }

        // Opacity
        const opacityLogit = dataView.getFloat32(plyOffset + header.offsets.opacity, true);
        const opacity = 1 / (1 + Math.exp(-opacityLogit));
        const a = Math.max(0, Math.min(255, opacity * 255));

        splatBuffer.writeUInt8(Math.round(r), offset + 24);
        splatBuffer.writeUInt8(Math.round(g), offset + 25);
        splatBuffer.writeUInt8(Math.round(b), offset + 26);
        splatBuffer.writeUInt8(Math.round(a), offset + 27);

        // Rotation
        const rot0 = dataView.getFloat32(plyOffset + header.offsets.rot_0, true);
        const rot1 = dataView.getFloat32(plyOffset + header.offsets.rot_1, true);
        const rot2 = dataView.getFloat32(plyOffset + header.offsets.rot_2, true);
        const rot3 = dataView.getFloat32(plyOffset + header.offsets.rot_3, true);

        const qLen = Math.sqrt(rot0 * rot0 + rot1 * rot1 + rot2 * rot2 + rot3 * rot3);
        const w = Math.round((rot0 / qLen) * 127 + 128);
        const qx = Math.round((rot1 / qLen) * 127 + 128);
        const qy = Math.round((rot2 / qLen) * 127 + 128);
        const qz = Math.round((rot3 / qLen) * 127 + 128);

        splatBuffer.writeUInt8(w, offset + 28);
        splatBuffer.writeUInt8(qx, offset + 29);
        splatBuffer.writeUInt8(qy, offset + 30);
        splatBuffer.writeUInt8(qz, offset + 31);

        offset += 32;
    }

    console.log('\r✅ Conversion complete!');

    // Write output file
    console.log(`💾 Writing splat file...`);
    fs.writeFileSync(OUTPUT_FILE, splatBuffer);
    const sizeMB = (splatBuffer.length / (1024 * 1024)).toFixed(2);
    console.log(`✅ Saved to ${OUTPUT_FILE} (${sizeMB} MB)`);

} catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
}

function parseHeader(headerText) {
    const lines = headerText.split('\n');
    let vertexCount = 0;
    const offsets = {};
    const types = {};
    let currentElement = '';
    let currentOffset = 0;

    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] === 'element') {
            currentElement = parts[1];
            if (currentElement === 'vertex') {
                vertexCount = parseInt(parts[2]);
            }
        }
        if (parts[0] === 'property') {
            if (currentElement !== 'vertex') continue;

            const type = parts[1];
            const name = parts[2];

            offsets[name] = currentOffset;
            types[name] = type;

            if (type === 'float') currentOffset += 4;
            else if (type === 'double') currentOffset += 8;
            else if (type === 'uchar') currentOffset += 1;
        }
    }

    return { vertexCount, rowSize: currentOffset, offsets, types };
}
