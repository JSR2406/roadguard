import type { Server } from 'node:http';
import type { GpsRouteMatcher } from '../adapter/gps-route-matcher';
export interface Credential {
  token: string;
  role: 'reader' | 'authority' | 'source';
  sourceId?: string;
  sourceType?: 'dashcam' | 'cctv';
}
export interface RoadguardOptions {
  databasePath?: string;
  credentials: Credential[];
  allowedOrigin?: string;
  now?: () => number;
  staticDir?: string;
  cameraMatcher?: GpsRouteMatcher;
}
export function createRoadguardServer(options: RoadguardOptions): Server & { shutdown(): Promise<void> };
