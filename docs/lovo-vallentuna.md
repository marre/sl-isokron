# Lovön och Vallentuna

Användarfallen gav två olika luckor i det partiella gångunderlaget:

- Lovö kyrka och Barkarby på Lovön: vanliga landsvägar med 60–70 km/h hade
  felaktigt fallit utanför profilen. Barkarbys namngivna OSM-hållplats ligger
  också cirka sex meter från vägens mittlinje, strax utanför den tidigare
  femmetersgränsen. Identitetskontrollerad vägkorridor och tidsatta avvikelser
  återställer gång över det verkliga nätet.
- Vallentuna 2026-10-21 08.07, läge 2, 120 minuter, 15 minuters gång, tre
  byten och 30 minuters avgångsfönster: plattformsanslutningar saknades.
  Ursprunglig sökning nådde bara 75 lägen. Utpekade plattformar i Vallentuna,
  Stockholms östra och Tekniska högskolan kopplas nu till sin egen OSM-geometri.
  Tunnelbaneanslutningen använder kartlagda hissar och biljettspärrar, med
  två minuters uppskattad hiss-/stationstid utöver den kartlagda gångvägen.

Hållplatsidentiteter och källgeometri finns i `data/platform-bindings.json`
och `data/station-access.json`; metoden beskrivs i `data/README.md`.
Alla tidigare referensfall behålls. Den utökade listan kräver gång i båda
riktningar vid Barkarby, Lovö kyrka, Vallentuna tåg–buss och Stockholms östra–
Tekniska högskolan. Bygget stoppar publicering vid saknat eller för långt gångpar.

Verifieringen använder verkliga tidtabellspaket från den publicerade
2026-10-20-feeden för användarens datum, och lokalt förberäknade gångkanter från
den SHA-256-låsta OSM-extrakten. Framtida feedbyggen kontrollerar samma
hållplatsidentiteter igen. Gångunderlaget för övriga stationer förblir partiellt
– dessa kontroller är varken fullständig stationsinventering eller platsgranskning.
