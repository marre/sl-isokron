# Systematisk kontroll av gångnät och sökresultat

Enskilda färgskillnader ska inte behöva rättas med hållplatsundantag. Från
profil v8 kontrolleras närliggande lägen oavsett namn och GTFS-stoppområde.

## Återställning med nätbevis

Obundna busshållplatser får återställas med sin egen GTFS-position om:

- en gångbar kartlagd kant ligger inom tio meter; avvikelsen räknas i tid/längd,
- konkurrerande närliggande kanter faktiskt ansluter genom delade grafnoder
  inom 50 meter; en större korrelationsradie hittar även själva korsningen,
- en redan bunden busshållplats ligger inom 250 meter och kan nås över det
  filtrerade gångnätet i båda riktningarna inom 500 meter, inklusive avvikelser.

Återställda lägen blir inte nya bevis i en kedja. Projektioner som kolliderar
med etablerade lägen avvisas. Järnvägs-/tunnelbaneplattformar behöver fortsatt
uttrycklig identitet; tillträdeshinder, nivåskillnader och saknade gångvägar
ersätts inte med fågelvägsanslutningar. Namnmatchning ignorerar interpunktion
men behåller avståndsgränsen och entydig en-till-en-tilldelning av OSM-stolpar.

Lokalt på den låsta OSM-extrakten och GTFS-källan 2026-10-19 ökade täckningen
från 8 338 till 9 537 lägen, med 1 190 nya spatiala bindningar och ytterligare
namnmatchningar. 448 183 riktade gångpar, inga matrisfel. Det är partiellt,
automatiskt underlag, inte en platsgranskning.

## Kontroller vid varje gångbygge

`walking_audit.py` använder ett spatialt index för **samtliga hållplatspar inom
250 meter bland gångbyggets kandidater**, även olika namn. Rapporten skiljer obundna ändpunkter från
saknade riktningar/nätomvägar mellan bundna lägen. Alla rapporterade avstånd
är diagnostik; rapporten skapar inga gångvägar. Referensparen är regressionslarm
för konkreta exempel, inte regler som genererar anslutningar.

## Kontroll av en hel sökning

```sh
npx tsx scripts/audit_search.ts public/data settings.json report.json
```

`settings.json` innehåller det avkodade `s`-objektet från en delningslänk.
Kommandot verifierar filstorlek och SHA-256, laddar relevanta tidtabellstimmar
och kontrollerar alla befintliga gångkanter mot sökresultatet. En möjlig
förlängning av den faktiska resvägen ska aldrig ge sämre resultat än samma
resa plus gångtiden. Kvarvarande sammanhängande gångbudget och maxrestid
respekteras; överträdelser ger felstatus.

Dessutom rangordnas alla närliggande par med minst tio minuters misstänkt
skillnad, oavsett namn. Oanvända tidtabellslägen sorteras bort och par med två nåbara lägen prioriteras.
Dessa kräver granskning: en flod, järnväg, nivåskillnad
eller uttömd gångbudget kan förklara en skillnad. Misstänkta geografiska
skillnader räknas inte som bevisade routerfel.

## Användarens sökning 2026-10-21 08.07

Skärvik 9022001015503003, 120 minuter, 15 minuters gång, tre byten,
30 minuters avgångsfönster; samma publicerade tidtabell före/efter.
Lokalt beräknade restider före avrundning:

| Lägen | Före | Efter |
| --- | --- | --- |
| Kungsberga 1 / 2 | 64,02 / 103,20 min | 64,02 / 64,27 min |
| Folkets hus, Ölsta 1 / 2 | 69,78 / 99,43 min | 69,38 / 70,72 min |
| Esplanaden 3 / 4 | 96 / 76 min | 58,07 / 60,17 min |
| Stationsgatan 1 / 2 | 60,17 / 68,77 min | 60,17 / 60,23 min |
| Ekbacken 1 / Ekbackens äldreboende | 66 / 92 min | 66 / 69,58 min |

