import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (file) => JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
const write = async (file,data) => fs.writeFile(path.join(root,file),JSON.stringify(data));
const raw = await read('offline/osm-network.json');
const meta = await read('offline/assets.json');
const allNodes = new Map(raw.elements.filter((el) => el.type === 'node').map((el) => [el.id,el]));
const nodes = [], indices = new Map(), ways = [];
const speeds = {motorway:80,motorway_link:40,trunk:60,trunk_link:35,primary:45,secondary:40,tertiary:35,residential:25,service:15,living_street:15,track:15};
for (const way of raw.elements.filter((el) => el.type === 'way' && el.tags?.highway)) {
  const t = way.tags;
  if (['no','private'].includes(t.motor_vehicle) || ['no','private'].includes(t.motorcar) || t.area === 'yes') continue;
  const sequence = [];
  for(const id of way.nodes) {
    const geo=way.geometry?.[sequence.length];
    const node=allNodes.get(id) || geo;
    if(!node) throw new Error(`Nó OSM ausente: ${id}`);
    if(!indices.has(id)) {indices.set(id,nodes.length); nodes.push([node.lon,node.lat]);}
    sequence.push(indices.get(id));
  }
  const one=t['oneway:motorcar'] || t['oneway:motor_vehicle'] || t.oneway;
  const direction=one === '-1' ? -1 : ['yes','1','true'].includes(one) || (!['no','0','false'].includes(one) && ['roundabout','circular'].includes(t.junction)) ? 1 : 0;
  const posted=Number.parseFloat(t.maxspeed);
  const speed=Number.isFinite(posted) && posted>0 ? Math.min(posted,80) : speeds[t.highway] || 30;
  ways.push([sequence,direction,speed]);
}
await write('offline/roads.json',{nodes,ways});
const units = [];
for(const el of raw.elements.filter((el) => el.tags?.amenity && el.tags?.name)) {
  const t=el.tags;
  if(!['hospital','clinic','doctors'].includes(t.amenity)) continue;
  if(/terreno|em construção|em construcao/i.test(t.name) || t.disused === 'yes' || t.abandoned === 'yes' || t.construction) continue;
  const center=el.geometry?.length ? {
    lat:el.geometry.reduce((sum,p)=>sum+p.lat,0)/el.geometry.length,
    lon:el.geometry.reduce((sum,p)=>sum+p.lon,0)/el.geometry.length,
  } : el.center;
  const lat=el.lat ?? center?.lat, lon=el.lon ?? center?.lon;
  if(!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  // Merge POI/building duplicates without moving the original geometry.
  if(units.some((u)=>u.name===t.name && Math.hypot(u.lat-lat,u.lon-lon)<0.002)) continue;
  units.push({id:`osm-${el.type}-${el.id}`,name:t.name,lat,lon,tags:t,source:'openstreetmap'});
}
if(units.length<3 || ways.length<100) throw new Error('Recorte offline incompleto.');
await write('offline/units.json',units);
const layers = [
  {id:'background',type:'background',paint:{'background-color':'#f4f1e8'}},
  {id:'landcover',type:'fill',source:'openmaptiles','source-layer':'landcover',paint:{'fill-color':'#deebd4','fill-opacity':0.6}},
  {id:'park',type:'fill',source:'openmaptiles','source-layer':'park',paint:{'fill-color':'#d3e7c7'}},
  {id:'water',type:'fill',source:'openmaptiles','source-layer':'water',paint:{'fill-color':'#9dcee3'}},
  {id:'waterway',type:'line',source:'openmaptiles','source-layer':'waterway',paint:{'line-color':'#9dcee3','line-width':2}},
  {id:'buildings',type:'fill',source:'openmaptiles','source-layer':'building',minzoom:13,paint:{'fill-color':'#d6d1c8','fill-outline-color':'#c3beb4'}},
  {id:'road-casing',type:'line',source:'openmaptiles','source-layer':'transportation',filter:['!in','class','rail','ferry','path'],paint:{'line-color':'#d0c4af','line-width':['interpolate',['linear'],['zoom'],11,1.5,14,5,18,18]}},
  {id:'roads',type:'line',source:'openmaptiles','source-layer':'transportation',filter:['!in','class','rail','ferry','path'],paint:{'line-color':['match',['get','class'],['motorway','trunk'],'#f1c274',['primary','secondary'],'#ffe0a2','#ffffff'],'line-width':['interpolate',['linear'],['zoom'],11,0.7,14,3.5,18,15]}},
  {id:'road-labels',type:'symbol',source:'openmaptiles','source-layer':'transportation_name',minzoom:13,layout:{'symbol-placement':'line','text-field':['coalesce',['get','name:pt'],['get','name'],''],'text-font':['Noto Sans Regular'],'text-size':11},paint:{'text-color':'#58646b','text-halo-color':'#ffffff','text-halo-width':1.5}},
  {id:'places',type:'symbol',source:'openmaptiles','source-layer':'place',layout:{'text-field':['coalesce',['get','name:pt'],['get','name'],''],'text-font':['Noto Sans Regular'],'text-size':['interpolate',['linear'],['zoom'],11,13,16,17]},paint:{'text-color':'#4c626c','text-halo-color':'#ffffff','text-halo-width':1.5}},
];
await write('offline/style.json',{version:8,name:'OSISTEC Mogi Guaçu offline',glyphs:'fonts/{fontstack}/{range}.pbf',sources:{openmaptiles:{type:'vector',tiles:['tiles/{z}/{x}/{y}.pbf'],bounds:meta.bbox,minzoom:meta.minzoom,maxzoom:meta.maxzoom,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://openfreemap.org">OpenFreeMap</a> · <a href="https://openmaptiles.org">OpenMapTiles</a>'}},layers});
// The raw road/POI response is a reproducible build input; only optimized files ship.
const assets=meta.files.filter(file=>!['offline/osm-network.json','offline/tile-source.json'].includes(file));
assets.push('offline/style.json','offline/units.json','offline/roads.json','offline-map.mjs');
await fs.writeFile(path.join(root,'offline-manifest.js'),`self.OSISTEC_OFFLINE_FILES = ${JSON.stringify(assets)};\n`);
console.log(JSON.stringify({units:units.length,nodes:nodes.length,ways:ways.length,files:assets.length}));
