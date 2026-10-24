# Arrive-by maps

Choose **Varifrån når jag målet?**, a stop or mapped destination point, and a Stockholm arrival deadline. The map answers: how late can I start here and still arrive by that deadline?

A colour of 40 minutes means the latest feasible start is 40 minutes before the deadline. This includes changes and any margin between actual arrival and the deadline. It is deliberately different from the departure map's shortest duration excluding initial waiting. The departure-window setting is hidden and unused in arrival mode. Journey details show actual forward departure/arrival times and the margin separately.

## Exact scanner reuse

`core/reverse.ts` reflects absolute timestamps around the deadline, swaps connection endpoints, pickup/dropoff and request-stop flags, and reverses sequence order. Transfer rules swap endpoints, trip and route qualifiers. Walking links reverse direction and geometry. The existing route scanner then searches with its anchor fixed to the deadline and the initial boarding window extended to the full travel budget. Its minimum cost is the latest feasible real departure. There is no repeated forward search per origin.

The worker loads timetable shards from `deadline - maxMinutes` to `deadline`. Absolute timestamps preserve cross-midnight trips; no wall-clock arithmetic is used for routing. Missing required timetable days fail explicitly.

The exact precomputed walking closure is transposed into typed row/source/entry indices. Path witnesses still refer to the original table and are reversed only when decoded. Extra table memory is approximately eight bytes per pair plus two row arrays. Continuous walking limits, maximum boardings, transfer minima/prohibitions and trip-specific precedence remain scanner constraints.

Journey nodes retain mirrored time internally. `journeyFromNode` decodes them into real chronological legs, reverses geometries, and merges consecutive walks. Final access walking is placed next to the last transit arrival, leaving unused time as a destination margin. In reverse `Reach.arrival` and `DestinationSource.arrival` represent time at the inspected stop, i.e. its latest departure; `SearchResult.reverseEpoch` identifies that representation.

Mapped destination access searches incoming footpaths before the scanner runs. Hovered arbitrary origins search forward footpaths towards feasible stops. Both preserve edge directions, the 25-metre snap threshold and continuous walking budget. The same-edge direct point-to-point case works without requiring a detour through a stop.

## Walking display

Existing published polygons expand *outwards* from stops. Reusing them for arrival maps could imply walking against one-way paths. Arrival mode instead displays coloured corridors along mapped incoming paths, with an approximate five-pixel display width. These are path visualizations, not new area contours or a guarantee of access to neighbouring buildings.

For each time band, a stop source seeds the remaining budget:

```
min(bandSeconds - source.seconds, maxWalkSeconds - source.walked)
```

Verified stop access costs are deducted before propagating over incoming graph edges. At each node only the greatest remaining budget is needed. Partial edge intervals preserve one-way restrictions, including a destination inside a long edge. Larger bands draw first; smaller bands replace their colours progressively.

The graph is computed in a separate worker from checksum-verified static footpath tiles. Four downloads run concurrently. One parsed viewport graph is retained; newer views cancel stale requests/results. The expanded viewport includes the maximum walking radius. Views requiring more than 96 tiles or eight megabytes of compressed data show a zoom-in instruction instead of loading the region into a phone's memory. Stop results and point journey inspection are still available in wider views. No server or data release rebuild is required.

A future incoming-contour data release could replace this bounded runtime layer and provide inexpensive wide-area polygon overviews. Outgoing polygons must not silently substitute for incoming ones.

## Compatibility and verification

New links store `direction: "arrive"`. Omitted direction preserves existing departure links. Reset retains direction and filters. Map clicks move the destination in arrival mode; double-click and dragging retain their navigation behaviour.

Tests compare latest departures against repeated forward feasibility searches, cover directional walking, transfer restrictions, pickup/dropoff, midnight, closure transposition and point-to-point walking. Desktop/mobile browser checks cover mode switching, sharing/restoring, chronological journey previews and the progressive incoming walking layer.
