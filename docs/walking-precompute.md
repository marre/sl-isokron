# Precomputed walking connections

The build now precomputes every directed stop-to-stop walking path within the
dataset's maximum continuous walking budget. The browser expands a walking leg
once from its origin or actual alighting event. Walking-reached stops remain
eligible for vehicle boarding and walking-overlay coverage. Departure anchors,
walking-budget resets, transfer counts and scoped GTFS rules are preserved.

The original edges remain in the release. Walking instructions reconstruct them,
including distances and markings for estimated access links. An equal-time path
may differ from the previous graph search, but journey objectives and complete
walking Pareto frontiers are checked against the reference router.

The real-data migration contains **819,970 directed pairs** in a **3,916,454-byte
gzip file**. It adds one immutable, checksum-verified download, retained in
CacheStorage for later searches. A newly created search worker reuses that cache.
No routing server, API call, GTFS download or OSM rebuild is needed for migration.
All computation of a user's search remains in the browser.

## Release and compatibility

`build_data.py` generates the table during normal publication and includes it in
the immutable version fingerprint. `walking_closure.py --root PATH` migrates an
existing verified release, retaining the previous immutable directory. The manual
`Precompute walking connections` workflow performs that migration and publishes
the large files to GitHub Releases; only `data/release.json` is pinned in Git.
Release packing and installation validate the table and its source hashes.

An optional manifest field identifies the table:

```json
"walkingClosure": {
  "format": "sliso-walk-closure-v1",
  "maxMinutes": 30,
  "url": "/data/sl-VERSION/walking-closure.bin",
  "bytes": 3916454,
  "sha256": "SHA256_OF_COMPRESSED_FILE"
}
```

Older manifests use the existing graph traversal. If an input contains fractional
walking seconds or more than 65,535 stops, the builder omits this compact table
and retains exact graph routing; it never rounds or truncates. Searches with a
walking budget exceeding the table's coverage also use graph routing. An invalid
checksum or mismatched table is an explicit data error, never a mixed-version
result.

## Binary format

The `.bin` payload is deterministic gzip containing little-endian data:

| Offset | Content |
| --- | --- |
| 0–31 | Eight uint32 values: magic `0x31435753` (`SWC1`), schema 1, stop count, original-edge count, maximum seconds, pair count, header size 96, reserved zero |
| 32–63 | SHA-256 of the exact walking file referenced by the manifest |
| 64–95 | SHA-256 of the exact stop file referenced by the manifest |
| 96 onward | `stopCount + 1` uint32 row offsets |
| After row offsets | Sorted records: uint16 destination, uint16 exact walking seconds, uint32 first original-edge index |

Distances are computed with bounded Dijkstra on the original directed graph.
Every encoded first edge must connect to a suffix with exactly the remaining
distance. Positive edge times make suffix distances strictly decrease, proving
that every reconstructed path terminates and has the encoded duration. Both the
builder and browser check all suffixes. Checksums bind edge indices to their
original source files.

## Validation

The implementation passed 71 unit tests, 85 Python tests and 45 desktop/mobile
browser tests (one existing browser test skipped). This includes 100 generated
constrained-transfer networks compared against the frozen router, independent
Floyd–Warshall distance checks, corrupted/source-mismatched tables, release
migration/installation, actual worker use, cache reuse across worker recreation,
and compatibility with older manifests. The full production build also passed.

The preceding performance experiment measured a further 26–45% reduction in
routing time compared with optimized graph traversal. That excludes table loading;
the initial extra download remains a tradeoff on slower connections. See the
[implementation experiment](walking-state-implementation.md) for raw timings and
their limits.

## Production-worker recheck

The actual minified production worker was also tested with verified release files,
incremental station updates and the full table validation enabled. A fresh worker
was used for each query; each engine/origin had one cold and one CacheStorage-warm
run. No CPU sampler, bandwidth cap or phone hardware was used.

| Origin | Graph routing, cold / warm | Precomputed routing, cold / warm |
| --- | ---: | ---: |
| Arlanda terminal 4 | 1.14 / 1.23 s | 0.97 / 1.09 s |
| Vallentuna | 3.94 / 4.04 s | 2.25 / 3.41 s |
| Skärvik | 2.68 / 2.13 s | 1.59 / 1.75 s |

All stop objectives, boarding counts and walking Pareto frontiers matched. All
walking edges, estimated markings, vehicle endpoints and itinerary predecessor
timings were validated. The initial table was fetched once per new browser
context; every warm search made **zero data requests**.

Loading and validating the table are separate costs. Table decompression and
validation took 0.13–0.20 s per worker. Total loading-plus-search times are retained
in the [raw results](walking-precompute-results.json): for example, Arlanda's warm
total was 2.07 s versus 1.85 s with graph routing, despite its shorter routing
phase. General loading times varied, and one run per condition does not establish
a uniform end-to-end speedup. These measurements support the routing savings and
cache behaviour; they do not promise that every first or cached search is faster.

The published release is `sl-e444dbdac6b699b9d8bf`, retaining
`sl-f86213b8fb8e39a9260c` for older open clients. Only the small release descriptor
is committed; the table and traffic data remain in the static release.

To reproduce this integration test, build
`experiments/walking-state/integration.config.ts`, serve the release using
`experiments/profiling/server.mjs` with `SLISO_PROFILE_PORT=5196` and
`SLISO_PROFILE_SITE=.data-build/precompute/site`, and run
`npx tsx experiments/walking-state/integration.ts` with the same `SLISO_DATA_ROOT`.
