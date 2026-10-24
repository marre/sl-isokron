The application now uses MapLibre GL JS. The production contour acceptance
harness (`delivery-lab/production.ts`) and stage-profiling harness
(`profiling/harness.ts`) use the current renderer. Their input zoom values retain
the historical 256-pixel tile convention and are converted at the boundary.

Historical comparison prototypes and reports in these directories describe the
Leaflet implementation. In particular, `delivery-lab/harness.ts` imports generated
experimental Leaflet views, and the older full-app profiling scripts refer to
controls that have since been removed. Reproduce those comparisons at commit
`7d64b30` with that commit's dependencies and data preparation instructions. They
are not imported by the current application or scanned by its Vite entry build.
Pixel hashes from old viewport/renderer reports should not be treated as current
MapLibre screenshot references. The browser regression suite verifies worker
pixels and their actual WebGL texture rendering separately.
