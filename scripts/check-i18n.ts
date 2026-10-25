// Keeps extracted UI extracted. A directory opts in by holding a `messages.ts` catalog; every
// `.tsx` file beside it must then take its visible text from the catalog. Run by `bun run check`.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

export type Finding = { line: number; text: string }

const VISIBLE_PROPS = new Set([
  'title',
  'label',
  'placeholder',
  'aria-label',
  'description',
  'alt',
  'aria-description',
])
const TOAST_METHODS = new Set(['error', 'success', 'info', 'warning', 'message', 'loading'])
const PRODUCT_TERMS = /\b(?:Pascal|MCP|Preview|IFC|GLB|USDZ|STL|OBJ|SVG|PNG|JSON|PDF)\b/g
const ESCAPE = 'i18n-ignore'
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.next', '.turbo', '.git'])

const isVisibleText = (text: string) => /\p{L}/u.test(text.replace(PRODUCT_TERMS, ''))

/** The string literals a visible position would print: through `?:`, `&&`, `||`, `??`, `+` and templates, not calls. */
function literalsOf(node: ts.Expression): ts.Node[] {
  if (ts.isStringLiteralLike(node)) return [node]
  if (ts.isTemplateExpression(node)) return [node.head, ...node.templateSpans.map((s) => s.literal)]
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    return literalsOf(node.expression)
  if (ts.isConditionalExpression(node))
    return [...literalsOf(node.whenTrue), ...literalsOf(node.whenFalse)]
  if (ts.isBinaryExpression(node)) return [...literalsOf(node.left), ...literalsOf(node.right)]
  return []
}

function isToastCall(node: ts.CallExpression) {
  const callee = node.expression
  if (ts.isIdentifier(callee)) return callee.text === 'toast'
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'toast' &&
    TOAST_METHODS.has(callee.name.text)
  )
}

/** Hard-coded user-visible text in a `.tsx` source: JSX text, visible props and toast messages. */
export function findHardcodedText(source: string, fileName = 'file.tsx'): Finding[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const lines = source.split('\n')
  const findings: Finding[] = []

  const report = (node: ts.Node, text: string) => {
    if (!isVisibleText(text)) return
    const start =
      node.getStart(file) + (node.getText(file).length - node.getText(file).trimStart().length)
    const line = file.getLineAndCharacterOfPosition(start).line
    if (lines[line]?.includes(ESCAPE) || lines[line - 1]?.includes(ESCAPE)) return
    findings.push({ line: line + 1, text: text.trim().replace(/\s+/g, ' ') })
  }
  const reportLiterals = (expression: ts.Expression) => {
    for (const literal of literalsOf(expression))
      report(literal, (literal as ts.LiteralLikeNode).text)
  }

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) report(node, node.text)
    else if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent))
      reportLiterals(node.expression)
    else if (ts.isJsxAttribute(node) && VISIBLE_PROPS.has(node.name.getText(file))) {
      const value = node.initializer
      if (value && ts.isStringLiteral(value)) report(value, value.text)
      else if (value && ts.isJsxExpression(value) && value.expression)
        reportLiterals(value.expression)
    } else if (ts.isCallExpression(node) && isToastCall(node) && node.arguments[0])
      reportLiterals(node.arguments[0])
    ts.forEachChild(node, visit)
  }
  visit(file)
  return findings
}

/** Every directory under `root` that holds a `messages.ts`, with the `.tsx` files beside it. */
export function extractedFiles(root: string): string[] {
  const files: string[] = []
  const walk = (directory: string) => {
    const entries = readdirSync(directory, { withFileTypes: true })
    if (entries.some((entry) => entry.isFile() && entry.name === 'messages.ts'))
      for (const entry of entries)
        if (entry.isFile() && entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx'))
          files.push(join(directory, entry.name))
    for (const entry of entries)
      if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name))
        walk(join(directory, entry.name))
  }
  for (const top of ['packages', 'apps']) walk(join(root, top))
  return files
}

if (import.meta.main) {
  const root = join(import.meta.dir, '..')
  const failures = extractedFiles(root).flatMap((file) =>
    findHardcodedText(readFileSync(file, 'utf8'), file).map(
      (finding) => `${relative(root, file)}:${finding.line}  ${JSON.stringify(finding.text)}`,
    ),
  )
  if (failures.length > 0) {
    console.error(
      `Hard-coded text in a directory with a messages.ts catalog (move it into the catalog, or mark the line with "// ${ESCAPE}"):\n${failures.join('\n')}`,
    )
    process.exit(1)
  }
}
