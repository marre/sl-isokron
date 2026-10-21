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
250 meter**, även olika namn. Rapporten skiljer obundna ändpunkter från
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
skillnad, oavsett namn. Dessa kräver granskning: en flod, järnväg, nivåskillnad
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
