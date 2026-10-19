# Kravspecifikation: isokronkartor med SL

Version 0.6 · 2026-10-19 · Underlag för implementation och teknisk förstudie

## 1. Syfte och status

En enkel webbtjänst som visar hur långt man kan resa från en vald SL-hållplats eller station med SL och gång mellan hållplatser. Användaren anger datum, avresetid och maximal restid. Första versionen visar nåbara SL-hållplatser och stationer, färgkodade i tydliga restidsintervall, med uppskattad restid vid klick. Den visar inte sammanhängande nåbara markområden. Gång från sista hållplatsen ut i omgivningen är ett stretch goal.

Tjänsten byggs först för eget bruk och några vänner, med möjlighet att senare öppnas för allmänheten. Driften ska vara kostnadsfri. Cloudflare är önskad värd och GitHub Actions får användas för databearbetning.

Dokumentet skiljer mellan **beslutade produktkrav**, **föreslagna standardvärden** och **tekniska hypoteser**. Bindande omfattning och funktionskrav anges i avsnitt 2–5 och tillhörande acceptansfall. Dataregler i avsnitt 6 beskriver beräkningsmodellens korrekthet. Avsnitt 7–8 beskriver tekniska kandidater och externa begränsningar; OSM, Valhalla, binära index och GitHub Actions är inte låsta implementationskrav. Prestandatal i avsnitt 9 är prototypmål tills mätning har genomförts. Ett arkitekturförslag innebär inte att prestanda eller gratisdrift redan har verifierats. Ingen implementation ingår i denna leverans.

Inspiration: [R. Mattilas artikel om isokroner][1]. Dess grundidé behålls, men användaren ska slippa kod, API-nycklar och manuell databearbetning. Beräkningen ska inte bygga på en separat reseplanerarfråga för varje punkt i ett rutnät.

## 2. Beslutad omfattning

| Område | Krav för första versionen |
| --- | --- |
| Riktning | Resor från en startplats till SL-hållplatser och stationer. |
| Platsval | Sök och välj SL-hållplats/station eller klicka på en hållplats på kartan. Godtycklig startadress och gång till första hållplatsen är stretch goal. |
| Tid | Val av avresetid och datum från idag till och med sju dagar framåt, begränsat av publicerad datatäckning. Planerade tidtabeller används. |
| Tidsgräns | En maximal restid, exempelvis 60 minuter. |
| Presentation | Hållplatser/stationer färgkodas efter restidsintervall, med legend och uppskattad restid vid klick. |
| Trafikområde | Hela SL:s trafikutbud, inklusive relevanta linjesträckningar utanför Stockholms stad och län. |
| Gång | Gång mellan SL-hållplatser ingår som alternativ till fordon och vid byten. En resa får också avslutas med gång till en annan SL-hållplats. Gång från/till godtyckliga platser och gångytor ingår inte. |
| Gånggräns | Justerbar maximal gångtid per sammanhängande gångsträcka. |
| Filter | Välj bort trafikslag och välj högst 0–4 byten, med 3 som standard. |
| Väntan | Väntan före första påstigning räknas inte; väntan vid byten räknas. |
| Användning | Mobil och dator, utan konto eller inloggning. |
| Delning | Länk som återskapar sökningens inställningar. |
| Respons | Responsivt gränssnitt med status och avbrytning. Några sekunders söktid är ett prototypmål. Successiva kartresultat införs endast vid behov efter mätning. |

Gång från godtycklig startplats till första hållplatsen, gångområden efter sista hållplatsen (”sista biten”), tvåpunktsfrågor, detaljerade reseförslag, bildexport, realtid, ankomsttidssökning, biljettpriser och användarkonton ingår inte i första versionen.

## 3. Restidens betydelse

### 3.1 Grundmodell

Kartans värde är **minsta beräknade restid bland tillåtna resor**, utan initial väntan. Det är inte samma sak som tidigaste ankomst från det valda klockslaget. Detta måste förklaras nära tidsvalet och i resultatets legend.

För en kollektivtrafikresa definieras:

- `t0`: valt datum och klockslag i Europe/Stockholm.
- `a`: eventuell gångtid från vald starthållplats till den hållplats där första påstigning sker.
- `d`: tidpunkt för första påstigning.
- `z`: tidpunkt för sista avstigning.
- `e`: eventuell gångtid efter sista avstigning till en annan SL-hållplats som är mål.
- `R = a + (z − d) + e`: restiden till målhållplatsen. Gång ut till godtycklig adress ingår inte.

Intervallet mellan första påstigning och sista avstigning inkluderar all färd, gång och väntan vid byten. Initial väntan `d − (t0 + a)` räknas inte i `R`. Påstigningen måste vara möjlig: `d ≥ t0 + a`, med nödvändiga tillträdes- och påstigningsmarginaler enligt modellen.

Exempel: vald tid 08.00 vid starthållplatsen, gång 5 minuter till en annan påstigningshållplats, första avgång 08.15, färd 20 minuter, byte med 7 minuter gång/väntan, färd 10 minuter till målhållplatsen. Kartans restid är **42 minuter**, medan ankomsten till hållplatsen är 08.52. De 10 minuternas initiala väntan ingår inte i restiden.

Direkt gång från starthållplatsen till en annan SL-hållplats får restiden lika med gångtiden och måste uppfylla både max restid och max gångtid per sträcka. Nåbarheten beräknas inte för godtyckliga mål utanför trafiknätet.

