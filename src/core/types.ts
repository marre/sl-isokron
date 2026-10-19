export const MODES = ['bus', 'metro', 'rail', 'tram', 'boat'] as const;
export type Mode = typeof MODES[number];
export const MODE_NAMES: Record<Mode, string> = { bus: 'Buss', metro: 'Tunnelbana', rail: 'Pendeltåg', tram: 'Spårvagn / lokalbana', boat: 'Båt' };
export interface Stop { id: string; name: string; lat: number; lon: number; station: string; platform: string; walking?: 'available' | 'missing' }
export interface Route { id: string; name: string; mode: Mode }
export interface Connection { from: number; to: number; departure: number; arrival: number; trip: string; route: number; sequence: number; pickup: boolean; dropoff: boolean; pickupRequest?: boolean; dropoffRequest?: boolean }
export interface Walk { from: number; to: number; seconds: number; source: string }
export interface TransferRule { from: number; to: number; type: 0 | 1 | 2 | 3; seconds: number; fromTrip?: string; toTrip?: string; fromRoute?: string; toRoute?: string }
export interface Network { stops: Stop[]; routes: Route[]; connections: Connection[]; walks: Walk[]; transfers: TransferRule[] }
export interface Settings { v: 1; stop: string; name: string; lat: number; lon: number; date: string; time: string; maxMinutes: number; walkMinutes: number; modes: Mode[]; maxTransfers: number; windowMinutes: number }
export interface JourneyLeg { kind: 'walk' | 'transit'; from: number; to: number; departure: number; arrival: number; stops: number[]; route?: number; requestStop?: boolean }
export interface JourneyNode extends JourneyLeg { previous: number | null }
export interface Reach { seconds: number; kind: 'walk' | 'transit'; arrival: number; boardings: number; requestStop?: boolean; journey: number | null }
export interface SearchResult { values: (Reach | null)[]; journeys: JourneyNode[]; routes: Route[]; labels: number; elapsed: number; complete: true }
export interface FileRef { url: string; sha256: string; bytes: number }
export interface Manifest {
  sourceVersion?: string; sourceUpdated?: string | null;
  schema: 2; version: string; demo: boolean; updated: string; validFrom: string; validTo: string;
  walkingMaxMinutes: number; walkingVersion: string; walkingSpeedKmh: number;
  walkingCoverage?: { totalStops: number; boundStops: number; pairs: number; reviewed: boolean };
  stops: FileRef; walks: FileRef; routes: FileRef; transfers: FileRef;
  trips: FileRef; days: Record<string, (FileRef & { from: number; until: number })[]>; warnings: string[]; attribution: string[];
}
