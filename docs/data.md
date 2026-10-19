# Dataflöde

## Produktion kräver verkligt underlag

Inga verifierade SL- eller OSM-filer följer med. `scripts/demo.py` skapar ett litet syntetiskt nät med riktiga ortnamn för orientering. Avgångar, linjeförlopp och gångtider är uppdiktade; appen visar testläge även när mobilpanelen är stängd.

1. Skaffa **GTFS Regional SL**, inte en godtycklig regional feed. API-nyckeln används enbart i byggmiljön. Trafiklab-konto i sig ger inte åtkomst till filen här.
2. Inventera feeden per linje/trafikslag och gränsöverskridande sträcka. Importören skriver `report.json` med samtliga linjer, trafikslagsfördelning, faktiska `transfers.txt`-rader per typ och antal gångluckor. Detta är en inventering, inte ett intyg att SL-täckningen är fullständig.
3. Förbered ett granskat gångnät inklusive plattforms-/stationsanslutningar. Bind hållplatser uttryckligen till rätt gångnod. Ingen automatisk närmaste-väg-snappning görs.
4. Bygg och validera datasetet. Granska stations-/resefallen och licenser före pilot/publicering.

```sh
python scripts/build_walks.py --graph data/walking-graph.json --output .data-build/walks.json
python scripts/build_data.py --gtfs .data-build/sl.zip --walks .data-build/walks.json
npm run build
```

GTFS-import kan också köras direkt med ett externt verifierat hållplatspar-index enligt formatet nedan. Ett tomt gångindex stöds för diagnos, men är en tydlig täckningslucka och uppfyller inte produktionskravet på gånganslutningar.

## Granskad gånggraf

`build_walks.py` gör riktade, avståndsbegränsade Dijkstra-sökningar över gångbara grafkanter. Ingen gång-API-förfrågan görs i webbläsaren eller av denna förberäkning. Grafen kan tas fram från OSM med lokal routingmotor eller ett granskat exportverktyg. **Nedladdning/tolkning av ett regionalt OSM-PBF, stationsinventering och automatiskt bevis på gångbarhet ingår inte i den levererade importören.** Det kräver underlag och fortsatt dataarbete.

Minimal formatskiss (värdena är endast syntaktiska exempel):

```json
{
  "version": "osm-export-YYYY-MM-DD-survey-v1",
  "attribution": ["© OpenStreetMap contributors · ODbL", "Stationsinventering: …"],
  "nodes": ["osm:1", "osm:2"],
  "stops": [
    {"id":"GTFS-ID-A","node":"osm:1","lat":59.3,"lon":18.0,"verified":true,"source":"platsgranskning/referens"},
    {"id":"GTFS-ID-B","node":"osm:2","lat":59.31,"lon":18.01,"verified":true,"source":"platsgranskning/referens"}
  ],
  "edges": [
    {"from":"osm:1","to":"osm:2","metres":400,"source":"osm-way/revision","oneWay":false,"extraSeconds":0,"restricted":false}
  ]
}
```

Kantlängder ska komma från verkliga gångvägar. Gångtid beräknas med 4,8 km/h och eventuella dokumenterade fysiska tillägg (t.ex. trappor). `oneWay` avser gångriktning, inte vägens bilregler. Kända tillträdesbegränsningar (`restricted`, `openingHours`, `foot=no/private/customers`) utesluts konservativt. En graf utan kända hinder är inte bevis för öppet dygnet runt. Anslutningskanter mellan plattform och gångnät måste också granskas; koordinatöverensstämmelse ensam är inget gångbarhetsbevis.

## Förberäknade gångpar

```json
{
  "version":"audited-walking-v1",
  "maxMinutes":30,
  "speedKmh":4.8,
  "stops":[{"id":"GTFS-ID-A","lat":59.3,"lon":18.0},{"id":"GTFS-ID-B","lat":59.31,"lon":18.01}],
  "edges":[{"from":"GTFS-ID-A","to":"GTFS-ID-B","seconds":300,"source":"granskad nätverksrutt/referens","restricted":false}],
  "attribution":["Källor och licenser"],
  "warnings":["Kända begränsningar"]
}
```

