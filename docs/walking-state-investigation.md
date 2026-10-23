# Faster walking-state bookkeeping

Implement **numeric transfer-context IDs, cached active/settled flags, and walking
candidate rejection before allocation** next. In the isolated prototypes this
reduced search time by **63–78%**, with identical results. Keep the route scanner
and all useful time/walking/transfer alternatives. No production code or data
format was changed by this investigation.

[Measurements and raw trials](walking-state-results.json) ·
[Previous pipeline profile](profiling.md) ·
[Prototype generator](../experiments/walking-state/generate.py)

## Measured alternatives

These are complete routing times, including indexing, vehicle scans, walking
propagation and journey serialization; timetable downloads and overlay drawing
are excluded. Each cell is the median of two trials, with reverse variant order
in the second trial and a fresh Chromium worker for each trial.

| Second batch | Arlanda terminal 4 | Vallentuna | Skärvik |
| --- | ---: | ---: | ---: |
| Current production algorithm | 2.54 s | 12.50 s | 8.32 s |
| Numeric contexts + cached flags | 1.19 s | 6.09 s | 3.32 s |
| Also reject walking candidates before allocation | **0.94 s** | **3.08 s** | **1.86 s** |
| Combined speedup | **2.71×** | **4.06×** | **4.47×** |

The first batch tested smaller changes separately:

| First batch | Arlanda terminal 4 | Vallentuna | Skärvik |
| --- | ---: | ---: | ---: |
| Current production algorithm | 2.60 s | 12.56 s | 8.26 s |
| Cache trip classification, settled state and frontier membership | 1.78 s | 9.49 s | 5.76 s |
| Also compact frontier arrays in place | 1.87 s | 9.16 s | 5.88 s |
| Also use a reusable scratch candidate, copying only retained labels | 1.88 s | 10.42 s | 6.47 s |

Caching helped consistently. In-place compaction did not show a consistent extra
benefit, and the scratch-object prototype was slower than caching alone. The
winning prototype uses numeric IDs and an early scalar dominance check; it does
**not** use the scratch object or in-place compaction.

This is a small desktop-Chromium experiment, not a physical-phone or end-to-end
application benchmark. The numeric-only Vallentuna trials ranged from 5.20 to
6.98 seconds; the combined variant ranged from 2.98 to 3.18 seconds. Raw ranges
are retained, and two trials do not establish precise performance distributions.
No CPU sampler was running during these comparisons. CPU-intensive validation
and preprocessing ran outside the timed browser batches.

A separate instrumented Vallentuna pass explains the gain: **26,007,958 candidate
pushes** for just **769,098 accepted labels**. Of those attempts, 25,883,874 came
from walking, 9,677,552 failed a budget check and 15,561,308 were dominated.
About **97% of candidates were discarded**, after their objects had already been
allocated. The pass counted 40,887,044 dominance comparisons. It was excluded
from timing comparisons; these are operation counts, not sampled CPU estimates.

## What changes and why it is safe

1. **Intern transfer contexts once per alighting event.** Currently each walking
   candidate builds a string containing its stop, boarding count, trip, route and
   outstanding transfer context. The prototype assigns numeric IDs to the context
   prefix, and uses `contextId * stopCount + stopIndex` for frontier lookup. Walking
   inherits the prefix and the transfer deadline. This avoids repeated regexes,
   string construction and hashing in the inner loop. A production implementation
   should assert that packed keys remain safe integers.
2. **Cache immutable facts; mark removed labels inactive.** A retained label's
   time and alighting event never change. Compute whether its transfer deadline
   has elapsed once, and keep a flag showing whether its frontier still contains
   it. Queue processing can skip inactive labels without rebuilding a context key
   and searching an array. Predecessors remain independent immutable objects.
3. **Reject candidates by scalars before constructing an object.** Compute the
   new time and continuous walking amount, check budgets, then test the matching
   frontier. Only allocate a walking label if it can survive. The existing `push`
   and result/witness logic still handle surviving candidates.

The early dominance check is specifically for candidates beaten by a retained
label **in the same original transfer context and boarding round**. That label
arrives no later, has walked no more, and has an equal or later departure anchor;
its displayed duration is therefore no greater. It has already supplied an equal
or better stop value and walking frontier. Thus skipping the rejected candidate
does not skip a useful display update, despite production updating display
values before its dominance test. The original alighting-time condition also
remains. With `prune:false` the extra dominance rejection is disabled.

Do not replace this with “keep the earliest arrival at every stop.” A later
arrival can have a shorter displayed journey, a different remaining walking
budget, or a legal transfer that another label cannot make.

## Validation

All five prototypes passed **205 regression checks** in total. Each ran the
existing router, journey, walking and search-audit tests, including the independent
exhaustive oracle on 60 seeded small networks, plus the route-scanner comparison
on 150 seeded overtaking/constrained-transfer networks.

For every timed real query, the harness compared all stop duration/arrival values,
boarding counts, request-stop flags and result kinds, every canonical walking
frontier, the complete serialized journey array, and accepted-label counts.
All were identical to the baseline. The unchanged label counts were 176,087,
769,098 and 502,371 respectively. This improves handling of existing states;
it does not obtain its speedup by truncating alternatives.

