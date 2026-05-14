declare module 'gyronorm' {
    interface GyroNormOptions {
        frequency?: number
        gravityNormalized?: boolean
        orientationBase?: string
        decimalCount?: number
        screenAdjusted?: boolean
        logger?: any
    }

    interface GyroNormData {
        do: {
            alpha: number
            beta: number
            gamma: number
            absolute: boolean
        }
        dm: {
            x: number
            y: number
            z: number
            gx: number
            gy: number
            gz: number
            alpha: number
            beta: number
            gamma: number
        }
    }

    class GyroNorm {
        static GAME: string
        static WORLD: string
        static DEVICE: string

        constructor()
        init(options?: GyroNormOptions): Promise<void>
        start(callback: (data: GyroNormData) => void): void
        stop(): void
        end(): void
        isAvailable(): boolean
        isRunning(): boolean
    }

    export default GyroNorm
}
