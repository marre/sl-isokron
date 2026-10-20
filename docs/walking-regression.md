# Skärvik–Skorpvägen–Ankarstocksvägen, 2026-10-20

Användarens delningslänk: start `9022001015503003`, 2026-10-20 kl. 21:08,
120 min restid, 15 min sammanhängande gång, 4 byten, 30 min avgångsfönster,
alla trafikslag. Publicerat referensdataset: `sl-1c9cbc92348f17f00ef3`.

Felet finns i gångunderlagets anslutningar, inte i restidsavrundningen.
Samtliga fyra berörda lägen saknade gångkoppling. Den tidigare gränsen 1 meter
förkastade projektioner 1,9–4,5 meter från samma gångbara väg. Därför hittades
en lång bussomväg till motsatt riktning, trots en kort promenad.

Återskapade restider före rättningen (sekunder, avrundning uppåt i appen):

| Hållplatsläge (sista siffran i GTFS-ID) | Tid före | Visat |
| --- | ---: | ---: |
| Skorpvägen 1 | 4060 | 68 min |
| Skorpvägen 2 | 5101 | 86 min |
| Ankarstocksvägen 1 | 4099 | 69 min |
| Ankarstocksvägen 2 | 5062 | 85 min |

Rättningen använder en begränsad koordinattolerans med OSM-hållplatsidentitet;
se [metoden](../data/README.md). Ingen hållplats eller linje specialbehandlas.
Alla fyra lägen får gånganslutning. Nätvägen från Skorpvägen 1 till
Ankarstocksvägen 2 är cirka 201 meter och 152 sekunder inklusive ändpunkternas
avvikelser. Algoritmen kan även fortsätta med buss 112 till Ankarstocksvägen 1
och gå cirka 29 meter/22 sekunder till läge 2.

Regressionskontroller omfattar namn-/lägesidentitet, tvetydiga vägkopplingar,
för stora avvikelser, oförändrad restriktion för båt-/spåranslutningar,
anslutningskostnad i tid/längd och områdesbudget samt att en kort nätpromenad
slår bussomvägen. Befintliga tester för vattenhinder och gångbudget kvarstår.

Detta utökar ett partiellt gångunderlag. Övriga saknade anslutningar kräver
fortsatt komplettering och granskning; alla geografiskt närliggande lägen
antas inte vara gångbara.
