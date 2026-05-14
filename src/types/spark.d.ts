declare module '@sparkjsdev/spark' {
    import * as THREE from 'three';

    export enum SplatFileType {
        PLY = 'ply',
        SPLAT = 'splat',
        KSPLAT = 'ksplat',
        SPZ = 'spz',
    }

    export interface SplatMeshOptions {
        url?: string;
        data?: ArrayBuffer;
        maxSplats?: number;
        fileType?: SplatFileType;
        onLoad?: (mesh: SplatMesh) => void | Promise<void>;
    }

    export class SplatMesh extends THREE.Object3D {
        constructor(options?: SplatMeshOptions);
        dispose(): void;
        loaded: Promise<void>;
        visible: boolean;
        position: THREE.Vector3;
        rotation: THREE.Euler;
        quaternion: THREE.Quaternion;
        scale: THREE.Vector3;
        objectModifier: any;
        updateGenerator(): void;
        updateVersion(): void;
    }

    // Dyno shader system for effects
    export namespace dyno {
        export const Gsplat: any;
        export function dynoFloat(value: number): { value: number };
        export function dynoInt(value: number): any;
        export function dynoBlock(inTypes: any, outTypes: any, fn: any): any;
        export function unindent(s: string): string;
        export function unindentLines(s: string): string;
        export class Dyno {
            constructor(options: {
                inTypes: any;
                outTypes: any;
                globals?: () => string[];
                statements: (args: { inputs: any; outputs: any }) => string;
            });
            apply(args: any): any;
        }
    }
}

