import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const agent = 'OSISTEC-Offline-MogiGuacu/1.0 (github.com/Iago021/OSISTEC)';
const bbox = [-47.01, -22.42, -46.88, -22.30];
const minzoom = 11;
const maxzoom = 14;
const files = [];
let downloadedBytes = 0;
async function download(url, relative) {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), {recursive: true});
  let body;
  try { body = await fs.readFile(target); }
  catch {
    const response = await fetch(url, {headers: {'User-Agent': agent}, signal: AbortSignal.timeout(90000)});
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    body = Buffer.from(await response.arrayBuffer());
    downloadedBytes += body.length;
    if (downloadedBytes > 49_000_000) throw new Error('Limite de 49 MB atingido.');
    await fs.writeFile(target, body);
  }
  files.push(relative);
  return body;
}
await download('https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl.mjs', 'vendor/maplibre-gl.mjs');
await download('https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl-worker.mjs', 'vendor/maplibre-gl-worker.mjs');
await download('https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl.css', 'vendor/maplibre-gl.css');
await download('https://unpkg.com/maplibre-gl@6.15.0/LICENSE.txt', 'vendor/MAPLIBRE-LICENSE.txt');
const tilejson = JSON.parse(await download('https://tiles.openfreemap.org/planet', 'offline/tile-source.json'));
const tileUrl = tilejson.tiles[0];
const tx = (lon,z) => Math.floor((lon + 180) / 360 * 2 ** z);
const ty = (lat,z) => Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
const jobs = [];
for (let z=minzoom; z<=maxzoom; z++) {
  for (let x=tx(bbox[0],z); x<=tx(bbox[2],z); x++) {
    for (let y=ty(bbox[3],z); y<=ty(bbox[1],z); y++) {
      jobs.push([z,x,y]);
    }
  }
}
if(jobs.length > 3000) throw new Error('Limite de 3000 tiles excedido.');
let completed = 0;
async function worker() {
  while(jobs.length) {
    const [z,x,y] = jobs.shift();
    const url=tileUrl.replace('{z}',z).replace('{x}',x).replace('{y}',y);
    await download(url, `offline/tiles/${z}/${x}/${y}.pbf`);
    completed++;
    if(completed % 10 === 0) console.log(`${completed} tiles, ${(downloadedBytes/1e6).toFixed(1)} MB`);
  }
}
await Promise.all([worker(),worker(),worker(),worker()]);
for(const range of ['0-255','256-511']) {
  await download(`https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/${range}.pbf`, `offline/fonts/Noto Sans Regular/${range}.pbf`);
}
const query = `[out:json][timeout:60];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street)(_link)?$"]["access"!~"private|no"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});nwr["amenity"~"hospital|clinic|doctors"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}););out geom;`;
try {
  await download(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, 'offline/osm-network.json');
} catch (error) {
  console.log(`Consulta principal indisponível (${error.message.split(':')[0]}), usando segunda instância.`);
  await download(`https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(query)}`, 'offline/osm-network.json');
}
await fs.writeFile(path.join(root, 'offline/assets.json'), JSON.stringify({bbox,minzoom,maxzoom,files,generatedAt:new Date().toISOString()}, null,2));
console.log(`Pronto: ${completed} tiles, ${files.length} arquivos.`);
