# Dense stop rendering

Update: numbered overview groups have since been removed from the UI. Worker
clustering still suppresses dense stops until zooming in; sparse individual stops
can remain visible. The measurements below describe the original optimization.

The renderer created 11,615 invisible keyboard buttons and their listeners.
Changing one stop's hover emphasis scheduled a complete GeoJSON rebuild and
worker reindex. Zoomed-out views also drew every overlapping platform circle.

The fix separates persistent geometry from transient emphasis. Stable stop IDs
and MapLibre feature state update a highlight without rebuilding the source.
Reachability/colour changes remain batched source updates, with old highlight
state cleared. Keyboard controls are created only for the current view (at most
128) and released when they leave it; event listeners are delegated.

When at least 500 stops are in the displayed result, MapLibre's worker clusters
nearby stops through zoom 10. Dark numbered groups show counts, not travel times;
tapping or keyboard-activating one zooms to its contents without moving the
origin or starting a search. At street zoom the original individual stop colours
return. Count labels are locally generated GPU sprite images, without another
font/endpoint request. Walking contours and all routing nodes/results are kept.

## Isolated comparison

Real SL positions/service index, 11,615 served stops. Single sequential samples,
mobile/desktop viewport emulation in Chromium with software WebGL, blank basemap.
These are not physical-phone FPS measurements. The hover workload highlights
and restores twelve stops; the pan includes a 500 ms animation. No routing or
walking-overlay calculation is included.

| Measurement | Mobile before → after | Desktop before → after |
| --- | --- | --- |
| Overview keyboard nodes | 11,615 → 12 | 11,615 → 39 |
| Full source rebuilds for 12 highlight/reset pairs | 24 → 0 | 24 → 0 |
| Highlight workload, wall time | 8,796 → 385 ms | 10,696 → 1,243 ms |
| Pan scripting time | 166 → 29 ms | 193 → 28 ms |
| Pan wall time, including animation | 654 → 519 ms | 762 → 505 ms |
| First overview, wall time | 400 → 678 ms | 702 → 812 ms |
| Applying changed result visibility/colours | 459 → 487 ms | 574 → 693 ms |

Clustering and count sprites add initial setup work. The measured benefit is
repeated interaction and much less DOM/style/layout work, not a universal
speedup for every phase. Measurements vary with hardware, browser load and map
extent. The raw report also includes the second pan/highlight after a synthetic
result update: [stop-rendering-results.json](stop-rendering-results.json).
Reproduce using [the benchmark instructions](../experiments/stop-rendering/README.md).

Browser checks verify the DOM bound, rendered group labels, source identity,
zero rebuilds for highlighting, removal of stale hover state after bulk updates,
individual-stop rendering at high zoom, and group activation without a new search.
The existing route, arbitrary-origin, walking-overlay and mobile tests also pass.
