#!/usr/bin/env python3
"""
Proper Gaussian Splat renderer for thumbnail generation.
Renders actual 2D Gaussian ellipses, not just points.
"""

import numpy as np
from PIL import Image
from plyfile import PlyData
from pathlib import Path

# Configuration
SPLATS_DIR = Path(__file__).parent.parent / "public" / "splats"
THUMBS_DIR_PUBLIC = Path(__file__).parent.parent / "public" / "thumbnails" 
THUMBS_DIR_DIST = Path(__file__).parent.parent / "dist" / "thumbnails"
WIDTH, HEIGHT = 1920, 1080
MAX_SPLATS = 200000  # More splats for higher quality (was 50k)

# Camera based on splat coordinate analysis:
# Splat bounds: X(-7 to 8), Y(-33 to 3, mean -1.17), Z(2.54 to 90, mean 10.85)
# Camera moved forward (z=2) to be closer to splats, narrower FOV for tighter framing
CAMERA_POS = np.array([0.0, 0.5, 2.0])  # Shifted down
CAMERA_LOOKAT = np.array([0.0, 0.5, 10.0])  # Matching Y for straight-ahead but lower view
CAMERA_UP = np.array([0.0, -1.0, 0.0])
FOV = 50  # Narrower FOV for more zoom
NEAR, FAR = 0.1, 100.0


def quat_to_rotation_matrix(q):
    """Convert quaternion [w, x, y, z] to 3x3 rotation matrix (vectorized)."""
    w, x, y, z = q[:, 0], q[:, 1], q[:, 2], q[:, 3]
    
    R = np.zeros((len(q), 3, 3))
    R[:, 0, 0] = 1 - 2*(y*y + z*z)
    R[:, 0, 1] = 2*(x*y - w*z)
    R[:, 0, 2] = 2*(x*z + w*y)
    R[:, 1, 0] = 2*(x*y + w*z)
    R[:, 1, 1] = 1 - 2*(x*x + z*z)
    R[:, 1, 2] = 2*(y*z - w*x)
    R[:, 2, 0] = 2*(x*z - w*y)
    R[:, 2, 1] = 2*(y*z + w*x)
    R[:, 2, 2] = 1 - 2*(x*x + y*y)
    return R


def load_gaussian_splats(filepath, max_splats=MAX_SPLATS):
    """Load Gaussian splat data from PLY file."""
    plydata = PlyData.read(filepath)
    v = plydata['vertex']
    n = len(v['x'])
    
    # Sample by opacity if too many
    try:
        opacity = 1 / (1 + np.exp(-np.array(v['opacity'])))
    except ValueError:
        opacity = np.ones(n)
    
    if n > max_splats:
        idx = np.argsort(-opacity)[:max_splats]
    else:
        idx = np.arange(n)
    
    # Positions
    positions = np.stack([np.array(v['x'])[idx], np.array(v['y'])[idx], np.array(v['z'])[idx]], axis=-1)
    
    # Scales (log scale in PLY)
    try:
        scales = np.exp(np.stack([
            np.array(v['scale_0'])[idx],
            np.array(v['scale_1'])[idx],
            np.array(v['scale_2'])[idx]
        ], axis=-1))
    except ValueError:
        scales = np.ones((len(idx), 3)) * 0.01
    
    # Rotation quaternions [w, x, y, z] - need to normalize
    try:
        quats = np.stack([
            np.array(v['rot_0'])[idx],
            np.array(v['rot_1'])[idx],
            np.array(v['rot_2'])[idx],
            np.array(v['rot_3'])[idx]
        ], axis=-1)
        quats = quats / (np.linalg.norm(quats, axis=1, keepdims=True) + 1e-8)
    except ValueError:
        quats = np.tile([1, 0, 0, 0], (len(idx), 1))
    
    # Colors from spherical harmonics DC component
    C0 = 0.28209479177387814
    try:
        colors = np.stack([
            np.clip(0.5 + np.array(v['f_dc_0'])[idx] * C0, 0, 1),
            np.clip(0.5 + np.array(v['f_dc_1'])[idx] * C0, 0, 1),
            np.clip(0.5 + np.array(v['f_dc_2'])[idx] * C0, 0, 1)
        ], axis=-1)
    except ValueError:
        colors = np.ones((len(idx), 3)) * 0.5
    
    return positions, scales, quats, colors, opacity[idx], n