### 3.2 Inställningsbart avgångsfönster

Utan en gräns för första påstigning skulle en snabb avgång långt senare kunna avgöra kartans färg. Därför används ett **inställningsbart avgångsfönster W, med 30 minuter som standard**, där `t0 ≤ d ≤ t0 + W`, samtidigt som gång till hållplatsen måste hinnas med.

Inställningsbarheten och standardvärdet 30 minuter är bekräftade av beställaren. Inställningen visas under Fler alternativ, med en kort förklaring. Tillåtet intervall är ännu inte beslutat; förslag för prototypen är 5–120 minuter. Fönstret gäller första påstigning, inte samtliga byten. Gränsen innebär också att en initial gångsträcka längre än fönstret inte kan följas av en tillåten första påstigning.

Olika kartpunkter får utnyttja olika avgångar i fönstret. Kartan beskriver alltså bästa tillgängliga restid per målpunkt, inte en gemensam resa med samma faktiska starttid överallt.

### 3.3 Gång och byten

En gångsträcka är sammanhängande gång mellan start, påstigning, avstigning eller mål. Den återställs inte genom att dela upp en väg i kartsegment, passera en hållplats eller göra en paus. Alla gångsegment före nästa påstigning måste summeras mot gånggränsen.

Förvalt förslag: gånghastighet 4,8 km/h och högst 15 minuters gång per sträcka. Hastigheten ska dokumenteras; justerbar hastighet kan tillkomma senare. Gränsen är inte ett tak för total gång under resan.

Ett byte är övergång till ett annat fordon efter första påstigning. Noll byten tillåter en kollektivtrafikdel plus gång. Att sitta kvar i samma fordon ska inte räknas som byte när underlaget säkert beskriver detta. Om fordonskontinuitet inte kan styrkas används en dokumenterad konservativ modell.

Modellerade gångförbindelser ska följa gångvägar och beakta dokumenterade vattenhinder, broar, tillträdesbegränsningar och stationsanslutningar. Fullständig verklighetstäckning av varje entré och passage garanteras inte. Fågelvägsavstånd får inte ersätta gångvägar i ett färdigt resultat. Saknade anslutningar ska ge ett tydligt datagap, inte en påhittad genväg.

## 4. Funktionella krav

| ID | Krav och verifierbar innebörd |
| --- | --- |
| F01 | Användaren kan söka SL-hållplats/station lokalt i hållplatsdata, välja bland namngivna träffar och se valet på kartan. Svensk text stöds. Ingen extern adressökning krävs. |
| F02 | Klick på en SL-hållplats ändrar startpunkt. Klick utanför nätet väljer inte automatiskt en startadress. En stationsträff måste följas av val av ett namngivet hållplatsläge, om flera finns. Första versionen startar vid detta hållplatsläge, redo att gå eller resa från t0. Övriga lägen nås via modellerade gångförbindelser; samtliga plattformar får inte samtidigt få noll gångtid. Entrébaserad start kan tillkomma senare. |
| F03 | Datum och tid tolkas i Europe/Stockholm även för en besökare i annan tidszon. Valbara datum är idag till och med idag + 7 kalenderdagar i Europe/Stockholm, inom publicerad datatäckning. Övriga datum avvisas tydligt. Efterföljande trafikdygn måste ändå laddas när en tillåten resa fortsätter över midnatt. |
| F04 | Maximal restid kan ändras. Förslag: 60 minuter som standard och intervallet 10–120 minuter. Begränsningarna ska visas. |
| F05 | Gånggräns per sträcka kan ändras under Fler alternativ. Förslag: 5–30 minuter; 15 som standard. |
| F06 | Trafikslag kan väljas bort: buss, tunnelbana, pendeltåg, spårvagn/lokalbana och SL-båt. Exakt gruppering verifieras mot datan. Alla ingår som standard. |
| F07 | Max byten kan väljas: 0, 1, 2, 3 eller 4, med 3 som standard. Gränsen visas och ingår i delningslänken. Obegränsade byten ingår inte i första versionen. En avbruten sökning får inte framställas som färdig. |
| F08 | Om alla trafikslag väljs bort visas enbart direkt gånganslutna SL-hållplatser, tydligt märkta som gång. Om inga sådana anslutningar finns visas ett tomt resultat med förklaring. |
| F09 | Hållplatser/stationer tilldelas diskreta färgklasser, föreslaget i 10-minutersintervall. Sista intervallet klipps vid vald maxtid. Exakt gränsvärde tillhör det lägre bandet, exempelvis 10 minuter i 0–10. |
| F10 | Klick på en hållplats/station visar namn, uppskattad restid till målhållplatsen och om resultatet är preliminärt. Klick utanför trafiknätets målpunkter ger inget restidsvärde. |
| F11 | Okänd/ej färdigberäknad hållplats skiljs från hållplats som inte kan nås inom valda gränser. Ofärdig beräkning får inte framställas som komplett. |
| F12 | Beräkning kan avbrytas. Nya inställningar får inte blandas med äldre delresultat. Kartan kan panoreras och zoomas medan beräkningen pågår. |
| F13 | Delningslänken innehåller hållplats-ID och identifierande namn/koordinater, datum, tid, maxtid, gånggräns, trafikslag, bytesgräns, avgångsfönster och formatversion. Mottagaren behöver inget konto. |
| F14 | Delningslänken återskapar inställningarna mot då tillgängliga data. Den garanterar inte historiskt identiska resultat. Om hållplats-ID har försvunnit ska användaren få välja ersättare, utan tyst flytt av startpunkten. Saknas datumet erbjuds ett nytt datum utan tyst ändring. |
| F16 | Avgångsfönstret kan ändras under Fler alternativ och har standardvärdet 30 minuter. Ändring utlöser ny beräkning och följer med i delningslänken. |
| F15 | Gränssnittet visar tidtabellens uppdateringsdatum, giltighet, att realtid saknas och att initial väntan är exkluderad. |

