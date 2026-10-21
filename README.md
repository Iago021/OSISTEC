# OSISTEC — versão offline

O `index.html` já contém o aplicativo completo: visual, logo, scripts, bibliotecas, fontes, ruas da região urbana de Mogi Guaçu, unidades de saúde e rede viária para calcular rotas locais. Não é necessário instalar Python, Node.js, dependências ou abrir o site antes.

## Abrir o ZIP sem internet

1. Baixe **Code → Download ZIP** neste repositório e extraia a pasta.
2. Abra **`index.html`** com Chrome, Edge ou Firefox atualizado.
3. Crie sua conta local ou entre na conta criada nessa mesma cópia do aplicativo.

O aplicativo funciona por `file://`. O HTML é independente: todos os estilos, scripts, imagens e dados necessários estão incorporados nele. O processamento do mapa usa um worker em memória. Não há módulos, instalação, servidor local ou consultas HTTP para abrir o aplicativo. O layout e os estilos da interface foram preservados.

Se o sistema abrir o HTML em um visualizador de arquivos, escolha **Abrir com → navegador**. Não abra o HTML dentro do ZIP. Depois de extrair, até uma cópia isolada do `index.html` funciona. Os outros arquivos são as fontes editáveis, os dados originais e as licenças; mantenha os avisos de licença ao redistribuir o pacote.

## O que funciona offline

- Cadastro e login locais, perfil, navegação e registros salvos no navegador.
- Mapa real com arrasto, zoom, nomes de ruas e seleção das unidades.
- Busca digitada, distâncias e rotas calculadas pelas ruas incluídas.
- Recursos demonstrativos de farmácia, plantões, reservas e check-in.

O mapa cobre o recorte urbano entre as latitudes -22,42 e -22,30 e longitudes -47,01 e -46,88. É possível ampliar até zoom 18; o detalhe vetorial salvo vai até zoom 14 e é ampliado nos níveis seguintes. Fora desse recorte não há cobertura offline.

As rotas partem do centro de Mogi Guaçu e usam a rede de ruas salva, incluindo sentidos únicos. São estimativas: não consideram trânsito, interdições atuais ou todas as restrições de conversão. Se uma unidade não tiver conexão na rede viária incluída, o aplicativo mostra explicitamente a distância em linha reta e não inventa uma rota. A lotação, os tempos de espera, o check-in e as recomendações continuam demonstrativos.

Reconhecimento de voz depende do navegador e pode precisar de internet. O botão **Google Maps (online)** abre um serviço externo; a rota dentro do OSISTEC é local. Contas e registros são específicos de cada navegador e endereço. O site publicado, `localhost` e o arquivo HTML têm armazenamentos separados; mover a pasta pode alterar o armazenamento associado ao arquivo.

## Uso offline do site instalado

Ao abrir o site publicado com internet, o service worker salva o aplicativo e todos os arquivos do recorte urbano. Espere a instalação terminar antes de desconectar. Na versão ZIP os arquivos já estão presentes. Limpar os dados do navegador remove o cache do site e os registros locais.

## Dados e manutenção

Ruas e pontos: © contribuidores do OpenStreetMap, licença ODbL 1.0. Tiles: OpenFreeMap/OpenMapTiles. Bibliotecas: MapLibre GL JS 6.15.0 (BSD-3-Clause). Fontes: Noto Sans (SIL OFL). Atribuição e licenças: `OFFLINE-SOURCES.md` e `vendor/`.

### Editar o código

`index.html` é a versão pronta para uso. A base editável fica em `source/index.html`, `style.css`, `auth.js` e `app.js`. A montagem apenas incorpora os arquivos existentes, sem alterar a interface.

**Somente para quem mantém o código:** depois de editar a interface, execute `node scripts/build-html.mjs` e versione o `index.html` atualizado. Essa ferramenta de desenvolvimento usa apenas a biblioteca padrão do Node; quem baixa o ZIP não precisa dela nem de Node.

Para regenerar também o recorte cartográfico quando houver internet e Node.js 20 ou mais recente:

```sh
node scripts/prepare-offline.mjs
node scripts/build-offline.mjs
npm install --no-save esbuild
node scripts/build-direct.mjs
node scripts/build-html.mjs
node --test tests/offline.test.mjs
```

Os scripts respeitam o limite do OpenFreeMap: até quatro downloads paralelos, 3.000 tiles e 50 MB por recorte. A versão incluída usa 71 tiles.
