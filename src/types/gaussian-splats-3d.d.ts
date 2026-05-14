declare module '@mkkellogg/gaussian-splats-3d' {
    export class Viewer {
        constructor(options?: {
            cameraUp?: [number, number, number];
            initialCameraPosition?: [number, number, number];
            initialCameraLookAt?: [number, number, number];
            rootElement?: HTMLElement;
            sharedMemoryForWorkers?: boolean;
            webXRMode?: number;  // 0 = None, 1 = VR, 2 = AR
            integerBasedSort?: boolean;
            splatSortDistanceMapPrecision?: number;
        });

        addSplatScene(url: string, options?: {
            splatAlphaRemovalThreshold?: number;
            showLoadingUI?: boolean;
            progressiveLoad?: boolean;
            format?: number;  // 0 = Ply, 1 = Splat, 2 = Ksplat
        }): Promise<void>;

        start(): void;
        dispose(): void;

        camera?: {
            position: { x: number; y: number; z: number };
        };
        controls?: {
            target: { x: number; y: number; z: number };
        };
    }

    export class PlyLoader {
        static loadFromURL(
            url: string,
            onProgress?: (progress: number) => void,
            progressiveLoad?: boolean,
            onProgressiveLoadSectionProgress?: (progress: number) => void,
            minimumAlpha?: number,
            compressionLevel?: number,  // 0, 1, or 2
            optimizeSplatData?: boolean,
            sphericalHarmonicsDegree?: number,
            headers?: Record<string, string>
        ): Promise<SplatBuffer>;
    }

    export class KSplatLoader {
        static downloadFile(splatBuffer: SplatBuffer, filename: string): void;
    }

    export interface SplatBuffer {
        // Splat buffer data
    }

    export const SceneFormat: {
        Ply: number;
        Splat: number;
        KSplat: number;
    };
}

