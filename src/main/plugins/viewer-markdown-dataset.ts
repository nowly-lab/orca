import { createHash } from 'node:crypto'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type { ViewerItem } from '../../shared/plugins/viewer-contract'

type MarkdownNode = {
  type: string
  value?: string
  alt?: string | null
  checked?: boolean | null
  children?: MarkdownNode[]
  position?: { start: { offset?: number }; end: { offset?: number } }
}

function plainText(node: MarkdownNode): string {
  if (node.type === 'image') {
    return node.alt ?? ''
  }
  if (node.type === 'break') {
    return ' '
  }
  return node.value ?? node.children?.map(plainText).join('') ?? ''
}

export function readMarkdownViewerItems(source: string): ViewerItem[] {
  // The dataset is already read; parsing needs no filesystem context or process.cwd().
  const tree = unified().use(remarkParse).use(remarkGfm).parse({ value: source, cwd: '' })
  const items: ViewerItem[] = []
  const occurrences = new Map<string, number>()
  const visit = (node: MarkdownNode): void => {
    if (node.type === 'listItem' && typeof node.checked === 'boolean') {
      const markdown = source.slice(node.position?.start.offset, node.position?.end.offset).trim()
      const hash = createHash('sha256').update(markdown).digest('hex').slice(0, 40)
      const occurrence = occurrences.get(hash) ?? 0
      occurrences.set(hash, occurrence + 1)
      items.push({
        id: `md:${hash}:${occurrence}`,
        title: plainText(node.children?.find((child) => child.type === 'paragraph') ?? node),
        checked: node.checked,
        markdown
      })
      if (items.length > 10000) {
        throw new Error('dataset_invalid_shape')
      }
    }
    for (const child of node.children ?? []) {
      visit(child)
    }
  }
  visit(tree)
  if (!items.length) {
    throw new Error('dataset_markdown_no_tasks')
  }
  return items
}