## 5. Användarflöde och gränssnitt

1. Öppna tjänsten och se Stockholmsområdet med ett enkelt sökformulär.
2. Välj startplats, datum/tid och maximal restid.
3. Öppna vid behov Fler alternativ för gång, trafikslag och byten.
4. Tryck Visa restidskarta. Visa separata steg för dataladdning och beräkning.
5. Visa beräkningsstatus och därefter färdigt resultat. Delresultat på kartan är ett valfritt tillägg om prototypen visar att väntetiden motiverar det.
6. Klicka för restid eller kopiera delningslänk.

Svenska är första språk. Mobilvyn använder en kompakt panel som inte täcker hela kartan. Färger ska gå att skilja även vid vanliga typer av färgseendenedsättning; intervall anges också med text. Formulär, legend och delning ska kunna användas med tangentbord och ha tydliga etiketter/fokusmarkeringar. Källangivelser får inte döljas bakom mobilpanelen.

Ingen geolokaliseringsbehörighet efterfrågas. Ingen inloggning krävs av slutanvändaren; driftansvarig kan behöva leverantörskonton och API-nycklar.

## 6. Data och beräkningskvalitet

### Trafikdata

Huvudkandidat är **GTFS Regional, SL** via Trafiklab. Den innehåller planerad trafik och uppdateras dagligen. Hämtning kräver API-nyckel. Dokumentationen anger 50 hämtningar per månad på Bronze-nivån: daglig hämtning ryms med begränsat utrymme för omkörningar [2]. Nyckeln ska bara användas i byggmiljön.

Före implementation ska SL-täckningen inventeras per linje/trafikslag, särskilt båtar, lokalbanor och gränsöverskridande sträckor. Hela SL betyder inte automatiskt all kollektivtrafik i länet, Waxholmsbolaget eller andra operatörer. Saknat utbud får inte tyst utelämnas ur påståendet om täckning.

Motorn ska hantera faktiska trafikdagar och kalenderundantag, turer över midnatt, hållplatslägen, tillåtna på-/avstigningar och bytesregler. Trafiklabs regionala data använder enligt dokumentationen `calendar_dates.txt` för faktiska trafikdatum [2]. Tid över 24.00 ska knytas till rätt trafikdygn. Sommartidsbyten ska testas och tvetydiga/ogiltiga lokala klockslag hanteras uttryckligt.

### Gånganslutningar och presentation av trafiknätet

Första versionen behöver inga gångisokroner, ytraster eller heltäckande regionalt gångnät i webbläsaren. Den behöver verifierade gångtider mellan hållplatser, både vid byten och som alternativ till kollektivtrafik. Startpunkten är en vald SL-hållplats eller station. Gång kan ske före första påstigning och efter sista avstigning så länge båda ändarna ligger i SL-nätet. Direkt gång mellan hållplatser tillåts också. Sammanhängande gång summeras mot gånggränsen även när flera mellanliggande hållplatser passeras.

Inventera vilka bytesförbindelser och tider SL-underlaget faktiskt innehåller. Saknade förbindelser får inte antas vara gångbara eller ta noll minuter. Komplettering kan ske med ett begränsat förberäknat bytesindex. Tekniskt huvudförslag är att förberäkna kompletterande gångförbindelser från OpenStreetMap med en lokal routingmotor i byggmiljön. Annan lösning får väljas om den uppfyller produktkraven och gratisdriften. Använd gångprofil, verkliga entréer/hållplatslägen och kontrollerade stationsanslutningar. SL:s bytesregler ska fortfarande respekteras. Att resultatet bara täcker SL-nätet innebär inte att enbart SL-data säkert räcker för gång mellan stationer.

Resultatet visas som hållplats-/stationsmarkörer med restidsfärger. Linjegeometrier kan visas som orientering om de finns, men får inte antyda att man kan stiga av mellan hållplatser. Inga fyllda ytor eller fågelvägscirklar ska framställas som nåbara områden. Vid gruppering av hållplatslägen ska det framgå vilket läge den visade bästa restiden avser; en stationsmarkör garanterar inte att alla utgångar nås vid samma tid.

### Förberäknat gångunderlag

Gångtider mellan SL-hållplatser ska förberäknas och distribueras som ett separat, versionsmärkt dataset. Ingen extern gång-API-förfrågan ska behövas för en vanlig användarsökning. Webbläsaren behöver inte det fullständiga gatunätet.

