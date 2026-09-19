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
  `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:var(--font-sans,sans-serif);margin:16px;color:var(--foreground);background:var(--background)}.viewer,.tasks,.execution-controls{display:grid;gap:12px}.task,section[aria-label="一括実行"]{border:1px solid var(--border);border-radius:var(--radius);padding:12px;min-width:0}h2{font:inherit;font-weight:600;margin:0 0 12px}textarea{width:100%;box-sizing:border-box;background:var(--background);color:var(--foreground);border:1px solid var(--input);border-radius:var(--radius);padding:8px}button{background:var(--secondary);color:var(--secondary-foreground);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer}button:disabled{opacity:.5;cursor:default}p[role="status"]{overflow-wrap:anywhere;margin:0}p[role="status"]:empty{display:none}label{display:block;padding:6px}textarea{min-height:80px}button,input,textarea{font:inherit}button{padding:6px}p{font-size:12px}</style></head><body><script>${script}</script></body></html>`
)
