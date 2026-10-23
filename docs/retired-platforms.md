# Retired platform presentation

The pinned `sl-cf26ae3305b49dbcebac` release contains 14,195 routing stops. An audit
of every published timetable shard (2026-10-21–2026-10-28) found 1,612 platforms
whose labels begin with the GTFS-derived `Läge OLD` marker. None is referenced by
a published transit connection. 1,344 still have incoming/outgoing walking edges,
all 1,612 occur in transfer rules, and four have contour profiles.

These platforms are hidden from public markers, station search, platform pickers,
provisional/final result counts and map fitting/navigation bounds. Legitimate names
such as Koldalsvägen remain visible. Shared links to a retired origin show an
explicit error and require choosing an active platform; they never silently move
the origin to a same-name neighbour.

This is a presentation filter. The complete stops array, stable indices, walking
edges, transfer rules, precomputed closure, contour profiles and journey geometry
remain available to routing. Retired stops have no public Leaflet marker; sparse
marker slots preserve their original routing indices. A route can still walk
through an internal retired node, without displaying it as a selectable platform
or route waypoint marker. Cutoff changes and reset cannot restore hidden markers.

## New and existing data

New compiler builds set `retired` on OLD-coded platforms after expanding calendar
services into the actual published timetable. An OLD-coded platform with a
published connection explicitly receives `retired: false` and remains public.
Non-OLD stops are not retired merely because they have no service in a short
interval. No routing records are removed or reindexed.

The existing audited release needs no large data migration: in the absence of the
new field the browser recognises the leading, generated platform marker, including
variants such as OLD1, OLDE and OLD¨. It does not match stop/station names or arbitrary
occurrences of “old”. Explicit metadata takes precedence over this legacy fallback.
The audit applies to the pinned release's published period; it does not claim that
these GTFS IDs have never appeared in historical or other seasonal services.

## Verification

- Unit tests cover marker variants, legitimate name substrings and explicit active
  metadata overriding the legacy marker.
- A compiler test preserves the original node order and walking edge indices while
  distinguishing unused OLD platforms from a served OLD-coded platform.
- Desktop/mobile browser fixtures require a path through a retired intermediate
  node to reach a public destination. They verify search, pickers, counts, cutoff,
  reset, bounds and retired shared links without removing that walking bridge.
- The pinned release descriptor and traffic/walking data bytes are unchanged.