def compute_cov3d(scales, quats):
    """Compute 3D covariance matrices from scales and rotations."""
    R = quat_to_rotation_matrix(quats)  # (N, 3, 3)
    S = np.zeros((len(scales), 3, 3))
    S[:, 0, 0] = scales[:, 0]
    S[:, 1, 1] = scales[:, 1]
    S[:, 2, 2] = scales[:, 2]
    
    # Cov3D = R @ S @ S @ R.T
    RS = np.einsum('nij,njk->nik', R, S)
    cov3d = np.einsum('nij,nkj->nik', RS, RS)
    return cov3d


def project_gaussians(positions, cov3d, colors, opacity, cam_pos, cam_lookat, cam_up, fov, width, height):
    """Project 3D Gaussians to 2D screen ellipses."""
    # Camera basis
    forward = cam_lookat - cam_pos
    forward = forward / np.linalg.norm(forward)
    right = np.cross(forward, cam_up)
    right = right / np.linalg.norm(right)
    up = np.cross(right, forward)
    
    # View matrix (world to camera)
    view = np.array([right, up, -forward])  # 3x3
    
    # Transform positions to camera space
    pos_cam = (positions - cam_pos) @ view.T
    
    # Filter points behind camera
    mask = pos_cam[:, 2] < -NEAR
    pos_cam = pos_cam[mask]
    cov3d = cov3d[mask]
    colors_f = colors[mask]
    opacity_f = opacity[mask]
    
    if len(pos_cam) == 0:
        return None
    
    # Perspective projection parameters
    aspect = width / height
    tan_fov = np.tan(np.radians(fov) / 2)
    focal = height / (2 * tan_fov)
    
    z = -pos_cam[:, 2]
    
    # Project center to screen
    x_ndc = pos_cam[:, 0] / (z * tan_fov * aspect)
    y_ndc = pos_cam[:, 1] / (z * tan_fov)
    x_screen = (x_ndc + 1) / 2 * width
    y_screen = (1 - y_ndc) / 2 * height
    
    # Transform 3D covariance to camera space: Cov_cam = V @ Cov_world @ V.T
    cov_cam = np.einsum('ij,njk,lk->nil', view, cov3d, view)
    
    # Project to 2D using Jacobian of perspective projection
    J = np.zeros((len(pos_cam), 2, 3))
    J[:, 0, 0] = focal / z
    J[:, 0, 2] = -focal * pos_cam[:, 0] / (z * z)
    J[:, 1, 1] = focal / z
    J[:, 1, 2] = -focal * pos_cam[:, 1] / (z * z)
    
    # 2D covariance: Cov2D = J @ Cov_cam @ J.T
    cov2d = np.einsum('nij,njk,nlk->nil', J, cov_cam, J)
    
    # Add small regularization
    cov2d[:, 0, 0] += 0.3
    cov2d[:, 1, 1] += 0.3
    
    # Sort by depth (back to front)
    sort_idx = np.argsort(-z)
    
    return {
        'x': x_screen[sort_idx],
        'y': y_screen[sort_idx],
        'cov2d': cov2d[sort_idx],
        'colors': colors_f[sort_idx],
        'opacity': opacity_f[sort_idx],
        'depth': z[sort_idx]
    }


