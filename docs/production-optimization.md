# Route scanning and lossless delivery

The production router now uses the route-pattern scanner evaluated in the
[algorithm lab](algorithm-lab.md). It completes walking closure per boarding round,
then scans marked route patterns with one onboard state per trip. Keeping trips
separate supports overtaking and different pickup/dropoff restrictions. Exact
label frontiers preserve departure-window anchors, continuous walking budgets,
scoped GTFS transfer constraints and final walking allowances. A tied displayed
cost and arrival prefers fewer boardings. The memory ceiling still fails explicitly.

The previous engine is frozen in `experiments/routing-lab/reference.ts` for
independent comparisons. Default tests compare the production scanner against it
on 150 seeded networks, in addition to the existing routing/oracle fixtures.
Progress batches remain provisional until completion; changing settings or cancelling
terminates the worker. Routing remains entirely client side.

Walking contours now use [lossless binary delivery](data.md#lossless-delivery-contours-sliso-contours-v1).
The dedicated map worker owns downloading, SHA-256 verification, decoding and
viewport-scoped retention. The main thread retains file IDs, budgets and the
painted canvas. Standard bands are composed incrementally, partial cutoffs use a
bounded cache, and panning cancels obsolete downloads. Existing JSON manifests
remain supported. The native OSM generation cache stays unchanged.

No hexagonal raster approximation, route server, priority walking queue or
additional path-access assumptions are introduced by this change. Published lab
timings are the pre-integration comparison; production smoke measurements and
full-dataset conversion totals are recorded separately when deploying.

## Integration measurements

On dataset `sl-68186fa6a6b514ac3e25`, the promoted scanner matched all stop
seconds/arrivals and canonical walking frontiers against saved pre-scanner outputs:
Arlanda 7,026 reachable positions, Vallentuna 9,884, Skärvik 8,294. One Node run
measured 4.58 / 36.63 / 22.29 seconds respectively, with other local verification
work overlapping part of the run. Compare the earlier controlled lab timings for
performance comparisons; these are correctness smoke timings, not a speed guarantee.

All 7,153 native contour shards were converted and decoded back for exact
coordinate comparison, including valid empty minute contours. Uncompressed
contour size fell from 1,002,108,719 to 389,005,152 bytes (61.2% smaller). Delivery
shards also use explicit gzip compression, independently of HTTP compression.

A production-bundle Chromium smoke test with a 390×844 mobile viewport and real
verified local data retained about 41 MB on the UI thread after forced GC (the
previous production smoke retained about 233 MB). Worker heaps are excluded.
The city and airport walking overlays painted successfully, a 91-minute cutoff
reused loaded profiles without downloads, and the console had no application
errors. These are desktop-browser measurements, not physical-phone benchmarks.