De sista leden följer riktiga gångvägar: 20 meter vid Kungsberga, 105 meter
vid Folkets hus, 193–227 meter från Stationsgatan till Esplanaden och 285 meter
från Ekbacken till äldreboendet. Resor och tider kan ändras med nästa tidtabell.

## Antagna byten mellan lägen med samma namn (v9)

På användarens uttryckliga begäran antas gång vara möjlig mellan **alla lägen
med samma namn inom 250 meter fågelvägen**, även mellan olika stoppområden.
Namn jämförs utan skillnader i versaler och blanksteg; interpunktion bevaras.
`scripts/assumed_walks.py` fyller bara riktningar som saknar kartlagd gångkant.
Avståndet uppskattas till fågelvägen × 1,25, tiden till 4,8 km/h med minst
60 sekunder. Tiden belastar samma sammanhängande gångbudget som annan gång.
Detta är ett medvetet undantag från kravspecens krav på enbart kartlagda
passager, inte en verifiering av tillgänglighet, nivåer eller barriärer.

Antagna kanter har egen källa och visas som **Gång · uppskattad** i resedetaljerna.
De skapar inga inbillade OSM-ankare eller gångytor. Den fysiska referensgranskningen
körs före dessa tillägg; rapporten skiljer `mappedPairs` från `assumedPairs`.
Lönnviksvägen, Skå flygfält, Toyota, Lammholmsbacken och Fruängsgården omfattas
av samma regel; inga hållplatsnamn finns hårdkodade i genereringen.

Ytjärnvägsplattformar kan dessutom bindas automatiskt när både namngivet
OSM-stoppområde och plattformsnummer identifierar samma unika kartlagda
plattform inom 25 meter. Underjordiska, osäkert uppskattade, tillträdesbegränsade
och tvetydiga plattformar avvisas. En biljettvalidator får användas när dess
kartlagda gångväg delar en verklig OSM-nod med en identifierad plattform.
Det möjliggör granskning av busstågbytet i Märsta utan hållplatsspecifika undantag.

## Stationsåtkomst och synlig kartvy (v10)

Närliggande järnvägsgeometri får inte blockera ett busshållplatsläge på en
separat, topologiskt verifierad gångväg. Plattformskanter filtreras nu bort
före val av ytankare, i stället för att hela hållplatsen avvisas när någon
plattform finns inom sökradien. Krav på verkliga grafnoder, korta tillåtna
nätvägar i båda riktningarna och betalda koordinatavvikelser kvarstår.
Tingsvägen–Sollentuna station är ett fysiskt referenspar: 153 meter / 116 sekunder
i den låsta extrakten, inte en specialregel i genereringen.

Namnnormaliseringen för **uppskattade** byten jämställer även ett avslutande
“station”: exempelvis “Upplands Väsby” och “Upplands Väsby station”.
250-metersgränsen och gångbudgeten kvarstår; riktningar som “station västra”
jämställs inte med grundnamnet. Det ger åtkomst via kartlagda bussterminaler
när tågens plattformsnummer saknas i OSM. Det skapar inga påhittade tågytor.

Gångytor hämtas för den synliga kartvyn med marginal för gångradien, och nya
underlag laddas vid panorering. Därmed kan inte tusentals avlägsna profiler
fördröja gångytorna runt den plats användaren tittar på.

## Beroenden mellan gånganslutningar (v11)

Två generella bortfall förklarade stora skillnader vid Bromma sjukhus och
Kvarnhagen. En identifierad OSM-hållplatsstolpe kunde ligga längre från gångvägen
än GTFS-koordinaten; då avvisades även den bättre GTFS-positionen. En globalt
entydig stolpmatchning inom 25 meter får nu också styrka GTFS-positionens egen
unika gångväg inom fem meter. Positionen flyttas inte till stolpen, och den
faktiska koordinatavvikelsen belastar gångtid och avstånd.

