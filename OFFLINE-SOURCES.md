# Fontes da distribuição offline

Recorte preparado em 20/10/2026. As bases são fotografias dos dados na data do download e não recebem atualizações sem conexão.

- **Dados de ruas e unidades de saúde:** © contribuidores do OpenStreetMap, disponibilizados pela Open Database License 1.0: https://www.openstreetmap.org/copyright e https://opendatacommons.org/licenses/odbl/1-0/. A rede derivada está em `offline/roads.json`, e os pontos em `offline/units.json`, sob a mesma licença. Esses dados e os tiles/glifos também são incorporados em `offline-pack.js` para abrir o HTML diretamente. IDs e etiquetas dos pontos permitem conferir os objetos originais no OSM. Consulta pontual via Overpass API: https://overpass-api.de/ e https://overpass.kumi.systems/.
- **Tiles vetoriais:** https://tiles.openfreemap.org/planet, esquema OpenMapTiles, https://openmaptiles.org/. Dados © contribuidores do OpenStreetMap. O estilo local do OSISTEC não consulta servidores externos.
- **MapLibre GL JS 6.15.0:** https://github.com/maplibre/maplibre-gl-js. Cópia da licença BSD-3-Clause e avisos de terceiros em `vendor/MAPLIBRE-LICENSE.txt`.
- **Noto Sans Regular:** glifos servidos pelo OpenFreeMap, projeto Noto, licença SIL Open Font License 1.1: https://openfontlicense.org/. Cópia em `vendor/FONT-LICENSE.txt`.

Atribuição de OpenStreetMap, OpenFreeMap e OpenMapTiles permanece visível no mapa mesmo sem conexão. Os links de atribuição são informativos e abrem sites externos somente quando acionados.