1. Inventera den aktuella SL-feedens `transfers.txt`, hållplatshierarki och eventuella interna gångförbindelser. Redovisa vilka hållplatspar och typer av regler som faktiskt finns. Dokumentation om formatet räcker inte som bevis för att en viss förbindelse finns i SL-filen.
2. Skilj på **gångtid** och **minsta bytestid**. `min_transfer_time` beskriver tillgänglig tid som krävs mellan ankomst och avgång och kan inkludera marginal utöver själva gången [14]. Det får inte automatiskt räknas som fysisk gångtid mot användarens gånggräns.
3. Komplettera med gångtider från ett verifierbart gångunderlag; föreslagen lösning är OSM och en gångroutingmotor. För varje hållplatsläge görs en begränsad sökning till största stödda gångtid. Förslaget är 30 minuter, men gränsen fastställs tillsammans med reglagets tillåtna intervall.
4. Spara nåbara hållplatspar med riktning, gångtid i sekunder, datakälla och nödvändiga villkor. Filtrera dessa tider mot användarens valda gånggräns vid sökning. Sparas bara förbindelser upp till 30 minuter får gränssnittet inte erbjuda längre gång utan ett nytt dataset.
5. Uppdatera gångunderlaget oberoende av tidtabellen när OSM, hållplatslägen, entréer eller beräkningsprofil ändras. Föreslagen periodisk kontroll är månadsvis, med extra bygge vid relevanta förändringar. Datasetet ska ange vilka hållplats-ID:n och koordinater det byggdes mot; ändrade hållplatser får inte kopplas till inaktuella gångtider utan kontroll.

När en resa använder ett byte ska både den fysiska gångtiden och tillämpliga SL-bytesregler uppfyllas. En minsta bytestid som redan innefattar gång ska inte adderas till gångtiden en gång till: normalt krävs ett tidsutrymme som är minst det största av gångtid och tillämplig minsta bytestid. Turbundna regler, förbjudna byten och stationshierarki måste hanteras enligt sin faktiska betydelse. Saknas fysisk gångtid får en bytestidsregel inte ensam framställas som verifierad gångförbindelse.

Gångtiderna modelleras i huvudsak som tidsoberoende vid en dokumenterad gånghastighet. Detta gäller inte automatiskt tillgängligheten: generell öppettidsrouting ingår inte i första versionen. Kända nattstängda entréer, passager med öppettider och andra kända tidsbegränsade förbindelser utesluts ur det statiska gångnätet. Detta kan ge konservativa resultat även dagtid. Okända eller saknade öppettider innebär en dokumenterad datakvalitetsbegränsning, inte ett löfte om faktisk tillgänglighet. En gångväg ska inte antas vara öppen dygnet runt enbart för att gångtiden är konstant.

Två resultattyper ska hållas åtskilda:

| Resultat | Omfattning |
| --- | --- |
| Gångtider mellan hållplatslägen | Krävs i första versionen; används för byten, gångalternativ och gång till en avslutande SL-hållplats. |
| Restidsraster eller flera gångkonturer runt hållplatser | Stretch goal för områden utanför SL-nätet. Kan genereras från samma routingunderlag, men behöver inte byggas eller laddas i första versionen. |

En enda polygon för exempelvis 15 minuter ger inte gångtiden till varje punkt innanför gränsen. Polygonmedlemskap ska därför inte ersätta gångtider mellan hållplatser. För framtida gångområden måste upplösning, tidssteg och approximation specificeras; exempelvis ger 5-minuterskonturer intervall snarare än exakta tider. Samma OSM-underlag kan återanvändas, men en lista med hållplatspar räcker inte ensam för att återskapa alla gångområden.

### Verifiering och datakvalitet

Korrekthet ska verifieras mot den publicerade beräkningsmodellen och testdatan. Första versionen lovar inte ett fullständigt eller felfritt underlag för varje entré, plattform och gångpassage i verkligheten. Leveransen ska innehålla en känd-fel-/täckningslista, granskade stationsfall och dokumentation av antaganden. Saknade förbindelser ska inte fyllas med fabricerade tider; perfektion i hela nätet är inte en lanseringsgrind. De granskade referensfallen ska däremot ha förklarade resultat och inga kända modellfel.

Använd en liten syntetisk tidtabell och gånggraf som oberoende facit för tidsmodellen. Komplettera med minst 30 manuellt granskade SL-resor som täcker innerstad, ytterområden, båt, lokalbana, natt, helg och byten. Jämförelse med reseplanerare måste normalisera initial väntan och avgångsfönster; samma startklockslag innebär annars olika frågor.

## 7. Föreslagen arkitektur – ska verifieras

**Huvudspår: statisk webbapp på Cloudflare Pages, daglig databearbetning i GitHub Actions och sökning i en Web Worker i webbläsaren.** Detta minskar serverberäkning per besökare. En större första nedladdning får provas med tydlig förloppsindikator; storleksbudget är ännu inte beslutad.

| Del | Ansvar |
| --- | --- |
| Datapipeline | Hämta tidtabell och nödvändiga bytesförbindelser, validera, bygga kompakta index och publicera en sammanhängande dataversion. |
| Statisk distribution | Leverera app, manifest och versionsmärkta datapaket från Cloudflare. |
| Web Worker | Utföra sökning i trafiknätet med gånganslutningar utan att blockera gränssnittet. |
| Kartlager | Rita bas- och resultatkarta, legend och klickinformation. |
| Lokal cache | Återanvända verifierade datapaket; rensa gamla versioner och hantera nekad/full lagring. |
| Valfri liten backend | Inget behov i huvudspåret för första versionen. Extern adress-/gångtjänst kan tillkomma med stretch goals. |

Dela data i paket efter exempelvis trafikdag och geografi, utan att kapa resor som passerar paketgränser. Tjänsten ska fungera även när beständig webbläsarlagring inte kan användas, med förnyad hämtning och tydlig information.