Återhämtning av närliggande hållplatslägen använde tidigare en enda ögonblicksbild
av kända anslutningar. Om grannläget blev godkänt i samma fas fick den nya
anslutningen aldrig prövas igen. Nu upprepas fasen tills inga fler lägen godkänns.
Varje läge måste fortfarande klara sina egna koordinat-, grafnods- och dubbelriktade
nätvägskontroller. Nätet kompletteras inte med uppskattade länkar mellan olika
namn; en tidigare återhämtad grannes ursprungliga koordinatavvikelse räknas också
in i kontrollens 500-metersgräns. Inga hållplatsnamn styr genereringsreglerna.

Sammanhängande gång visas som ett resesteg även när kartlagda och uppskattade
sträckor blandas. Alla mellanpunkter, tider och avstånd bevaras; steget markeras
uppskattat om någon del är uppskattad. Detta ändrar inte resans gångbudget.

Kontroll med publicerad tidtabell 2026-10-21 och användarens Skärvikssökning
08.07, 15 minuters gång och fyra byten, mot lokalt ombyggt gångindex:

| Lägen | Före | Efter (avrundat uppåt) |
| --- | --- | --- |
| Bromma sjukhus, tre lägen | 89 / 90 / 92 min | 60 / 61 / 63 min |
| Söderberga allé, två aktiva ordinarie lägen | 59 / 59 min | 59 / 59 min |
| Kvarnhagen i Hässelby | 96 min | 59 min |
| Hässelby slott, tre lägen | 58 / 58 / 61 min | 58 / 58 / 61 min |

I samma låsta OSM- och GTFS-underlag får 110 ytterligare lägen fysiska ankare,
utan att något tidigare ankare försvinner. Alla 48 riktade fysiska referensfall
klaras, och sökningens kontroll av gångförlängningar ger noll överträdelser.
Bromma sjukhus och Kvarnhagen har lagts till som referenspar. Andra närliggande
lägen kan fortfarande sakna kartunderlag eller ha en verklig barriär/gångbudget
och får därför inte kopplas ihop enbart på grund av kort fågelavstånd.

Alla hållplatslägen förutsätts ha någon gångbar utgång. Saknad anslutning är
en lucka i kartunderlaget eller matchningen, inte belägg för att gång är omöjlig.
Utgångens faktiska läge och väg behöver fortfarande matchas; stationsplattformar
får inte automatiskt anslutas till en närliggande väg på fel nivå.

Publicerat underlag: `sl-68faf7a7c92914d702f8`, GTFS 2026-10-21, gångversion v11.
Den publicerade versionen har 9 674 fysiska ankare, 109 fler än föregående
publicerade v10, samt 482 735 riktade gångpar. De 48 fysiska referensfallen
klaras. Samma publicerade sökning ger tiderna i tabellen ovan och noll
överträdelser i sökauditen. Lokal produktionsbyggd webbläsarkontroll med de
integritetskontrollerade publicerade datafilerna verifierar gångytor och
sammanslagna gångsteg vid Söderberga allé, Bromma sjukhus, Hässelby slott och
Kvarnhagen, fortlöpande stationsresultat och nollställning utan webbläsarfel.
Automatiska kontroller: 46 TypeScript-, 69 Python- och 34 webbläsartester.

## Station names in the possessive form (2026-10-21)

Lindholmen's train platforms have no direct mapped walking profile. Their nearby
bus stop, **Lindholmens station**, does. The previous suffix normalization left
`lindholmen` and `lindholmens` separate, so the train could be reached while the
walking-profile source stayed unreachable. This is a station-access gap, not
on-demand contour calculation failing.

The same general rule now recognizes a Swedish possessive `s` immediately before
`station`, provided the corresponding shorter name already exists within 250 m.
Exact names take precedence: `Hägernäs station` still matches `Hägernäs`, rather
than a hypothetical `Hägernä`. Directional suffixes, punctuation, the 250 m limit,
paid walking time and the existing physical paths remain respected. New aliases
never serve as evidence for additional name normalization. Missing directions
are still explicitly estimated under the user-authorized same-name assumption.

