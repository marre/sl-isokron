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

## Rättning 2026-10-20: namngivna OSM-positioner vid Runstensplan

Profil `osm-bus-position-v3` bevarar de tidigare accepterade anslutningarna och
kompletterar dem med identitetsbaserade busshållplatspositioner. Om en GTFS-punkt
inte kan kopplas entydigt får exakt en OSM-`highway=bus_stop` med samma namn och
angiven lägeskod identifieras inom 25 meter. OSM-noden får inte ha kända
begränsningar och får inte vara kandidat för flera GTFS-lägen. Därefter kopplas
**OSM-hållplatsens position**, inte den felplacerade GTFS-punkten, till exakt en
gångväg inom 5 meter. Tvetydiga vägar, för stora avvikelser och spår-/båtlägen
får inte denna komplettering. Identiska projicerade GTFS-lägen nekas som tidigare.

Både GTFS–OSM-avvikelsen och OSM–gångnätsavvikelsen räknas konservativt med i
gångbudget och meter; inga kostnadsfria plattformshopp införs. Själva förbindelsen
routas längs det filtrerade gångnätet. Originalets GTFS-ID/koordinater bevaras för
kontroll mot nästa feed. OSM-nod-ID och koordinatavvikelse sparas i indexets
hållplatsproveniens och ankarfil. Parens upprepade källtext har kortats;
fullständig profil, OSM-hash och Valhalla-version finns i indexmetadata och
manifestets `walkingVersion`. Detta minskar distributionens storlek utan att
ändra tiderna för befintliga par.

Se [Runstensplan-fallet](../docs/runstensplan-regression.md). Det lokala
ombygget med feed 2026-10-19 gav 3 970 anslutna lägen, varav 879 genom den nya
positionstilldelningen, och 133 310 riktade par utan matrisfel. Aktuella
produktionstal hämtas ur manifestet; underlaget är fortfarande partiellt.

## Systematisk rättning: tilldelning, gångkorsningar och lokalgator

Profil `bus-assignment-junction-v4` löser närliggande hållplatslägen gemensamt.
Samma namn/lägeskod, högst 25 meters avvikelse och kända tillträdesregler krävs
fortfarande. En avgränsad bipartit sökning väljer maximal entydig tilldelning
med minsta totala koordinatavvikelse. Endast tilldelningar som är oförändrade
i alla alternativ inom 5 meters total kostnad accepteras. Likvärdiga byten av
riktning, identiska GTFS-lägen och för stora grupper lämnas olösta.

Vid vägkopplingen prioriteras redan accepterad gånggeometri framför en ny
intilliggande gata med standardtillträde. En klart bättre positionsträff på
OSM-hållplatsens gångväg kan skiljas från en sämre kandidat (både minst 2 meters
avståndsskillnad och dubbla avståndet krävs för att förkasta alternativet).
Kvarvarande alternativ måste vara förenade inom 15 meter genom Valhallas
faktiska grafnod-ID:n och tillåtna dubbelriktade kanter. Närliggande koordinater
kopplar aldrig ihop två grafnoder. Separata broplan eller frånkopplade gångbanor
blir därför inte en ny passage genom denna korsningskontroll.

OSM-profilen medger svensk normal gångåtkomst på vanliga `tertiary`/
`tertiary_link`-vägar, även på landsbygden. Bilarnas hastighetsgräns är inte
ett gångförbud. `motorroad=yes`, explicit gångförbud, krav på separat sidoväg
(`foot=use_sidepath`), privat åtkomst, kända tidsbegränsningar och barriärer
har företräde. Primär-/sekundärvägar kräver fortsatt uttryckligt gångunderlag.
En tillåten väg kan sakna trottoar; modellen bedömer åtkomst, inte trafikmiljö
eller lämplighet för barn. Detta rättar de bortfiltrerade 60–70-vägarna vid
Lovö kyrka och Barkarby på Lovön.

`platform-bindings.json` identifierar uttryckligen plattformarna i Vallentuna,
Stockholms östra och Tekniska högskolan med OSM-väg-ID och GTFS-läge.
Vallentunas OSM-stop_area 19354312 anger plattformarna 40140423/40140424;
övriga plattformsytor har också SL:s NeTEx-quay-ID:n. Plattformarnas egna
kartlagda kanter läggs till gånggrafen och ansluts bara via verkligt gemensamma
OSM-noder. Projektionen görs på den identifierade plattformen, aldrig på en
närliggande gata eller en annan nivå. Högst 25 meters koordinatavvikelse räknas
in i gångtid och avstånd; flyttat GTFS-läge, ändrat plattformsnummer, saknad
eller tillträdesbegränsad OSM-yta stoppar bygget. Dessa identitetskontroller
ersätter inte platsgranskning. Övriga järnvägs-/tunnelbaneplattformar ingår inte
automatiskt, och täckningen förblir partiell.

`scripts/walking_audit.py` granskar samtliga yttrafiklägen efter saknade
riktade gångpar och orimligt långa nätvägar mellan närliggande lägen med samma
namn. Fågelvägsavstånd används bara för diagnos, aldrig som gångtid. Resultatet
publiceras som Actions-artefakten `sliso-walking-audit`. Kvarstående fynd kräver
granskning; de fylls inte automatiskt med genvägar. De rapporterade fallen
finns i `walking-reference-pairs.json`; bygget stoppas om en kontrollerad
riktning saknas eller överstiger gränsen i referenslistan. Borttagna hållplats-ID:n
redovisas som överhoppade referenser. Denna regressionstestlista är inte en
manuell granskning av alla gångpassager.

Vid Tekniska högskolan ingår de kartlagda hissarna 398632623 och 1516917805,
och två uttryckligt identifierade SL-biljettspärrar (se `station-access.json`).
Vanliga privata grindar är fortsatt uteslutna. Färd-/väntetid i hiss uppskattas
till två minuter per plattformsanslutning, utöver gång över den kartlagda vägen.
Detta är en modellparameter, inte en uppmätt väntetid eller tillgänglighetsgaranti.
Två lokala Valhalla-grafer används: gång mellan yttrafiklägen och deras ytor
använder grafen utan hissar; anslutningar till/från de utpekade underjordiska
plattformarna använder stationsgrafen och betalar stationstiden. Därmed skapas
inte tidsfria genvägar genom hissar mellan två vanliga ythållplatser. Även
stationernas gångytor reserverar anslutningstiden före nätutvidgningen.

Namngivna OSM-busshållplatser som har en enda vanlig vägkorridor inom tio meter
får en tidsatt anslutning till denna. Detta tillägg gäller efter entydig
hållplatsidentifiering, och bara när samtliga närliggande kandidater hör till
samma vanliga väg. Konkurrerande gångbanor, vägar eller plattformar avvisas.
Det löser Barkarbys vägrensläge cirka sex meter från vägens mittlinje utan att
vidga den vanliga GTFS-projektionen till godtyckligt närmaste väg.