Utvärdera en tidtabellsbaserad algoritm såsom RAPTOR eller Connection Scan med nödvändiga anpassningar. **En vanlig sökning efter tidigaste ankomst är inte tillräcklig:** senare första påstigning kan ge kortare visad restid. Motorn måste behålla relevanta alternativa tillstånd för faktisk ankomst, visad restid, gång och byten. Dominansregler får inte kasta bort en resa bara för att den anländer senare. Verifiera mot uttömmande sökning i små testnät innan optimering.

Progressiv kartvisning är valfri och beslutas efter prototypmätning. Om den införs ska resultaten komma från genomförbara resor. Nya alternativ får sänka uppskattad restid och lägga till nåbara hållplatser. Delresultat märks som preliminära tills sökningen är färdig. Körningar identifieras så att sena meddelanden från avbrutna sökningar ignoreras.

Ramverk, kartbibliotek och eventuell WebAssembly väljs efter förstudien. Produktkraven låser inte programmeringsspråk.

### Datastorlek – ny avgränsning

Tidigare uppskattningar om 10–50 MB för en sökning och 50–200 MB eller mer för ett regionalt paket inkluderade gångnät/gångytor. De är inte längre budgetunderlag för första versionen. Ingen ny numerisk uppskattning fastställs innan ett verkligt trafikdatapaket har byggts och mätts.

Webbläsaren ska i första hand hämta kompakta tidtabellsindex för relevant tid, hållplatser, bytesförbindelser och eventuella linjegeometrier. Ett regionalt gångnät och gångpolygoner ingår inte. Starthållplatsen söks lokalt i hållplatsdata. Bakgrundskartan kvarstår som separat beroende; ingen adressökning eller gång-API behövs per användarsökning i huvudspåret.

Förstudien ska mäta komprimerad överföring, uppackad storlek och arbetsminne separat. Publicera inte rå GTFS eller stora JSON-objekt om kompakta index kan användas. Cacha hållplats-/bytesdata separat från tidtabeller när versioneringen medger det. Mindre data är en förväntad fördel med avgränsningen, inte ett verifierat storlekslöfte.

Tidsurvalet måste inkludera alla förbindelser som kan användas fram till senaste möjliga ankomst, inte bara första avgångsfönstret. För ett fönster W och max restid T är t0 + W + T en säker övre tidsgräns, med rätt hantering av föregående trafikdygn och natturer. Geografisk partitionering får inte skära bort giltiga förbindelser utanför det synliga kartutsnittet.

## 8. Gratisdrift och externa tjänster

Kontrollerat mot officiell dokumentation 2026-10-18. Gränserna är en planeringsgrund och ska kontrolleras igen inför driftsättning.

| Resurs | Förutsättning och konsekvens |
| --- | --- |
| Cloudflare Pages Free | 25 MiB per fil, 20 000 filer och 500 byggen/månad enligt dokumentationen [3]. Paket måste rymmas inom filgränserna. |
| Workers Free | 100 000 anrop/dag, 10 ms CPU per HTTP-anrop och 128 MB minne [4]. Tung regional ruttberäkning läggs därför inte här i huvudförslaget. |
| GitHub Actions | Standardrunners i publika repo är gratis; privata repo har kontoberoende fria kvoter. Lagring och cache behöver också budgeteras [5]. Publikt repo är ett förslag, inte ett godkänt publiceringsbeslut. |
| Adressökning (endast stretch goal) | Offentliga Nominatim tillåter inte autocomplete och har högst 1 anrop/sekund för hela applikationen [6]. Möjligt pilotspår är explicit sökknapp med gemensam begränsning/cache. Autocomplete kräver annan tillåten lösning eller eget index. |
| Bakgrundskarta | OSM-data är inte samma sak som obegränsad gratis tile-hosting. Offentliga karttiles har användningspolicy, attribuerings- och cachekrav [7]. Välj leverantör/lösning och verifiera användningsvillkor före pilot. |

En Cloudflare-underdomän ska räcka; eget domännamn är inget krav. Ingen betald plan, betald överförbrukning eller betald reservtjänst får vara nödvändig. Använd inte en fakturerad produkt enbart med antagandet att dess gratiskvot aldrig överskrids. R2 är därför inte ett beslutat beroende.

Bygg ett kvotunderlag för trafikdata, sökning, karttiles, CI, lagring och eventuella backendanrop. Vid uppnådd gräns ska berörd funktion pausa eller återanvända giltiga data, utan att slå över till betald användning. Lokal hållplatssökning och beräkning ska inte bero på ett adress-API.

Verifiera licenser, attribuering och rätt att distribuera bearbetade trafik- och gångdata före publicering. Konfigurera utbytbara kart- och söktjänster. Gratisdrift för liten användning innebär inte ett löfte om obegränsad publik trafik.

### Alternativ för gångförberäkning och API-kostnad

Bedömning 2026-10-19. Första versionen behöver gångtider mellan hållplatser, inte gångpolygoner. Använd en lokal motor, exempelvis Valhalla, med OSM-utdrag och gångprofil. Valhalla stödjer matriser och isokroner [8]. Regionala utdrag finns hos Geofabrik [9]. Databygget kan provas i GitHub Actions; minne, körtid och fria kvoter måste mätas. OSM-data kräver attribuering och efterlevnad av ODbL vid distribution av härledda databaser [10]. Ingen API-avgift tas ut när beräkningen körs lokalt; beräknings- och lagringsresurser är inte automatiskt obegränsade eller gratis.