Against the published 2026-10-21 feed this adds 508 directed access links and gives
45 more stop positions outward access to a precomputed walking profile. It also
connects variants at Stocksund, Kragstalund, Ekskogen, Sundbyberg, Häggvik,
Jakobsberg and other stations; there are no hard-coded station names in the rule.
The user's Vallentuna 21:05 / 30-minute-walk query reaches Lindholmens station in
629 seconds, with 60 seconds of continuous walking used. Its precomputed profile
therefore has 29 walking minutes available. The whole-query audit finds zero
walking-extension violations.

`python scripts/walking_coverage.py --manifest PATH/manifest.json --output report.json --csv gaps.csv`
verifies the core file hashes and audits **all** stop positions, using directed
walking paths to existing precomputed profiles. It distinguishes a missing own
profile from missing access to every profile, and reserves at least one contour
minute. It does not invent walking exits. Every data build uploads the JSON and
CSV as the `sliso-walking-coverage` Actions artifact, outside Git.

Before this repair, 9,674 of 14,195 stop positions had their own profiles; another
1,707 could reach a profile within a 30-minute walking allowance. Afterward 1,752
can do so, leaving 2,769 without known profile access. These counts include old
and unused GTFS positions, and describe potential access with the full allowance.
A particular search can have less travel time or continuous walking left. Some
unresolved examples include Handen, Österskär, Segersäng and Gröndalsviken.

Walking geometry is already precomputed offline in one-minute increments up to
30 minutes for each mapped endpoint, stored in small spatial shards, verified
and cached by the browser. A query selects profiles using arrival time and its
remaining continuous walking budget. Viewport changes load only nearby profiles;
the browser combines and draws the polygons. Reusing the prepared walking cache
allows station-name corrections to publish without redoing OSM routing or contours.

### Reviewed public station passages (2026-10-21)

The Arlanda Terminal 4 search at 22:26 on 2026-10-21 reached only the origin
and three same-name positions. This was an exit-data gap, not an absence of
transport: SkyCity has bus 583 at 22:38, arriving at Märsta station at 22:53,
with train 41 at 23:00 arriving at Stockholm City at 23:37.

The pinned OSM extract has restricted bus carriageways, construction bridges,
and disconnected pedestrian fragments at Terminal 4. They remain restricted;
no global snap radius or road access rule was relaxed. The user authorized
individually reviewed walking links at airports and other similar places.

`data/reviewed-walking-access.json` records these passages separately from the
native OSM graph. Each connection needs named stop IDs, exact reviewed GTFS
coordinates, direction, positive duration/distance, a source, review date, public
passage description, and explanation of the estimate. The compiler validates
active endpoints every build; moved or renamed endpoints fail for another review,
and retired positions are not reintroduced. Native paths and their contours are
retained unchanged. These links have no native walking profile of their own;
ordinary continuous walking budget and remaining-time contour rules apply at
any native profiles reached through them. They do not create straight-line areas.

