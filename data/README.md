# Trafikurval och gångindex

**Utvecklingsdata, ännu inte komplett för en pilot.**

Beställaren valde 2026-10-19 att inkludera **samtliga linjer i GTFS Regional SL-feeden**, även UL, Waxholmsbolaget och närtrafiken. Detta ersätter tidigare antagande om ett snävare SL-urval. Beslutet finns som `feed-scope.json`; all-feed är ett uttryckligt val. En blandad feed utan policy stoppas av importören.

`walking-index.json` är ett faktiskt, förberäknat och riktat OSM-baserat gångindex: **10 460 par, 1 041 kopplade lägen av 14 219** i feedversion 2026-10-19. `reviewed=false` är avsiktligt. Övriga hållplatser, inklusive järnvägsplattformar, saknar granskade gångkopplingar. Indexet får inte beskrivas som ett fullständigt regionalt gångunderlag.

Gångparen räknades lokalt av Valhalla 3.9.1 med 4,8 km/h, högst 30 minuter och inga externa gång-API-anrop. Endast entydiga buss-/båtlägen inom en meter från en modellerad gångväg accepterades automatiskt. En meters gräns är koordinatprecision vid kartkopplingen; inga fria anslutningslinjer eller gångtider längs fågelvägen har lagts till. Identiska projicerade lägen med olika GTFS-ID:n nekas automatiskt. Plattformar med oklar nivå, entré eller passage kräver uttrycklig granskning.

Det fysiska nätet består av OSM-vägsegment med konservativ gång-/tillträdesprofil. Kända tidsbegränsade kanter och tillträdeshinder utesluts. Automatiska färjeöverfarter ingår inte i gångnätet. Okända tillträden/öppettider och OSM-fel är fortfarande datakvalitetsbegränsningar. Första försöket med enbart exakta befintliga gångnoder gav endast sex kopplade lägen och inga par; Valhalla-steget tillåter även positioner längs faktiska vägsegment med samma strikta precision.

## Licens och ursprung

- GTFS-hållplatsidentiteter/koordinater: Trafiklab/Samtrafiken, **CC0 1.0**, enligt [GTFS Regional](https://www.trafiklab.se/api/gtfs-datasets/gtfs-regional/#licence).
- Härledda gångförbindelser: **© OpenStreetMap contributors, ODbL 1.0**, [licens](https://opendatacommons.org/licenses/odbl/1-0/), [OSM-källangivelse](https://www.openstreetmap.org/copyright).
- OSM-utdrag: Geofabrik, Sverige 2026-10-18. Originalfilens leverantörs-MD5 har kontrollerats. SHA-256, källadress, programversion och metod anges i `walking-index.source.json`.
- Den maskinläsbara bearbetade databasen är `walking-index.json`. Källutdrag och den fullständiga metoden för bearbetning anges i källfilen och de öppna skripten nedan. Appens manifest anger aktiva källor; ODbL-attribution följer med distribuerade data.

## Bygg om lokalt (Linux, Python 3.12+)

```sh
python -m venv .data-build/venv
.data-build/venv/bin/pip install -r scripts/requirements-walking.txt
```

Hämta en aktuell Geofabrik-Sverige-PBF och dess tillhörande `.md5` via HTTPS. Kontrollera leverantörens checksumma innan filen används. För denna version är källan och förväntade värden låsta i `walking-index.source.json`. Originalet är cirka 916 MB; ha flera GB ledigt för mellanresultat. En ny källa kräver ny versions-/proveniensfil.

```sh
.data-build/venv/bin/python scripts/osm_walks.py \
  --pbf .data-build/sweden-261018.osm.pbf --gtfs .data-build/source/sl.zip \
  --output .data-build/walking-graph.json.gz
.data-build/venv/bin/python scripts/prepare_pedestrian_tiles.py \
  --graph .data-build/walking-graph.json.gz --pbf .data-build/sweden-261018.osm.pbf \
  --directory .data-build/valhalla
.data-build/venv/bin/python scripts/valhalla_walks.py \
  --config .data-build/valhalla/config.json --gtfs .data-build/source/sl.zip \
  --graph-report .data-build/walking-graph.json.gz.report.json \
  --stop-features .data-build/walking-graph.json.gz.bus-stops.json \
  --output .data-build/valhalla-walks.json
```

Inspektera rapport, ändrade kopplingar och referensfall innan det tidigare indexet ersätts. `--reviewed-bindings` till OSM-steget stöder uttryckliga nodbindningar för den separata grafbyggaren; ange `verified=true` endast efter faktisk kontroll, aldrig för att få bygget att passera. Valhalla-stegets automatiska stationsundantag kvarstår tills separata granskade plattforms-/entréregler implementerats.

Mätprotokoll för nät, tilebygge och par finns under `docs/`. Gångbygget är separat från den dagliga tidtabellen. Flyttade/ändrade hållplatser upptäcks vid nästa GTFS-import; gamla gångtider får inte användas mot nya koordinater. Hållplats-/entréändringar i OSM kräver också nytt gångbygge, föreslaget månadsvis. Ingen stor OSM-PBF eller gatugraf laddas av slutanvändarens webbläsare.


## Senare tillägg: längder och gångområden

`valhalla_walks.py` sparar även nätets rapporterade längd i meter för varje riktat par. `walking_areas.py` använder samma filtrerade nät och automatiska hållplatsbindningar för konturer i steg om 1 minut, upp till 30 minuter. De senare är interpolerade, generaliserade polygoner och **inte** ett intyg om tillträde till all mark i dem. Plattformar utan granskad anslutning saknar fortfarande ytor. Konturer och färdiga appdata distribueras i GitHub Releases enligt `data/release.json`; de stora genererade filerna hör inte hemma i Git. OSM ODbL-attribution och samma käll-/programversion gäller även konturerna. `prepare_walking.py` är den reproducerbara CI-ingången; se `docs/operations.md`.

## Rättning 2026-10-20: små koordinatavvikelser vid busshållplatser

Git-indexet ovan bevaras som äldre basdata. Nya releasebyggen använder profilen
`identified-bus5m-v2`: grundtoleransen är fortfarande 1 meter. För lägen som endast
trafikeras med buss tillåts högst 5 meter om exakt en OSM-busshållplats inom
10 meter har samma namn och, när GTFS anger lägeskod, samma lägeskod. Flera
möjliga gångvägar eller identiska projicerade GTFS-lägen nekas fortfarande.
Detta är en automatisk koordinatmatchning, inte en platsgranskning eller en
allmän anslutning till närmaste väg. Båt-/spårplattformars tolerans utökas inte.

Båda ändarnas koordinatavvikelser adderas till gånglängden och gångtiden med
4,8 km/h innan gränsen 30 minuter tillämpas. Gångområdenas nätbudget minskas
med startlägets anslutningstid. Gångsträckan mellan anslutningarna följer det
filtrerade OSM-nätet. Kända tillträdeshinder och separerade nät kvarstår.

Orsaken och det reproducerade användarfallet finns i
[Skärvik–Skorpvägen–Ankarstocksvägen](../docs/walking-regression.md).
