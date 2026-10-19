/** Boundary types for real camera/GPS producers. This module deliberately has no browser,
 * ML, CAN, RTSP, or WebRTC dependencies. Producers only supply already-decoded metadata. */
export interface CameraSourceAdapter {
  readonly sourceId: string;
  readonly sourceType: 'dashcam' | 'cctv';
  observations(signal?: AbortSignal): AsyncIterable<string>;
}

export interface ReplayOptions {
  sourceId: string;
  sourceType?: 'dashcam' | 'cctv';
  maxBuffered?: number;
}

/** Deterministic newline replay. The input is metadata JSON, never image bytes or a model. */
export class SimulatedReplayAdapter implements CameraSourceAdapter {
  readonly sourceType: 'dashcam' | 'cctv';
  private readonly lines: string[];
  private readonly maxBuffered: number;
  constructor(public readonly sourceId: string, input: string | Iterable<string>, options: Omit<ReplayOptions, 'sourceId'> = {}) {
    this.sourceType = options.sourceType ?? 'dashcam';
    this.maxBuffered = options.maxBuffered ?? 32;
    if (!Number.isInteger(this.maxBuffered) || this.maxBuffered < 1) throw new RangeError('maxBuffered must be positive');
    this.lines = typeof input === 'string' ? input.split(/\r?\n/).filter(Boolean) : [...input];
    if (this.lines.length > this.maxBuffered) throw new Error('Replay backpressure limit exceeded');
  }
  async *observations(signal?: AbortSignal): AsyncIterable<string> {
    for (const line of this.lines) {
      if (signal?.aborted) return;
      yield line;
      await Promise.resolve();
    }
  }
}
