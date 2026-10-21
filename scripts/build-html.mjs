// Ferramenta de manutenção. O HTML gerado não precisa de Node ou servidor.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFile(path.join(root, name), 'utf8');
const scriptText = (text) => text.replace(/<\/script/gi, '<\\/script');
let html = await read('source/index.html');

// Keep exactly the same style and execution order as the editable source.
html = await replaceAsync(html, /<link rel="stylesheet" href="([^"]+)"\s*\/>/g, async (match, name) => {
  const css = await read(name.split('?')[0]);
  if (/<\/style/i.test(css)) throw new Error(`Fechamento de style inesperado: ${name}`);
  return `<style data-source="${name.split('?')[0]}">\n${css}\n</style>`;
});
const scriptPattern = /\s*<script src="([^"]+)" defer><\/script>/g;
const scripts = await Promise.all([...html.matchAll(scriptPattern)].map(async ([, name]) =>
  `<script data-source="${name.split('?')[0]}">\n${scriptText(await read(name.split('?')[0]))}\n</script>`
));
html = html.replace(scriptPattern, '');
// Inline scripts execute only after all application elements exist.
html = html.replace('</body>', () => scripts.join('\n') + '\n  </body>');
const logo = 'data:image/jpeg;base64,' + (await fs.readFile(path.join(root, 'assets/osistec-logo.jpeg'))).toString('base64');
html = html.replaceAll('"assets/osistec-logo.jpeg"', `"${logo}"`);
html = html.replace('<!doctype html>', '<!doctype html>\n<!-- Gerado por scripts/build-html.mjs. Edite source/index.html, style.css, auth.js e app.js. -->');
await fs.writeFile(path.join(root, 'index.html'), html);
console.log(`index.html independente: ${Buffer.byteLength(html)} bytes. Abra diretamente no navegador.`);

async function replaceAsync(text, pattern, replace) {
  const matches = [...text.matchAll(pattern)];
  const replacements = await Promise.all(matches.map((match) => replace(...match)));
  let result = '';
  let offset = 0;
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    result += text.slice(offset, match.index) + replacements[i];
    offset = match.index + match[0].length;
  }
  return result + text.slice(offset);
}
