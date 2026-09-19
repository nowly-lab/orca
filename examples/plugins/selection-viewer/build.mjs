import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { writeFile } from 'node:fs/promises'
const result = await build({
  entryPoints: [fileURLToPath(new URL('./panel.ts', import.meta.url))],
  bundle: true,
  minify: true,
  format: 'iife',
  write: false
})
const script = result.outputFiles[0].text.replaceAll('</script', '<\\/script')
await writeFile(
  new URL('./panel.html', import.meta.url),
  `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:var(--font-sans,sans-serif);margin:16px;color:var(--foreground);background:var(--background)}form{display:grid;gap:12px}label{display:block;padding:6px}textarea{min-height:80px}button,input,textarea{font:inherit}button{padding:6px}p{font-size:12px}</style></head><body><script>${script}</script></body></html>`
)