def render_gaussians(proj, width, height):
    """Render projected 2D Gaussians to image."""
    image = np.zeros((height, width, 4), dtype=np.float32)  # RGBA accumulator
    
    n_splats = len(proj['x'])
    
    for i in range(n_splats):
        x, y = proj['x'][i], proj['y'][i]
        cov = proj['cov2d'][i]
        color = proj['colors'][i]
        alpha = proj['opacity'][i]
        
        if x < -100 or x > width + 100 or y < -100 or y > height + 100:
            continue
        
        try:
            det = cov[0, 0] * cov[1, 1] - cov[0, 1] * cov[1, 0]
            if det <= 0:
                continue
            
            trace = cov[0, 0] + cov[1, 1]
            eigenval_max = 0.5 * (trace + np.sqrt(max(0.1, trace*trace - 4*det)))
            radius = 3 * np.sqrt(eigenval_max)
            radius = min(radius, 50)
            
            if radius < 0.5:
                continue
                
            inv_det = 1 / det
            cov_inv = np.array([
                [cov[1, 1] * inv_det, -cov[0, 1] * inv_det],
                [-cov[1, 0] * inv_det, cov[0, 0] * inv_det]
            ])
            
            x_min = max(0, int(x - radius))
            x_max = min(width, int(x + radius + 1))
            y_min = max(0, int(y - radius))
            y_max = min(height, int(y + radius + 1))
            
            if x_max <= x_min or y_max <= y_min:
                continue
            
            yy, xx = np.mgrid[y_min:y_max, x_min:x_max]
            dx = xx - x
            dy = yy - y
            
            exponent = -0.5 * (
                cov_inv[0, 0] * dx * dx +
                (cov_inv[0, 1] + cov_inv[1, 0]) * dx * dy +
                cov_inv[1, 1] * dy * dy
            )
            gaussian = np.exp(np.clip(exponent, -20, 0))
            
            splat_alpha = alpha * gaussian
            
            for c in range(3):
                image[y_min:y_max, x_min:x_max, c] += splat_alpha * color[c]
            image[y_min:y_max, x_min:x_max, 3] += splat_alpha
            
        except Exception:
            continue
    
    # Normalize by accumulated alpha
    mask = image[:, :, 3] > 0
    for c in range(3):
        image[:, :, c] = np.where(mask, image[:, :, c] / (image[:, :, 3] + 1e-8), 0.05)
    
    # Gamma correction and convert to uint8
    image_rgb = np.clip(image[:, :, :3], 0, 1)
    image_rgb = (image_rgb ** 0.8 * 255).astype(np.uint8)
    
    return image_rgb


def main():
    print("🎨 Gaussian Splat Thumbnail Generator")
    THUMBS_DIR_PUBLIC.mkdir(parents=True, exist_ok=True)
    THUMBS_DIR_DIST.mkdir(parents=True, exist_ok=True)
    
    ply_files = list(SPLATS_DIR.glob("*.ply"))
    print(f"Found {len(ply_files)} PLY files")
    
    for ply_file in ply_files:
        thumb_name = ply_file.stem + ".jpg"
        thumb_pub = THUMBS_DIR_PUBLIC / thumb_name
        thumb_dist = THUMBS_DIR_DIST / thumb_name
        
        if thumb_pub.exists():
            # print(f"  {ply_file.name}... Skip (exists)")
            continue

        print(f"  {ply_file.name}...", end=" ", flush=True)
        
        try:
            # Load Gaussian splats
            positions, scales, quats, colors, opacity, total = load_gaussian_splats(ply_file)
            print(f"({total:,} → {len(positions):,})", end=" ", flush=True)
            
            # Compute 3D covariances
            cov3d = compute_cov3d(scales, quats)
            
            # Project to 2D
            proj = project_gaussians(
                positions, cov3d, colors, opacity,
                CAMERA_POS, CAMERA_LOOKAT, CAMERA_UP,
                FOV, WIDTH, HEIGHT
            )
            
            if proj is None:
                print("✗ No visible splats")
                continue
            
            print(f"(visible: {len(proj['x']):,})", end=" ", flush=True)
            
            # Render
            img_array = render_gaussians(proj, WIDTH, HEIGHT)
            img = Image.fromarray(img_array)
            img.save(thumb_pub, quality=90)
            img.save(thumb_dist, quality=90)
            print("✓")
            
        except Exception as e:
            print(f"✗ {e}")
            import traceback
            traceback.print_exc()
    
    print("Done!")


if __name__ == "__main__":
    main()
