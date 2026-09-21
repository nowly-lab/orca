import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
const result = await build({
  entryPoints: [fileURLToPath(new URL('./panel.ts', import.meta.url))],
  bundle: true,
  minify: true,
  format: 'iife',
  write: false
})
const script = result.outputFiles[0].text.replaceAll('</script', '<\\/script')
const css = await readFile(new URL('./panel.css', import.meta.url), 'utf8')
const font = await readFile(
  new URL('../../../src/renderer/src/assets/fonts/Geist-Variable.woff2', import.meta.url)
)
await writeFile(
  new URL('./panel.html', import.meta.url),
  `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>@font-face{font-family:Geist;src:url(data:font/woff2;base64,${font.toString('base64')}) format('woff2');font-weight:100 900;font-display:swap}${css}</style></head><body class="scrollbar-sleek"><script>${script}</script></body></html>`
)
