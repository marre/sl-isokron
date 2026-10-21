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