The first connection is Terminal 4 ↔ SkyCity, estimated at 6 minutes / 400 metres.
[Swedavia's terminal overview](https://www.swedavia.com/contentassets/333ee1bb4b644015a92dc5cb2c8d1b7f/arlanda-airport-oversiktskarta-arn.pdf)
shows the public terminal connection and 4 minutes between the former Terminal 4
hall (now the Terminal 5 C-gate hall) and SkyCity. Two additional minutes cover
bus-stop access. Airport rail-platform access is not inferred from this diagram.
Journeys explicitly label estimated walking; manifest warnings retain sources.
This mechanism supports other reviewed complexes, rather than linking arbitrary
nearby stops across different names, barriers or levels.

Replaying the exact public dataset with this connection reaches 5,885 stop
positions instead of 4. Stockholm City platform 2 is reached in 65 modelled
minutes (initial waiting excluded): walk 6 minutes, bus 583, walk at Märsta,
then train 41. The search witness/feasible-walk audit has zero violations.
Tests verify direction, provenance, coordinate drift, retired endpoints, cost
bounds, idempotent refresh, estimated journey labels and continuous walking
limits. An origin confined to a walking-only component without any mapped
profile now displays “Gångdata saknas” and explains that possible journeys can
be missing, rather than presenting the island as complete transport coverage.

### Exploring travel-time bands in the browser (2026-10-22)

The result legend now has inclusive ten-minute band buttons and a one-minute
“Visa inom” display slider. Both filter the completed search: search constraints,
transport results and colours retain their original maximum. Tapping the selected
band or “Visa alla” restores the full result. Stops beyond the display cutoff
are hidden, and a pinned journey to an excluded stop closes. A new search resets
the display cutoff; copied links preserve it through the optional, validated
`displayMinutes` field without changing the search budget or old link format.

Walking contours remain precomputed native data. The browser worker rasterizes
them into a single bounded viewport image, paints the fastest feasible band at
each pixel, and outlines boundaries between bands. Ring holes and disconnected
islands are retained at display resolution. There is no buffer, convex hull,
gap-filling or relaxation of walking access rules; sub-pixel detail is approximate
and is resampled when zooming. Stop times and journey witnesses are unchanged.
`walkingMinutes` still reserves the remaining continuous walking budget from all
feasible arrival labels, rather than using just the earliest stop arrival.

The worker caches the standard-band field and at most three partial-cutoff
masks. Its raster is limited to roughly one million pixels, and pixel buffers
are transferred rather than copied back as large polygon geometries. Verified
profiles load for the viewport with six concurrent requests and paint as batches
arrive. Stale viewport, cutoff and reset results are rejected. Raw profiles
outside the viewport are released; their checksum-verified browser disk cache
remains available. Changing the cutoff neither starts a transport search nor
fetches walking or timetable files. Profile counts and immutable data schemas
are unchanged; this feature needs no data release or routing server.

A production-bundle mobile emulation using the real 2026-10-21 data release and
an Arlanda departure on 2026-10-22 at 08:07 loaded and displayed the dense central
Stockholm viewport in about 13 seconds, including profile loading. A partial
91-minute cutoff updated in about 0.3 seconds with zero additional downloads.
These are local measurements, not a device-performance guarantee. Tests cover
fastest overlapping colours, holes, islands, partial thresholds, cache eviction,
progressive arrival, cancellation, viewport changes, stable colours, filtered
stop visibility, share restoration and absence of new searches/downloads.

### Declared station transfers across missing walking components (2026-10-23)

The point-origin search at 59.3361032, 18.0118006, 2026-10-23 16:26,
60-minute travel limit / 15-minute walking limit / three changes exposed missing
access at Odenplan, Stockholm City and Slussen's ferry piers. The feed already
contained positive, directed minimum-transfer rows for those connections, but
those rows only constrained vehicle boarding. They did not create a walk to the
destination platform. This forced journeys to approach isolated station parts by
vehicle, sometimes using a large detour.

The general `gtfs-station-access-v1` rule adds only explicit unscoped timed pairs
across previously separate walking components. It adds 674 directed links in
the pinned feed and grows the exact walking closure from 819,970 to 850,890 pairs.
Existing walking paths, restrictions, indices and physical contour geometry stay
intact. Costs are estimated from published transfer times; unknown distances stay
unknown. See [the full policy](../data/README.md#published-gtfs-station-connections).

Regression coverage includes direction, scoped/forbidden/zero-time rows, retirement,
preserving a longer existing mapped route and its one-way restriction, independent
provenance for every bridge, conservative duplicate handling, boarding minima
without double charging, continuous walking budget, immutable migration, and
byte-preserved footpath/contour delivery. Geographic diagnostics now exclude
retired presentation stops while retaining correctness checks on all routing nodes.
The offline search auditor also accepts point-origin sharing settings and uses the
same checksum-bound walking closure and mapped initial access as the application.
