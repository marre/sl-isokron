import type { WalkSource } from './types';

export function walkingMinutes(sources: WalkSource[], bandSeconds: number, maxWalkSeconds: number): Map<number, number> {
  const result = new Map<number, number>();
  for (const source of sources) {
    // Final walking shares the continuous-leg limit with walking already done.
    const minutes = Math.floor(Math.min(bandSeconds - source.seconds, maxWalkSeconds - source.walked) / 60);
    if (minutes > (result.get(source.stop) ?? 0)) result.set(source.stop, Math.min(30, minutes));
  }
  return result;
}

export function distanceText(metres: number | undefined): string {
  if (metres === undefined) return 'avstånd saknas';
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} km`;
}
