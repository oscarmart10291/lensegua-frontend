declare module "@mediapipe/drawing_utils" {
  export function drawConnectors(ctx: CanvasRenderingContext2D, landmarks: any, connections: any, style?: any): void;
  export function drawLandmarks(ctx: CanvasRenderingContext2D, landmarks: any, style?: any): void;
}

declare module "@mediapipe/hands" {
  export const HAND_CONNECTIONS: any;

  export type Results = any;

  export class Hands {
    constructor(opts?: any);
    setOptions(opts: any): void;
    onResults(cb: (results: Results) => void): void;
    send(input: { image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap }): Promise<void>;
    close(): void;
  }
}
