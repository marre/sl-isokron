# Walking-state optimization: implementation and next experiment

Follow-up: [precomputed walking is now integrated into the production data build
and router](walking-precompute.md). The experimental measurements below record
the earlier comparison; source generation is frozen for reproducibility.

The production router now uses numeric transfer-context IDs, cached settled/active
flags, and budget/dominance checks before allocating walking candidates. All
routing remains in the browser worker. The deployed data format, walking graph,
overlay and departure-window semantics are unchanged.

[Raw measurements](walking-state-followup-results.json) ·
[Original investigation](walking-state-investigation.md)

## Production recheck

| Search | Previous router | Optimized production | Speedup |
| --- | ---: | ---: | ---: |
| Arlanda terminal 4 | 2.33 s | 0.92 s | 2.53× |
| Vallentuna | 12.85 s | 3.05 s | 4.21× |
| Skärvik | 8.12 s | 1.78 s | 4.55× |

These are medians of two complete routing trials per variant, with reverse order
on the second trial and a fresh desktop-Chromium worker each time. Timetable
loading and overlay painting are excluded. This rechecks the actual production
implementation against the frozen previous production router, rather than
assuming the experimental prototype's timings carry over unchanged.

All displayed stop results, complete serialized journeys, walking frontiers and
accepted-label counts matched exactly. The tests include 69 unit tests and 43
desktop/mobile browser tests (one existing browser test skipped), plus the
production build. A new regression test compares 80 generated networks with
fractional walking times, cycles, dated trip IDs, route/trip-specific rules and
incremental station updates against the frozen router. Existing independent
oracle and route-scanner tests remain in place.

The production version also uses unambiguous context-prefix serialization and
checks that packed numeric keys remain safe integers. Contexts retain the actual
alighting event, transfer restrictions, boarding round and relevant trip/route
distinctions. Immutable predecessor chains still explain every displayed result.

## Precomputed walking: implemented as a separate experiment

The next proposed experiment is now implemented and measured. An offline builder
runs bounded shortest paths from every stop, producing a binary table containing
the exact destination, walking seconds and first original edge for each pair.
The query prototype expands the entire walking leg from each origin/alighting
seed. Walking-reached stops can board vehicles and contribute to overlay coverage,
but do not recursively expand the walking graph again. The actual alighting
context and continuous-walking budget remain intact.

| Search | Optimized production routing | Precomputed prototype routing | Additional table load locally |
| --- | ---: | ---: | ---: |
| Arlanda terminal 4 | 0.92 s | 0.64 s | 0.14 s |
| Vallentuna | 3.05 s | 1.69 s | 0.13 s |
| Skärvik | 1.78 s | 1.31 s | 0.14 s |

The additional-load column includes local HTTP fetch, decompression, SHA-256,
metadata checks and table validation. It is excluded from routing time and must
be added when considering first use. This is local delivery without bandwidth
throttling; it does not predict download time on a phone connection. The table
is freshly loaded for every prototype trial, rather than assuming a retained
decoded table.

All stop duration/arrival/boarding objectives and walking frontiers matched the
previous router on every real query. Every returned walking edge and itinerary
predecessor timing was checked. Equal-objective itinerary paths can differ, so
the precomputed variant is not asserted to have byte-identical journey arrays.
The production bookkeeping variant does retain byte-identical arrays.

The table contains 819,970 directed pairs, occupies **6,616,576 bytes raw** and
**3,888,084 bytes gzip**, and took about 13 seconds to build and compress locally
after parsing the fixture. All 819,970 original-edge witness paths were
reconstructed and checked. The prototype also matched the frozen router on 100
generated constrained-transfer networks using independently constructed
Floyd–Warshall tables. It accepted 168,430 / 728,730 / 473,443 labels for these
queries, versus 176,087 / 769,098 / 502,371 in current production.

The table and experimental traversal remain outside the application. This follows
the agreed sequence: ship the validated bookkeeping changes, then benchmark the
larger algorithm change. The benchmark supports pursuing precomputation, but a
single whole-region table adds a first-use download. For example, 3.89 MB alone
takes about 6.2 seconds at 5 Mbit/s before latency; that is arithmetic, not a
network measurement. A delivery experiment should compare compressed regional
rows, grouped bundles and a retained whole-region table, including cold/mobile
costs, before choosing the production format.

The research artifact is deliberately bound to the exact fixture hash. Production
integration would instead bind it to the immutable walking graph, add the format
to build/release validation and browser caching, and preserve the existing graph
as a fallback. The prototype's 16-bit stop/time fields also need explicit format
limits; they must not silently truncate a larger feed or fractional edge times.
These are concrete integration requirements, rather than reasons to change
already validated production routing in this release.

The next recommendation is therefore **measure table delivery and retention**,
then integrate the complete walking closure if its cold-load tradeoff is good.
No additional server computation is needed for that architecture.

## Reproduce the follow-up

Use the historical verified fixture described in the original investigation;
no GTFS or OSM calls are needed. Original walking edges are retained locally for
distance, estimated-link markings and itinerary reconstruction.

```sh
python experiments/walking-state/generate.py
# If network.json is not already prepared:
npx tsx experiments/walking-state/prepare.ts
python experiments/walking-state/build-closure.py
python experiments/walking-state/generate-closure.py
npx tsx experiments/walking-state/validate-closure.ts
npx vite build --config experiments/walking-state/vite.config.ts
cp .data-build/walking-state/network.json .data-build/walking-state/closure.bin.gz .data-build/walking-state/closure-metadata.json .data-build/walking-state/site/
SLISO_PROFILE_SITE=.data-build/walking-state/site SLISO_PROFILE_PORT=5194 node experiments/profiling/server.mjs
# In another shell, without other CPU-intensive work:
node experiments/walking-state/closure-benchmark.mjs
python experiments/walking-state/publish-followup.py
```

Large fixtures and generated tables stay in ignored `.data-build/`. Benchmark
scripts, generated variants and research artifacts are not bundled with the app.
