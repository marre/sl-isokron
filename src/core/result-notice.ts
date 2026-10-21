import type { SearchResult, Settings, Stop } from './types';

/** A walking-only island is a data gap, not evidence that no one can leave. */
export function walkingExitGap(result: SearchResult, settings: Settings, stops: Stop[]): boolean {
  return settings.walkMinutes > 0 && settings.modes.length > 0 &&
    result.values.some(Boolean) &&
    !result.values.some(value => value && value.boardings > 0) &&
    !result.values.some((value, index) => value && stops[index].walkingArea);
}
