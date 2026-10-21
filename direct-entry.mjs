import * as maplibre from './vendor/maplibre-gl.mjs';
import {createRouter} from './offline-map.mjs';

export {maplibre, createRouter};
let prepared;

export function loadOfflineBundle() {
  if (prepared) return prepared;
  const pack = globalThis.OSISTEC_PACK;
  if (!pack) throw new Error('O pacote do mapa não foi encontrado. Extraia toda a pasta do ZIP.');
  const decode = (encoded) => Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  maplibre.addProtocol('osistec', async (request) => {
    const name = decodeURIComponent(request.url.replace(/^osistec:\/\//, '').split('?')[0]);
    const encoded = pack.files[name];
    if (!encoded) throw new Error(`Recurso fora do mapa salvo: ${name}`);
    // Decode each request into a fresh buffer: MapLibre can transfer it to a worker.
    return {data: decode(encoded).buffer};
  });
  const worker = new Blob([decode(pack.worker)], {type: 'text/javascript'});
  maplibre.setWorkerUrl(URL.createObjectURL(worker));
  const style = JSON.parse(JSON.stringify(pack.style));
  style.glyphs = 'osistec://fonts/{fontstack}/{range}.pbf';
  style.sources.openmaptiles.tiles = ['osistec://tiles/{z}/{x}/{y}.pbf'];
  prepared = {style, units: pack.units, roads: pack.roads};
  return prepared;
}
