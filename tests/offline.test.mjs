import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createRouter, distanceMeters} from '../offline-map.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json=async(file)=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));

test('o pacote carrega estilo, catálogo e rede com acesso externo bloqueado',async()=>{
  const originalFetch=globalThis.fetch;
  const requests=[];
  globalThis.fetch=async(input)=>{
    const url=new URL(input);
    assert.equal(url.protocol,'file:','Um recurso tentou sair do pacote local');
    requests.push(url.href);
    return new Response(await fs.readFile(fileURLToPath(url)),{status:200});
  };
  try {
    const {loadOfflineBundle}=await import('../offline-map.mjs');
    const {style,units,roads}=await loadOfflineBundle();
    assert.equal(requests.length,3);
    assert.ok(units.length>=20);
    assert.ok(roads.nodes.length>20000);
    assert.ok(style.sources.openmaptiles.tiles[0].startsWith('file:'));
    assert.ok(style.glyphs.startsWith('file:'));
    assert.equal(style.sprite,undefined);
    assert.ok(!style.layers.some(layer=>layer.type==='raster'));
  } finally {globalThis.fetch=originalFetch;}
});

test('o recorte inclui todos os tiles necessários entre zoom 11 e 14',async()=>{
  const {bbox,minzoom,maxzoom}=await json('offline/assets.json');
  const tx=(lon,z)=>Math.floor((lon+180)/360*2**z);
  const ty=(lat,z)=>Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z);
  let tiles=0;
  for(let z=minzoom;z<=maxzoom;z++) for(let x=tx(bbox[0],z);x<=tx(bbox[2],z);x++) for(let y=ty(bbox[3],z);y<=ty(bbox[1],z);y++) {
    const stat=await fs.stat(path.join(root,`offline/tiles/${z}/${x}/${y}.pbf`));
    assert.ok(stat.size>0);tiles++;
  }
  assert.equal(tiles,71);
});

test('a rota local respeita mão única e não atravessa ruas desconectadas',()=>{
  const a=[-46.94,-22.36],b=[-46.939,-22.36],c=[-46.939,-22.359],d=[-46.94,-22.359];
  const route=createRouter({nodes:[a,b,c,d,[-46.93,-22.35],[-46.929,-22.35]],ways:[[[0,1],1,30],[[1,2,3,0],0,30],[[4,5],0,30]]});
  assert.deepEqual(route(a,b).coordinates,[a,b]);
  assert.deepEqual(route(b,a).coordinates,[b,c,d,a]);
  assert.equal(route(a,[-46.93,-22.35]),null);
  assert.equal(route(a,[0,0]),null);
});

test('rotas reais chegam ao Hospital Municipal e à Santa Casa pelas ruas',async()=>{
  const route=createRouter(await json('offline/roads.json'));
  const units=await json('offline/units.json');
  const origin=[-46.943198,-22.367928];
  for(const keyword of ['Tabajara','Santa Casa']) {
    const hospital=units.find(unit=>unit.name.includes(keyword));
    assert.ok(hospital,keyword);
    const result=route(origin,[hospital.lon,hospital.lat]);
    assert.ok(result?.coordinates.length>10,keyword);
    assert.ok(result.distance>=distanceMeters(origin,[hospital.lon,hospital.lat])*0.7);
    assert.ok(distanceMeters(result.coordinates.at(-1),[hospital.lon,hospital.lat])<300);
  }
});

test('service worker instala o recorte inteiro e responde após desligar a rede',async()=>{
  const origin='https://offline.test/OSISTEC/';
  const listeners={};const stores=new Map();let network=true;
  const key=(request)=>new URL(typeof request==='string'?request:request.url,origin).href;
  const readResponse=async(request)=>{
    if(!network) throw new Error('Rede desligada pelo teste');
    const url=new URL(key(request));
    assert.equal(url.origin,new URL(origin).origin);
    const name=decodeURIComponent(url.pathname.slice('/OSISTEC/'.length)) || 'index.html';
    return new Response(await fs.readFile(path.join(root,name)),{status:200});
  };
  const cache={
    addAll:async(files)=>{for(const file of files) stores.set(key(file),await readResponse(file));},
    put:async(request,response)=>stores.set(key(request),response),
  };
  const self={location:{origin:new URL(origin).origin},addEventListener:(event,handler)=>listeners[event]=handler,skipWaiting:async()=>{},clients:{claim:async()=>{},matchAll:async()=>[]}};
  const context={self,URL,Response,AbortController,setTimeout,clearTimeout,fetch:readResponse,caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true,match:async(request)=>stores.get(key(request))?.clone()}};
  vm.createContext(context);
  const manifest=await fs.readFile(path.join(root,'offline-manifest.js'),'utf8');
  context.importScripts=()=>vm.runInContext(manifest,context);
  vm.runInContext(await fs.readFile(path.join(root,'sw.js'),'utf8'),context);
  let pending;
  listeners.install({waitUntil:(promise)=>pending=promise});await pending;
  assert.ok(stores.size>=90);
  network=false;
  for(const [url,mode] of [['', 'navigate'],['vendor/maplibre-gl.mjs','cors'],['vendor/maplibre-gl-worker.mjs','cors'],['offline/roads.json','cors'],['offline/fonts/Noto%20Sans%20Regular/0-255.pbf','cors']]) {
    let response;
    listeners.fetch({request:{method:'GET',url:origin+url,mode},respondWith:(promise)=>response=promise});
    const result=await response;
    assert.equal(result.status,200,url);
    assert.ok((await result.arrayBuffer()).byteLength>0,url);
  }
});