Riktning sparas. Inga implicita omvända kanter skapas av importören. ID och koordinater måste matcha den aktuella feeden (tolerans 0,000001 grader för serialisering). Flyttade eller borttagna hållplatser stoppar bygget. Saknad fysisk gångtid blir aldrig `min_transfer_time`. Bygg om när graf, plattformar eller bindningar ändras; månadsvis granskning föreslås.

## GTFS-stöd och försiktiga begränsningar

- Faktiska trafikdagar via `calendar_dates.txt`, eller `calendar.txt` med undantag.
- Tid över 24.00 kopplas till rätt trafikdygn. GTFS-sekunder förankras enligt noon-minus-12h i Stockholm; faktisk UTC-avgång styr datapaketets dygn, även från föregående trafikdygn.
- Alla stopp på samma trip får sittas kvar förbi; tillåten första påstigning och slutlig avstigning respekteras.
- `pickup_type`/`drop_off_type` 2 och 3 (beställning/överenskommelse) används inte. Ingen implicit resa med bokningskrav.
- Stationer expanderas för `transfers.txt`, utan att skapa gångkanter. Barnläge väljs uttryckligen i appen.
- `transfer_type` 0–3 med trip-/route-villkor stöds. Resor ska uppfylla både fysisk gång och regelns tid. Trip-specifika regler har företräde framför route- och hållplatsregler; lika specifika motstridiga regler tolkas konservativt.
- Olika trip_id räknas som olika fordon. `transfer_type` 4/5 (in-seat) stoppas uttryckligen för vidare modellarbete; de ignoreras inte.
- `frequencies.txt`, saknade hållplatstider och okända trafikslag stoppar importen för explicit expansion/klassificering. Ingen tyst utelämning. Nuvarande standardtyper: 0/900 spårvagn, 1/400/401 metro, 2/100/109 tåg, 3/700 buss, 4/1000 båt. **Lokalbanornas produktgruppering måste granskas mot verkliga route_id:n**; en GTFS-typ i sig bevisar inte SL-produkt.
- Hela den importerade feeden behandlas; kartutsnittet beskär aldrig söknätet. Importera bara avsedd SL-feed, annars kan även andra operatörer komma med.
- Saknad gång mellan olika stopp tillåts aldrig. Ett byte på exakt samma hållplatsläge behöver ingen fysisk förflyttning, men eventuella minsta bytestider gäller fortfarande. Inga generella extra påstigningsmarginaler införs utöver datareglerna.

## Paket och atomisk publicering

En manifestversion refererar endast oföränderliga filer under `/data/<version>/`. SHA-256 och byteantal kontrolleras innan användning, även för cacheträffar. Hållplatser, gång, rutter, tur-ID:n och bytesregler ligger i separata filer. Tidtabellen består av little-endian uint32-poster à 36 byte:

`from, to, departureEpoch, arrivalEpoch, tripIndex, routeIndex, sequence, pickupAllowed, dropoffAllowed`.

Dygnspaket sorteras på faktisk UTC-avgång. Alla dygn som berör `t0 … t0 + avgångsfönster + maxtid` måste finnas. Därför kan en nattresa från sista valbara dagen behöva nästa dygn. Importören håller en extra servicedag och begränsar valbar giltighet därefter. Föregående trafikdygn med tider över 24.00 ingår också. Vald lokal tid konverteras oberoende av besökarens tidszon. Tvetydiga/ogiltiga lokala klockslag avvisas med förklaring.

Byggaren skriver alla filer innan manifestet atomiskt ersätts. Ett misslyckat bygge lämnar föregående manifest orört. Den ersätter inga källfiler och tar inte bort tidigare publicerade versioner. CI:s cache bevarar tidigare paket inför nästa Pages-deploy, så att pågående klienter kan hämta sin version. Driftansvarig måste rensa gamla versioner och hålla koll på totalkvoten; inga filer över 25 MiB publiceras. Vid för stora filer stoppas bygget för partitioneringsarbete, inte förlust av giltiga förbindelser. Full regional skala är ännu inte mätt.

Den första verkliga feedens inventering finns i [SL-feed 2026-10-19](sl-feed-2026-10-19.md). Den innehåller flera trafikaktörer och får inte likställas med en redan granskad avgränsning av SL:s utbud.
