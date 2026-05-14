
// Utility to convert PLY buffer to Splat buffer (approximate for antimatter15 format)
// Format based on standard .splat: 
// Position (3 floats) + Scale (3 floats) + Color (4 bytes) + Rotation (4 bytes)

export async function loadPlyAsSplatUrl(url: string): Promise<string> {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return convertPlyToSplat(buffer);
}

function convertPlyToSplat(plyBuffer: ArrayBuffer): string {
    const headerEnd = findHeaderEnd(plyBuffer);
    const headerText = new TextDecoder().decode(plyBuffer.slice(0, headerEnd));
    const header = parsePlyHeader(headerText);

    if (!header.vertexCount) throw new Error('Invalid PLY: No vertices found');

    const dataView = new DataView(plyBuffer, headerEnd);
    const rowSize = header.rowSize;
    const vertexCount = header.vertexCount;

    // Output buffer: 32 bytes per splat
    // 3 floats (pos) + 3 floats (scale) + 4 bytes (color) + 4 bytes (rot)
    const splatBuffer = new ArrayBuffer(vertexCount * 32);
    const splatView = new DataView(splatBuffer);

    let offset = 0;
    for (let i = 0; i < vertexCount; i++) {
        const plyOffset = i * rowSize;

        // --- Position ---
        const x = dataView.getFloat32(plyOffset + header.offsets.x, true);
        const y = dataView.getFloat32(plyOffset + header.offsets.y, true);
        const z = dataView.getFloat32(plyOffset + header.offsets.z, true);

        splatView.setFloat32(offset + 0, x, true);
        splatView.setFloat32(offset + 4, y, true);
        splatView.setFloat32(offset + 8, z, true);

        // --- Scale ---
        const sx = Math.exp(dataView.getFloat32(plyOffset + header.offsets.scale_0, true));
        const sy = Math.exp(dataView.getFloat32(plyOffset + header.offsets.scale_1, true));
        const sz = Math.exp(dataView.getFloat32(plyOffset + header.offsets.scale_2, true));

        splatView.setFloat32(offset + 12, sx, true);
        splatView.setFloat32(offset + 16, sy, true);
        splatView.setFloat32(offset + 20, sz, true);

        // --- Color ---
        // SH Coeffs (f_dc) are usually 0.5 + 0.28209 * coeff
        // We take f_dc_0, f_dc_1, f_dc_2
        // If property is 'red', 'green', 'blue' (uchar), read directly.
        // Assuming standard gaussian splat PLY with 'f_dc' floats:

        let r, g, b;
        if (header.types.f_dc_0 === 'float') {
            const r_sh = dataView.getFloat32(plyOffset + header.offsets.f_dc_0, true);
            const g_sh = dataView.getFloat32(plyOffset + header.offsets.f_dc_1, true);
            const b_sh = dataView.getFloat32(plyOffset + header.offsets.f_dc_2, true);

            // Simple SH0 conversion
            r = Math.max(0, Math.min(255, (0.5 + 0.28209479177387814 * r_sh) * 255));
            g = Math.max(0, Math.min(255, (0.5 + 0.28209479177387814 * g_sh) * 255));
            b = Math.max(0, Math.min(255, (0.5 + 0.28209479177387814 * b_sh) * 255));
        } else {
            // Fallback if uchar
            r = 255; g = 255; b = 255; // Implement if needed
        }

        // --- Opacity ---
        // sigmoid(opacity) -> usually stored as 'opacity' (float, logit space)
        const opacityLogit = dataView.getFloat32(plyOffset + header.offsets.opacity, true);
        const opacity = 1 / (1 + Math.exp(-opacityLogit));
        const a = Math.max(0, Math.min(255, opacity * 255));

        splatView.setUint8(offset + 24, r);
        splatView.setUint8(offset + 25, g);
        splatView.setUint8(offset + 26, b);
        splatView.setUint8(offset + 27, a);

        // --- Rotation ---
        // Quaternion (rot_0 = w, rot_1 = x, ...)
        // .splat usually expects 128 + val * 128 (byte normalized)
        const rot0 = dataView.getFloat32(plyOffset + header.offsets.rot_0, true);
        const rot1 = dataView.getFloat32(plyOffset + header.offsets.rot_1, true);
        const rot2 = dataView.getFloat32(plyOffset + header.offsets.rot_2, true);
        const rot3 = dataView.getFloat32(plyOffset + header.offsets.rot_3, true);

        // Normalize
        const qLen = Math.sqrt(rot0 * rot0 + rot1 * rot1 + rot2 * rot2 + rot3 * rot3);
        const w = (rot0 / qLen) * 127 + 128; // Bias for uint8
        const qx = (rot1 / qLen) * 127 + 128;
        const qy = (rot2 / qLen) * 127 + 128;
        const qz = (rot3 / qLen) * 127 + 128;

        splatView.setUint8(offset + 28, w);
        splatView.setUint8(offset + 29, qx);
        splatView.setUint8(offset + 30, qy);
        splatView.setUint8(offset + 31, qz);

        offset += 32;
    }

    const blob = new Blob([splatBuffer], { type: 'application/octet-stream' });
    return URL.createObjectURL(blob);
}

function findHeaderEnd(buffer: ArrayBuffer) {
    const view = new Uint8Array(buffer);
    for (let i = 0; i < view.length - 10; i++) {
        if (view[i] === 10 && // \n
            view[i + 1] === 101 && // e
            view[i + 2] === 110 && // n
            view[i + 3] === 100 && // d
            view[i + 4] === 95 &&  // _
            view[i + 5] === 104 && // h
            view[i + 6] === 101 && // e
            view[i + 7] === 97 &&  // a
            view[i + 8] === 100 && // d
            view[i + 9] === 101 && // e
            view[i + 10] === 114) { // r

            // Find newline after end_header
            let j = i + 11;
            while (j < view.length && view[j] !== 10) j++;
            return j + 1;
        }
    }
    throw new Error('Header end not found');
}

function parsePlyHeader(headerText: string) {
    const lines = headerText.split('\n');
    let vertexCount = 0;
    // let rowSize = 0; // Unused in this function scope
    const offsets: any = {};
    const types: any = {};

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