Beräkna en gles lista över gångbara hållplatspar inom största stödda gångtid. Spara exempelvis från-ID, till-ID och gångtid i sekunder. Geografiskt avstånd får användas för säker kandidatfiltrering, men verkligt gångnät bestämmer tiden. Hantera entréer, trappor, tillträde och stationsspecifika bytestider; använd inte en bilprofil eller automatiska färjeöverfarter som gång. Tider kan vara riktade. Testa bland annat förbindelsen Mörby station–Danderyds sjukhus mot faktisk gångväg. Inga gångtider för exemplet är ännu verifierade.

Mapbox är ett alternativ att utvärdera, inte ett beslutat beroende. Matrix API ger gångtider mellan punktpar och debiteras per matriselement, inte per HTTP-anrop [11]. Isochrone API ger områden och är relevant främst för stretch goal. En polygon ger inte en exakt gångtid till varje annan hållplats.

Enligt prislistan [12] är de första 100 000 matriselementen respektive isokronanropen per månad gratis. Nästa intervall, upp till 500 000, kostar 2 USD per 1 000 enheter. Illustrativa exempel, med outnyttjad gratiskvot och exklusive skatt/andra tjänster:

| Exempel per månad | Enheter | API-kostnad |
| --- | ---: | ---: |
| 5 000 hypotetiska hållplatser × 20 riktade gångmål | 100 000 matriselement | 0 USD |
| 5 000 × 40 gångmål | 200 000 matriselement | 200 USD |
| 5 000 hållplatser × 1 isokronanrop | 5 000 anrop | 0 USD |
| Samma isokronbygge dagligen i 30 dagar | 150 000 anrop | 100 USD |

5 000 hållplatser är ett räkneexempel, inte en inventerad SL-siffra. Faktisk fakturering beror på returnerade matriselement, omkörningar och övrig kontoanvändning. Full alla-till-alla-matris ska undvikas. Isokron-API:et kan returnera upp till fyra tidskonturer i samma anrop [13]; tätare tidsintervall kan kräva fler anrop.

Rätt att permanent lagra och distribuera Mapbox-resultat måste klarläggas separat före val av API. Den länkade produktvillkorsfilen kunde inte läsas vid denna genomgång; prisnivån bevisar inte sådan rätt. För gratiskravet får Mapbox inte väljas utan verifierat sätt att stoppa förbrukning innan debitering. OSM med egen batchberäkning rekommenderas som huvudspår, medan polygoner runt hållplatser skjuts upp.

## 9. Prestanda och driftkrav

Följande mätbara mål föreslås för piloten, inte som redan uppnådda resultat:

- Prototypmål med nödvändiga data i cache: färdigt resultat helst inom **3 sekunder**. Mät även andelen körningar som är färdiga inom **30 sekunder**. Dessa tal är inte bindande acceptansgränser före mätning. Om väntetiderna blir långa utvärderas optimering och därefter progressiv kartvisning.
- Längre körning är tillåten med tydlig status och möjlighet att avbryta. Kartan behöver inte visa delresultat. En tidsgräns eller avbruten körning får aldrig tyst betecknas som ett färdigt resultat.
- Första besöket mäts separat: överförda byte, nedladdning, uppackning, indexering, minnesåtgång och beräkning. Ingen utlovad nedladdningsstorlek innan mätning.
- Referenstest: minst en medelklassmobil och en vanlig bärbar dator, med angiven modell, webbläsare och nätprofil. Testa Safari/iOS, Chrome/Android och Edge/Chrome på dator.
- Kartan och kontrollerna ska vara användbara under beräkning. Mobilen får inte krascha eller få fliken omladdad av minnesbrist i referensfallen.

Datapipelinen körs föreslaget dagligen. Eventuellt kompletterande bytesunderlag versionsmärks och uppdateras separat; inget regionalt gångnät krävs för första versionen. Publicera manifest och datapaket atomärt; blanda inte versioner. Behåll senast fungerande version vid misslyckat bygge. Gamla data får bara användas om sökdatum fortfarande täcks, med synlig varning om uppdateringsproblem.

Fel ska skilja på nätverksproblem, kvotgräns, saknad tidtabell, saknad gånganslutning och inga möjliga resor. Driftansvarig ska kunna se senaste lyckade uppdatering och datavalidering. API-nycklar ska lagras som CI-/serverhemligheter och inte finnas i apppaket, länkar eller loggar.

Delningsdata föreslås ligga i URL-fragmentet, med hållplatsidentitet, för att minska spridning till serverloggar. Startvalet är fortfarande synligt för alla med länken. Ingen analys eller central historik över användarnas sökningar krävs. Gränssnittet ska förklara vad en delningslänk innehåller.

## 10. Acceptansfall