test('o HTML é independente, mantém o visual e a ordem dos scripts e abre por file://',async()=>{
  const html=await fs.readFile(path.join(root,'index.html'),'utf8');
  assert.ok(!/<script[^>]+\bsrc=/.test(html));
  assert.ok(!/<link[^>]+rel="stylesheet"/.test(html));
  assert.ok(!/<script[^>]+type=["']module/.test(html));
  assert.ok(!/<(?:img|link)[^>]+(?:src|href)="(?!data:)/.test(html));
  const scriptNames=[...html.matchAll(/<script data-source="([^"]+)">/g)].map(match=>match[1]);
  assert.deepEqual(scriptNames,['offline-pack.js','direct-runtime.js','auth.js','app.js']);
  assert.ok(html.indexOf('<script data-source=')>html.indexOf('id="app-shell"'));
  for(const name of scriptNames) {
    const embedded=html.split(`<script data-source="${name}">\n`)[1].split('\n</script>')[0];
    assert.equal(embedded,(await fs.readFile(path.join(root,name),'utf8')).replace(/<\/script/gi,'<\\/script'));
    assert.doesNotThrow(()=>new vm.Script(embedded),name);
  }
  for(const name of ['style.css','vendor/maplibre-gl.css']) {
    const embedded=html.split(`<style data-source="${name}">\n`)[1].split('\n</style>')[0];
    assert.equal(embedded,await fs.readFile(path.join(root,name),'utf8'));
  }
  // Packaging must leave every visible element and its attributes unchanged.
  const source=await fs.readFile(path.join(root,'source/index.html'),'utf8');
  const body=(text)=>text.split('<body>')[1].split('</body>')[0]
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')
    .replace(/data:image\/jpeg;base64,[^"]+/g,'assets/osistec-logo.jpeg').trim();
  assert.equal(body(html),body(source));
  const app=await fs.readFile(path.join(root,'app.js'),'utf8');
  assert.ok(!/\bimport\s*\(/.test(app));
  assert.ok(!app.includes('Abra pelo iniciar-offline'));
});

test('o pacote direto resolve tiles, fontes e rotas com fetch e módulos bloqueados',async()=>{
  const blobs=[];
  const fakeURL=class extends URL {};
  fakeURL.createObjectURL=(blob)=>{blobs.push(blob);return 'blob:null/osistec-worker';};
  const context={URL:fakeURL,Blob,atob,TextDecoder,TextEncoder,AbortController,performance,Uint8Array,ArrayBuffer,Float64Array,Int32Array,Map,Set,console,setTimeout,clearTimeout,
    fetch:()=>{throw new Error('Uma consulta à rede/arquivo foi tentada');}};
  vm.createContext(context);
  vm.runInContext(await fs.readFile(path.join(root,'offline-pack.js'),'utf8'),context);
  try {vm.runInContext(await fs.readFile(path.join(root,'direct-runtime.js'),'utf8'),context);}
  catch(error) {throw new Error(`Inicialização do script clássico: ${error.message}`);}
  const runtime=context.OSISTECRuntime;
  const pack=runtime.loadOfflineBundle();
  assert.equal(pack.units.length,22);
  assert.equal(pack.style.glyphs,'osistec://fonts/{fontstack}/{range}.pbf');
  assert.equal(runtime.maplibre.getWorkerUrl(),'blob:null/osistec-worker');
  assert.equal(blobs.length,1);
  const protocol=runtime.maplibre.config.REGISTERED_PROTOCOLS.osistec;
  assert.equal(typeof protocol,'function');
  for(const [name,encoded] of Object.entries(context.OSISTEC_PACK.files)) {
    const response=await protocol({url:'osistec://'+encodeURI(name)});
    assert.deepEqual(Buffer.from(response.data),Buffer.from(encoded,'base64'),name);
  }
  const route=runtime.createRouter(pack.roads);
  const hospital=pack.units.find(unit=>unit.name.includes('Tabajara'));
  assert.ok(route([-46.943198,-22.367928],[hospital.lon,hospital.lat]).coordinates.length>10);
  // The generated worker is self-contained classic JS: no file imports are needed.
  const worker=await blobs[0].text();
  assert.doesNotThrow(()=>new vm.Script(worker));
  class WorkerGlobalScope {
    addEventListener() {}
    removeEventListener() {}
    postMessage() {}
  }
  const scope=new WorkerGlobalScope();
  const channels=[];
  class TestMessageChannel extends MessageChannel {constructor(){super();channels.push(this);}}
  const workerContext={self:scope,WorkerGlobalScope,MessageChannel:TestMessageChannel,TextDecoder,TextEncoder,performance,URL,Blob,atob,console,setTimeout,clearTimeout,AbortController,
    fetch:()=>{throw new Error('Worker tentou acessar a rede');}};
  vm.createContext(workerContext);
  try {vm.runInContext(worker,workerContext,{importModuleDynamically:()=>{throw new Error('Worker tentou importar um arquivo');}});}
  catch(error) {throw new Error(`Inicialização do worker incorporado: ${error.message}`);}
  finally {for(const channel of channels){channel.port1.close();channel.port2.close();}}
  assert.ok(scope.worker,'O worker precisa iniciar sem consultar arquivos externos');
});
