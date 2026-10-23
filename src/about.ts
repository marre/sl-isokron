/** Static explanatory copy shared by the About dialog; no dataset-specific counts. */
export const aboutHTML = `
<p>sliso visar hur långt du kan resa med kollektivtrafik och gång från en vald hållplats. Mycket av grundarbetet görs i förväg. När du söker räknar din egen webbläsare ut resorna och bygger kartan.</p>

<h3>Vad betyder restiden?</h3>
<p>Vi visar minsta restid till varje hållplatsläge bland tillåtna avgångar i ditt avgångsfönster. Olika destinationer kan därför bygga på olika avgångar. Väntan före första påstigning räknas inte; gång, färd och väntan vid byten ingår.</p>
<p>Gång 5 min + färd 20 min + byte 7 min + färd 10 min = <strong>42 minuter</strong>. Gånggränsen gäller sammanhängande gång, även när den passerar flera hållplatser. Den börjar om efter en färd med kollektivtrafik.</p>

<h3>Från tidtabell till färdig karta</h3>
<ol class="about-flow">
  <li><strong>Förbered data.</strong> Tidtabeller och gångnät omvandlas till kompakta filer. Gångkopplingar och gångområden förberäknas.</li>
  <li><strong>Hämta det som behövs.</strong> Webbläsaren laddar grunddata, tidtabellspaket för sökningens tidsintervall och gångområden för kartvyn.</li>
  <li><strong>Hitta resorna lokalt.</strong> En bakgrundstråd söker igenom trafik och gångbyten. Hållplatser visas efter hand som de hittas.</li>
  <li><strong>Bygg tidsbanden.</strong> En annan bakgrundstråd sammanfogar gångområden utifrån hur mycket gångtid och restid som återstår. Kartan fylls på successivt.</li>
</ol>

<div class="about-tech">
<details>
  <summary>Öppen data och förberäkning</summary>
  <p>Trafikuppgifterna kommer från GTFS Regional via Trafiklab. Alla linjer i den importerade SL-feeden ingår, med dina valda trafikslag som filter. Gångunderlaget bygger på OpenStreetMap. Python-skript förbereder data; Valhalla tar fram gångområden längs gångnätet.</p>
  <p>Vi förberäknar kortaste gångkopplingar mellan hållplatslägen inom den stödda gånggränsen, upp till 30 minuter. Tabellen innehåller gångtid och hänvisningar till de ursprungliga gångkanterna, så att resväg och avstånd kan återskapas. Sökningen kan slå upp dessa kopplingar utan att söka igenom hela gångnätet vid varje byte.</p>
  <p>Data publiceras som versionsbundna, statiska filer via GitHub Releases och Cloudflares CDN. Ett litet manifest talar om vilka filer som hör ihop. SHA-256-kontrollsummor kontrollerar att innehållet är rätt. Det gör att tjänsten kan drivas utan en stor server som räknar ut varje resa.</p>
</details>
<details>
  <summary>Reseplanering i webbläsaren</summary>
  <p>TypeScript-koden kör reseberäkningen i en Web Worker, en bakgrundstråd som låter kartan och knapparna fortsätta svara. En rundbaserad <em>route-scanner</em> grupperar turer med samma hållplatsföljd och söker vidare stegvis med fler påstigningar.</p>
  <p>Sökningen håller reda på både ankomsttid, visad restid, gångtid och bytesvillkor. Flera alternativ kan behöva sparas vid samma hållplats: en senare ankomst kan exempelvis ha kortare restid när den första väntan inte räknas. Alternativ som inte kan förbättra resultatet rensas bort när deras villkor tillåter det.</p>
  <p>Små numeriska ID:n och återanvända uppslag minskar arbetet med söktillstånden. Varje sparad resa har en kedja av föregående steg, som används för resvägen på kartan och listan med gång, färdsätt, avgångar, ankomster och byten.</p>
</details>
<details>
  <summary>Gångområden, färger och zoomnivåer</summary>
  <p>För hållplatser med gångunderlag finns förberäknade konturer i minutsteg. Sökningen avgör vilka konturer som ryms inom återstående gångtid och den valda totala restiden. En separat Web Worker lägger samman dem till ett pixelraster med tidsband; där områden överlappar får den snabbaste tillgängliga färgen företräde.</p>
  <p>Leaflet sköter den interaktiva kartan och hållplatserna. Canvas visar gångområdenas raster, med färger från ljusgrönt till mörkrött. Konturerna levereras som komprimerade binärfiler. Koordinater med sex decimaler lagras som heltal med en fast skala; övriga behåller sin ursprungliga flyttalsprecision. Detaljlagrets packning bevarar alla ursprungliga minutkonturer och koordinater.</p>
  <p>Stora, utzoomade vyer kan använda ett märkt översiktslager med glesare tidssteg, i huvudsak fem minuter. När du zoomar in ersätts det med full detalj. Små vyer får detalj direkt. Hållplatsernas restider och resvägar behåller samma precision i båda vyerna.</p>
</details>
<details>
  <summary>Färre hämtningar, mindre väntan</summary>
  <p>Närliggande konturer packas i geografiska buntar med omkring 256 KiB som storleksmål. Det minskar antalet filhämtningar och arbetet med cache, uppackning och meddelanden mellan trådarna. Vilka konturer som bidrar väljs separat från filpackningen, så att buntningen inte ändrar detaljkartan.</p>
  <p>Filer hämtas med begränsad parallellitet, medan ritningen uppdateras i sin egen takt. Urvalet utgår från områden som kan bidra till kartvyn; en hämtad bunt kan också innehålla närliggande konturer. En bred översiktsvy hämtar sitt eget lager; detaljfiler laddas när vyn behöver dem.</p>
  <p>Verifierade filer sparas i webbläsarens CacheStorage när lagring är tillgänglig. Uppackade konturer utanför den aktuella vyn släpps för att begränsa minnesbehovet. Restidsreglaget återanvänder det beräknade resultatet, så att du kan utforska tidsgränser utan en ny trafiksökning.</p>
  <p>Progressraden visar arbetet som återstår. Nya sökningar och lagerbyten avbryter gammalt arbete; versionsmarkeringar hindrar sena svar från att rita över den nya vyn. Prestandaförändringar jämförs med referensresultat och, för detaljkartan, pixelkontroller.</p>
</details>
</div>

<h3>Underlag och delning</h3>
<p>Uppgifterna är planerade; realtid saknas. Gångnätet och dess kopplingar är ofullständiga. Gång mellan hållplatser med samma namn inom 250 meter och vissa granskade stationspassager kan ha uppskattad tid och längd; de märks i resedetaljerna. Förberäkningen återger det tillgängliga underlaget och kan därför fortfarande missa en möjlig väg.</p>
<p>Utgångna hållplatslägen döljs i kartan och sökningen. De kan finnas kvar som interna punkter i gångnätet för att bevara gångförbindelser mellan aktuella lägen.</p>
<p>Gångområden är ungefärliga ytor och kan innehålla otillgängliga delar. De garanterar inte tillträde till alla entréer. Även detaljerade minutkonturer är uppskattningar från gångnätet.</p>
<p>Delningslänken innehåller startplatsens ID, namn och koordinater samt datum, tid och alla filter. Alla som har länken kan läsa dem. Resultat kan förändras när data uppdateras. Själva reseberäkningen sker lokalt; trafikfiler och bakgrundskartan hämtas över nätet.</p>
<p><a href="https://github.com/marre/sl-isokron">Källkod, tekniska beskrivningar och prestandamätningar på GitHub</a>.</p>
`;