| ID | Test | Förväntat resultat |
| --- | --- | --- |
| A01 | Genomför en sökning med 60 minuters gräns. | Färgband och klickvärde följer samma restidsmodell och maxgräns. |
| A02 | Använd räkneexemplet i avsnitt 3. | 42 minuter visas, inte 52. Om målet i ett utökat test ligger 8 minuters tillåten gång bort vid en annan SL-hållplats visas 50 minuter. |
| A03 | Öka väntan vid byte med 5 minuter i testdata. | Restiden ökar med 5 minuter; initial väntan är fortsatt exkluderad. |
| A04 | Två gångsträckor på vardera 12 minuter, gånggräns 15. | Resan kan tillåtas trots sammanlagt 24 minuter gång. |
| A05 | En gångsträcka på 16 minuter uppdelad på flera grafkanter. | Resan avvisas med 15-minutersgräns. |
| A06 | Direkt gång till en SL-hållplats 16 minuter bort, gånggräns 15. | Hållplatsen visas inte som direkt gångnåbar, även om max restid är 60. |
| A07 | Välj bort buss eller sätt max byten till 0. | Inga resultat får bygga på buss respektive fordonsbyte. |
| A08 | Två första avgångar ger olika ankomsttid och visad restid. | Kortaste visade restid vinner även om ankomsten är senare, förutsatt giltigt avgångsfönster. |
| A09 | Avgången ligger utanför valt fönster eller går innan gånganslutningen hinns med. | Resan används inte. |
| A10 | Startplats eller byteshållplatser på varsin sida om vatten utan gångförbindelse. | Ingen gånggenväg skapas. Kartan fyller inte markområden mellan nåbara hållplatser. |
| A11 | Sök över midnatt, kalenderundantag och sommartidsgräns. | Rätt trafikdygn/tidszon används; tvetydiga tider hanteras uttryckligt. |
| A12 | Byt startpunkt mitt i en beräkning. | Äldre delresultat påverkar inte den nya kartan. |
| A13 | Öppna delningslänk på annan enhet och i annan tidszon. | Samma inställningar och Stockholmstid återställs. |
| A14 | Data saknas eller körningen avbryts. | Okänt/ofärdigt visas; ingen felaktig slutsats om onåbarhet. |
| A15 | Överskrid testkvot eller simulera misslyckad datapipeline. | Ingen betald reservlösning används; tydligt fel eller giltig tidigare version. |
| A17 | Ändra avgångsfönstret från 30 till 60 minuter och dela sökningen. | En första avgång efter 45 minuter blir tillåten om övriga villkor uppfylls; länken återställer 60 minuter. |
| A19 | Gångtid 4 minuter och tillämplig minsta bytestid 7 minuter. | Bytet kräver minst 7 minuter, inte 11. Gånggränsen belastas med 4 minuter. |
| A20 | En förbindelse går genom en nattstängd passage. | Förbindelsen utesluts ur första versionens statiska gångnät och begränsningen dokumenteras. Ingen generell öppettidsrouting krävs. |
| A21 | Datasetet innehåller gångtider upp till 30 minuter; användaren väljer 10 respektive 15. | Samma dataset återanvänds och rätt gångtidsfilter tillämpas utan externa gånganrop. |
| A22 | En hållplats flyttas eller byter ID i tidtabellsunderlaget. | Inkompatibla gångförbindelser upptäcks före publicering och byggs om eller markeras som saknade. |
| A23 | Välj en station med flera hållplatslägen. | Användaren väljer ett namngivet startläge. Andra lägen får bara nås via modellerad gång; ingen kostnadsfri start på samtliga plattformar. |
| A24 | Välj datum idag + 7 respektive idag + 8. | Det första tillåts om data finns; det andra avvisas. Nattresa från sista tillåtna datum kan använda nästa trafikdygn om det täcks av data. |
| A25 | Välj bytesgräns och öppna en delningslänk. | Endast 0–4 accepteras; standard är 3. Länkar med högre värde förklaras som ej stödda och ändras inte tyst. |
| A18 | Klicka på en nåbar hållplats och därefter en punkt utanför trafiknätet. | Hållplatsen visar restid till målhållplatsen, inklusive eventuell avslutande gång inom SL-nätet. Den andra punkten får ingen uppskattad restid eller gångyta. |
| A16 | Kör referenssökningar med varm och tom cache på mobilen. | Mätvärden redovisas mot målen i avsnitt 9. |

## 11. Genomförande i ordning

### Steg 1: teknisk förstudie

Hämta en aktuell SL-feed, inventera täckning och licenser, inventera faktiska bytesdata och skilj bytestider från fysisk gångtid. Bygg ett separat versionsmärkt gångdataset mellan SL-hållplatser, föreslaget från OSM, med fast maximal gångtid. Kontrollera kända öppettidsbegränsningar och hållplatskopplingar i referensfallen. Generell öppettidshantering och fullständig manuell inventering ingår inte. Mät det avgränsade trafikdatapaketets storlek/minne. Implementera först en minimal verifierbar sökkärna med rätt tidsmodell. Testa minst 20 startplatser spridda över SL:s område, inklusive båt, ytterområden och bytesintensiva resor, med 30/60/120 minuters gräns.

Leverera mätprotokoll, kvotbudget och beslut om datapartitionering, karta och lokal hållplatssökning. Verifiera prestanda även med ett större avgångsfönster och besluta dess tillåtna intervall. Om gratisdrift eller mobilprestanda inte håller ska omfattning/representation diskuteras; byt inte tyst till betald drift eller felaktig ruttmodell.

### Steg 2: fungerande första version

Implementera hållplatslägesval, tidsval, filter, resultatkarta, status, avbrytning, klickvärden och delningslänk. Successiv kartuppbyggnad införs bara om den valts efter prototypen. Koppla in daglig datapipeline och versionshantering. Verifiera acceptansfallen.

### Steg 3: pilot med några användare

