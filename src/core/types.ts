export const MODES = ['bus', 'metro', 'rail', 'tram', 'boat'] as const;
export type Mode = typeof MODES[number];
export const MODE_NAMES: Record<Mode, string> = { bus: 'Buss', metro: 'Tunnelbana', rail: 'Pendeltåg', tram: 'Spårvagn / lokalbana', boat: 'SL-båt' };
export interface Stop { id: string; name: string; lat: number; lon: number; station: string; platform: string }
export interface Route { id: string; name: string; mode: Mode }
export interface Connection { from: number; to: number; departure: number; arrival: number; trip: string; route: number; sequence: number; pickup: boolean; dropoff: boolean }
export interface Walk { from: number; to: number; seconds: number; source: string }
export interface TransferRule { from: number; to: number; type: 0 | 1 | 2 | 3; seconds: number; fromTrip?: string; toTrip?: string; fromRoute?: string; toRoute?: string }
export interface Network { stops: Stop[]; routes: Route[]; connections: Connection[]; walks: Walk[]; transfers: TransferRule[] }
export interface Settings { v: 1; stop: string; name: string; lat: number; lon: number; date: string; time: string; maxMinutes: number; walkMinutes: number; modes: Mode[]; maxTransfers: number; windowMinutes: number }
export interface Reach { seconds: number; kind: 'walk' | 'transit'; arrival: number; boardings: number }
export interface SearchResult { values: (Reach | null)[]; labels: number; elapsed: number; complete: true }
export interface FileRef { url: string; sha256: string; bytes: number }
export interface Manifest {
  schema: 1; version: string; demo: boolean; updated: string; validFrom: string; validTo: string;
  walkingMaxMinutes: number; walkingVersion: string; walkingSpeedKmh: number;
  stops: FileRef; walks: FileRef; routes: FileRef; transfers: FileRef;
  trips: FileRef; days: Record<string, FileRef>; warnings: string[]; attribution: string[];
}
