import * as THREE from 'three'

// Standard camera settings for all viewers
export const CAMERA_SETTINGS = {
    position: new THREE.Vector3(0, 0.5, 2),
    up: new THREE.Vector3(0, -1, 0),
    target: new THREE.Vector3(0, 0.5, 10),
}

// Everforest bg-hard color
export const BG_COLOR = 0x272e33

// Mobile performance settings
export const MOBILE_PIXEL_RATIO = 1 // Force 1x on mobile, reduce to 0.75 for older devices
export const MOBILE_ZOOM_SPEED = 0.2 // Slower zoom for touch controls

// Lenticular postcard effect settings
export const LENTICULAR_MAX_ROTATION_DEG = 15 // Max rotation in degrees
export const LENTICULAR_MAX_TRANSLATION = 0.2 // Max translation units

// AR settings
export const AR_INITIAL_DISTANCE = 0.8 // meters in front of user
export const AR_INITIAL_SCALE = 0.8
export const AR_MIN_SCALE = 0.05 // Allow very close zoom
export const AR_MAX_SCALE = 5 // Increased from 3 for closer inspection