Mät verkliga mobila laddtider, minne och begriplighet. Kontrollera särskilt att användarna förstår initial väntan och preliminära resultat. Justera föreslagna standardvärden och markörtäthet efter mätning.

### Steg 4: eventuell publik lansering

Gör ny kapacitets- och leverantörsbedömning för karttiles och datadistribution, granska tillgänglighet och datatäckning och verifiera att tjänsten fortfarande ryms i kostnadsfri drift.

## 12. Framtida funktioner

**Stretch goal – startplats till första hållplats:** adress-/platssökning, fri kartmarkör och gånganslutning från godtycklig startpunkt. Utvärdera gångtjänst eller lokalt nät när funktionen införs.

**Stretch goal – sista biten:** gång från sista avstigningshållplatsen till omgivningen och därmed sammanhängande nåbarhetsytor. Då tillåts avslutande gång `e` även till mål utanför SL-nätet, begränsad per gångsträcka, och även gångområden direkt från startplatsen kan visas. Utvärdera extern gångtjänst eller förberäknade gångområden, inklusive datamängd, kvoter, lagringsrätt och korrekt hantering av vatten/hinder. Detta är inte ett leveranskrav eller databeroende för första versionen.

1. **Tvåpunktsfrågor:** exempelvis överlapp av två nåbarhetsområden. Exakt fråga ska kravställas: nåbart från två startpunkter är inte samma sak som lämpliga bostadsområden med resor till två arbetsplatser. Det senare kräver omvänd riktning och eventuellt ankomsttider.
2. **Reseförslag vid klick:** gångsträckor, avgångar, linjer och byten för den resa som faktiskt ligger bakom restidsvärdet. Sökmotorn bör möjliggöra senare rekonstruktion eller ny punktsökning med identisk semantik.
3. Bildexport, fler tidsprofiler och jämförelse mellan olika avresetider.
4. Obegränsade byten, längre valbar datumhorisont, entrébaserad stationsstart och tidsberoende gångvägar kan utvärderas senare.

## 13. Beslutslista före implementation

| Beslut | Status |
| --- | --- |
| Resultat enbart på SL:s trafiknät; sista gångdelen är stretch goal | Bekräftat 2026-10-19. |
| Start från SL-hållplats/station; gång från godtycklig startplats är stretch goal | Bekräftat 2026-10-19. |
| Gång mellan SL-hållplatser, även till en avslutande målhållplats | Ingår. OSM-förberäkning föreslås; datakvalitet och byggresurser verifieras. |
| Högst 0–4 byten, standard 3; datum idag till idag + 7 | Bekräftad förenkling 2026-10-19. |
| Stationsval preciseras till namngivet hållplatsläge | Modell för första versionen; inga fria förflyttningar mellan plattformar. |
| Generell öppettidsrouting och obligatorisk progressiv karta | Utgår ur första versionens krav. Kända tidsbegränsade gångförbindelser utesluts. |
| Initial väntan exkluderas, gång begränsas per sträcka | Bekräftat. |
| Större första nedladdning får utvärderas | Tolkning av beställarens svar; ingen storleksgräns beslutad. |
| Inställningsbart fönster för första påstigning, standard 30 minuter | Bekräftat. Tillåtet intervall återstår att välja. |
| 15 min gång, 4,8 km/h, 10-minutersband, max restid 10–120 min | Föreslagna standardvärden. |
| Delning av inställningar, inte historisk resultatkopia | Föreslagen semantik; ingen resultatlagring krävs. |
| Separat förberäkning av gångtider mellan hållplatser | Beslutat huvudupplägg. Gångområden genereras först vid stretch goal. |
| Webbläsarberäkning med förbearbetade data | Huvudspår som kräver prestandaverifiering. |
| Kartleverantör, gångförberäkning, datapublicering och licenser | Ska väljas/verifieras i förstudien. |
| Publikt GitHub-repo | Inte beslutat; får inte antas för publicering. |

## 14. Källor

Kontrollerade 2026-10-18. Produktkrav ovan kommer från dialogen; källorna stöder bakgrund och externa begränsningar, inte utlovad genomförbarhet.

[1]: https://rmattila.github.io/2021/01/15/isochrones/
[2]: https://www.trafiklab.se/api/gtfs-datasets/gtfs-regional/
[3]: https://developers.cloudflare.com/pages/platform/limits/
[4]: https://developers.cloudflare.com/workers/platform/limits/
[5]: https://docs.github.com/en/billing/concepts/product-billing/github-actions
[6]: https://operations.osmfoundation.org/policies/nominatim/
[7]: https://operations.osmfoundation.org/policies/tiles/

- [1 – Inspirationsartikel][1]
- [2 – Trafiklab: GTFS Regional][2]
- [3 – Cloudflare Pages: gränser][3]
- [4 – Cloudflare Workers: gränser][4]
- [5 – GitHub Actions: gratisanvändning och fakturering][5]
- [6 – Nominatim: användningspolicy][6]
- [7 – OpenStreetMap: tile-policy][7]

[8]: https://valhalla.github.io/valhalla/
[9]: https://download.geofabrik.de/europe/sweden.html
[10]: https://www.openstreetmap.org/copyright
[11]: https://docs.mapbox.com/api/navigation/matrix/
[12]: https://www.mapbox.com/pricing
[13]: https://docs.mapbox.com/api/navigation/isochrone/

[14]: https://www.trafiklab.se/sv/api/gtfs-datasets/overview/static-data/
