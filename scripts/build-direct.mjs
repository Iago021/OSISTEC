import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let esbuild;
try {esbuild = require('esbuild');}
catch {
  const fallback = process.env.OSISTEC_ESBUILD;
  if (!fallback) throw new Error('Para regenerar: npm install --no-save esbuild');
  esbuild = require(fallback);
}
const worker = await esbuild.build({
  entryPoints: [path.join(root,'vendor/maplibre-gl-worker.mjs')],
  bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
  minify: true, write: false, legalComments: 'inline',
});
await esbuild.build({
  entryPoints: [path.join(root,'direct-entry.mjs')],
  outfile: path.join(root,'direct-runtime.js'),
  bundle: true, format: 'iife', globalName: 'OSISTECRuntime',
  platform: 'browser', target: 'es2020', minify: true, legalComments: 'inline',
  define: {'import.meta.url': JSON.stringify('file:///osistec-runtime.js')},
});
const meta = JSON.parse(await fs.readFile(path.join(root,'offline/assets.json'),'utf8'));
const readJson = async (name) => JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
const files = {};
for (const name of meta.files.filter((file) => /^offline\/(tiles|fonts)\//.test(file))) {
  files[name.replace(/^offline\//,'')] = (await fs.readFile(path.join(root,name))).toString('base64');
}
const pack = {
  style: await readJson('offline/style.json'),
  units: await readJson('offline/units.json'),
  roads: await readJson('offline/roads.json'),
  worker: Buffer.from(worker.outputFiles[0].contents).toString('base64'),
  files,
};
await fs.writeFile(path.join(root,'offline-pack.js'),
  '/* OSISTEC: dados locais © OpenStreetMap / OpenFreeMap / OpenMapTiles. Licenças: OFFLINE-SOURCES.md */\n'
  + 'globalThis.OSISTEC_PACK = ' + JSON.stringify(pack) + ';\n');
console.log(`Pacote direto: ${Object.keys(files).length} recursos, ${pack.units.length} unidades, sem fetch ou imports em tempo de execução.`);