The fixture is the same verified timetable used in the preceding profile:
2026-10-22 08:07 Europe/Stockholm, 120 travel minutes, 30 walking minutes,
four transfers, a 30-minute first-boarding window and all modes. It contains
14,195 stops, 483,245 walking links and 92,794 connections in the query window.
Its local migration ID is `sl-40c8446978cb4fc009a6`; underlying network/contour
bytes match the published `sl-f86213b8fb8e39a9260c` release. No Trafiklab or OSM
request was made for these experiments.

## Larger ideas

| Idea | Expected benefit | Evidence / next step |
| --- | --- | --- |
| Precompute a complete bounded stop-to-stop walking closure | Expand a walking leg directly from its alighting/origin seed, avoiding repeated intermediate-stop expansion | Built distances for every stop; size measured below. Query speed and full routing correctness still need a prototype. |
| Flatten labels into typed-array storage with predecessor IDs | Fewer object allocations, compact flags and more predictable RAM | Plausible follow-up if allocation/GC remains expensive after the measured optimization. No measured speedup or RAM reduction yet. |
| Release completed-round queues and frontiers | Lower retained memory and GC pressure | Earlier-round frontier membership is no longer needed once that round is scanned; retain all predecessor chains needed by later labels/witnesses. Needs a heap-retention audit and correctness checks. |
| Precompute sparse transfer shortcuts, following ULTRA research | Avoid storing/relaxing every walking pair while retaining useful transit transfers | More complex preprocessing and correctness proof; adapt to departure anchors, walking limits and scoped GTFS rules. |
| Bucket/radix scheduling of integer-cost walking states | Process promising candidates earlier, potentially accepting fewer temporary labels | All fixture walking times are integer seconds. A previous binary-heap experiment was slower overall; a bucket queue is a different, untested hypothesis. |
| Additional workers, WebAssembly or GPU | Potential throughput or lower-level representation improvements | Not the first choice: parallel workers duplicate data and require frontier coordination; changing the runtime alone does not remove string keys, redundant objects or unnecessary propagation. |

### Complete walking closure: a concrete precomputation candidate

I ran bounded Dijkstra from **every one of the 14,195 stops**, over the existing
directed walking graph, up to the UI's maximum continuous walking budget of
1,800 seconds. The distance phase took about **10.2 seconds in local Python**;
this excludes fixture parsing and report serialization and is not a routing
benchmark.

The complete table contains **819,970 directed non-self pairs**, versus 483,245
direct links today: **69.7% more pairs**. It adds 336,725 reachable pairs and finds
a shorter chained path for 19,910 existing pairs. The current router already
discovers such chains at query time; these are opportunities to move work offline,
not newly discovered routing errors.

At this dataset size, a hypothetical row-indexed binary format could use eight
bytes per pair: a 16-bit destination, 16-bit exact seconds, and a 32-bit original
first-edge reference. Including 32-bit row offsets that is about **6.62 MB
uncompressed**. This is a storage calculation, not an implemented codec or a
measured compressed download size. It excludes original edge/path metadata and
runtime objects. More than 65,535 stops would require wider destination IDs.

With such a table, a walking leg could be expanded once from the actual alighting
stop (or initial origin), filtering entries to the remaining walking budget.
Shorter walking paths from the same seed dominate longer paths, because they
use less time and walking budget while retaining the same departure anchor and
transfer event. Keep the original alighting context and reconstruct actual edge
paths for itinerary distance and estimated-link markings. Walking-reached labels
must still be eligible to board vehicles and seed overlay coverage; they simply
would not recursively expand the walking graph again.

This deserves the next algorithm experiment **after the measured bookkeeping
change**. It fits static files and client-side computation. Do not ship a
one-hop-only traversal of today's incomplete table, or assume that faster walking
propagation justifies simplifying transfer restrictions. A distance-table size
check alone does not validate a new router.

Relevant research: [ULTRA one-to-many multimodal routing](https://drops.dagstuhl.de/entities/document/10.4230/OASIcs.ATMOS.2020.1).
The complete closure above is a simpler experiment, not an implementation of ULTRA.

## Reproduce

Use the historical compiled dataset or a local copy of its published release;
`SLISO_DATA_ROOT` must contain its manifest and referenced network files.

```sh
python experiments/walking-state/generate.py
npx tsx experiments/walking-state/prepare.ts
node experiments/walking-state/regressions.mjs > .data-build/walking-state/regressions.log 2>&1
python experiments/walking-state/closure.py --all
npx vite build --config experiments/walking-state/vite.config.ts
cp .data-build/walking-state/network.json .data-build/walking-state/site/network.json
SLISO_PROFILE_SITE=.data-build/walking-state/site SLISO_PROFILE_PORT=5194 node experiments/profiling/server.mjs
# In a second shell, sequentially, without other heavy CPU work:
node experiments/walking-state/run.mjs
node experiments/walking-state/run.mjs numeric
npx tsx experiments/walking-state/count.ts
python experiments/walking-state/report.py
```

The generated router copies and 66 MB local JSON fixture live under ignored
`.data-build/`. The generator derives its variants from `src/core/router.ts`;
review its transformations when that source changes. The result file records
the source hash. No benchmark scripts are imported by the application.
