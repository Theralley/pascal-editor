// Keeps extracted UI extracted. A directory opts in by holding a `messages.ts` catalog; every
// `.tsx` file beside it must then take its visible text from the catalog. Run by `bun run check`.
//
// It reads the syntax tree and flags a string literal where it is printed: JSX text and `{…}`
// children (through `?:`, `&&`, `||`, `??`, `+`, templates and `.map` callbacks), visible JSX props,
// visible keys of object literals (`label`, `title`, `text`, …), string arrays rendered in JSX, and
// the arguments of `toast*`, `showNotice`, `set…Error/Message/Notice/Status`, `alert` and `confirm`.
// It does not follow a string held in a variable on its way to the screen, and it leaves
// `new Error(...)` alone: those are internal until a component shows them.
//
// To keep a line as written, put `// i18n-ignore` before it or at its end, or `{/* i18n-ignore */}`
// in JSX. The marker counts only as a real comment: in JSX text it would print, so it is flagged.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

export type Finding = { line: number; text: string }

const VISIBLE_PROPS = new Set([
  'title',
  'label',
  'placeholder',
  'aria-label',
  'aria-description',
  'aria-valuetext',
  'ariaLabel',
  'description',
  'alt',
  'tooltip',
  'hint',
  'heading',
  'message',
  'disabledReason',
  'text',
  'emptyText',
])
const TOAST_METHODS = new Set([
  'error',
  'success',
  'info',
  'warning',
  'message',
  'loading',
  'promise',
])
const TOAST_PROMISE_KEYS = new Set(['loading', 'success', 'error'])
const NOTICE_SETTER = /^set\w*(?:Error|Message|Notice|Status)$/
const DIALOG_FUNCTIONS = new Set(['alert', 'confirm', 'prompt', 'showNotice'])
const ESCAPE = 'i18n-ignore'
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.next', '.turbo', '.git'])

// What may be printed without a catalog: product names, unit symbols and key names.
const ALLOWED_WORDS =
  /\b(?:Pascal|MCP|Preview|IFC|GLB|USDZ|STL|OBJ|SVG|PNG|JSON|PDF|Pro|mm|cm|km|ft|m|Ctrl|Control|Shift|Alt|Option|Cmd|Command|Esc|Enter|Return|Tab|Space|Delete|Backspace)\b/g
// A catalog key such as `floors.add`, held in a table until it is rendered through `t`.
const CATALOG_KEY = /^[a-z][\w-]*(?:\.[\w-]+)+$/
const PATH_OR_URL = /^(?:\/|[a-z][a-z0-9+.-]*:\/\/)\S*$/i

export function isVisibleText(text: string): boolean {
  const trimmed = text.trim()
  if (PATH_OR_URL.test(trimmed) || CATALOG_KEY.test(trimmed)) return false
  const stripped = trimmed.replace(/&#?\w+;/g, ' ').replace(ALLOWED_WORDS, ' ')
  return /\p{L}/u.test(stripped)
}

type Literal = ts.StringLiteralLike | ts.TemplateHead | ts.TemplateMiddle | ts.TemplateTail

/** The string literals an expression would print: through `?:`, `&&`, `||`, `??`, `+`, templates and `.map`. */
function literalsOf(node: ts.Expression): Literal[] {
  if (ts.isStringLiteralLike(node)) return [node]
  if (ts.isTemplateExpression(node)) return [node.head, ...node.templateSpans.map((s) => s.literal)]
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(literalsOf)
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  )
    return literalsOf(node.expression)
  if (ts.isConditionalExpression(node))
    return [...literalsOf(node.whenTrue), ...literalsOf(node.whenFalse)]
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return literalsOf(node.right)
    if (
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken ||
      operator === ts.SyntaxKind.PlusToken
    )
      return [...literalsOf(node.left), ...literalsOf(node.right)]
    return []
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'map'
  ) {
    const callback = node.arguments[0]
    if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
      if (ts.isBlock(callback.body)) return []
      return literalsOf(callback.body)
    }
  }
  return []
}

const propertyName = (name: ts.PropertyName, file: ts.SourceFile) =>
  ts.isStringLiteralLike(name) ? name.text : name.getText(file)

function calleeName(node: ts.CallExpression): { object?: string; name: string } | null {
  const callee = node.expression
  if (ts.isIdentifier(callee)) return { name: callee.text }
  if (ts.isPropertyAccessExpression(callee))
    return {
      object: ts.isIdentifier(callee.expression) ? callee.expression.text : undefined,
      name: callee.name.text,
    }
  return null
}

/** Hard-coded user-visible text in a `.tsx` source. */
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

  const jsxTextRanges: [number, number][] = []
  const stringArrays = new Set<string>()
  const collect = (node: ts.Node) => {
    if (ts.isJsxText(node)) jsxTextRanges.push([node.getStart(file), node.end])
    else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer) &&
      node.initializer.elements.length > 0 &&
      node.initializer.elements.every(ts.isStringLiteralLike)
    )
      stringArrays.add(node.name.text)
    ts.forEachChild(node, collect)
  }
  collect(file)

  const lineStarts = [0]
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1)
  const hasEscape = (line: number) => {
    const text = lines[line]
    if (!text) return false
    let at = text.indexOf(ESCAPE)
    while (at !== -1) {
      const position = (lineStarts[line] ?? 0) + at
      if (!jsxTextRanges.some(([start, end]) => position >= start && position < end)) return true
      at = text.indexOf(ESCAPE, at + 1)
    }
    return false
  }

  const report = (node: ts.Node, text: string) => {
    if (!isVisibleText(text)) return
    const raw = node.getText(file)
    const start = node.getStart(file) + (raw.length - raw.trimStart().length)
    const line = file.getLineAndCharacterOfPosition(start).line
    if (hasEscape(line) || hasEscape(line - 1)) return
    findings.push({ line: line + 1, text: text.trim().replace(/\s+/g, ' ') })
  }
  const reportLiterals = (expression: ts.Expression) => {
    for (const literal of literalsOf(expression)) report(literal, literal.text)
  }
  const renderedStringArray = (expression: ts.Expression) => {
    const target =
      ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)
        ? expression.expression.expression
        : expression
    return ts.isIdentifier(target) && stringArrays.has(target.text)
  }
  const reportStringArray = (name: string) => {
    for (const declaration of findDeclarations(file, name))
      if (declaration.initializer) reportLiterals(declaration.initializer)
  }

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) report(node, node.text)
    else if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      reportLiterals(node.expression)
      if (renderedStringArray(node.expression)) {
        const expression = node.expression
        const target =
          ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)
            ? expression.expression.expression
            : expression
        if (ts.isIdentifier(target)) reportStringArray(target.text)
      }
    } else if (ts.isJsxAttribute(node) && VISIBLE_PROPS.has(node.name.getText(file))) {
      const value = node.initializer
      if (value && ts.isStringLiteral(value)) report(value, value.text)
      else if (value && ts.isJsxExpression(value) && value.expression)
        reportLiterals(value.expression)
    } else if (ts.isPropertyAssignment(node) && VISIBLE_PROPS.has(propertyName(node.name, file))) {
      reportLiterals(node.initializer)
    } else if (ts.isCallExpression(node)) {
      const callee = calleeName(node)
      const first = node.arguments[0]
      if (callee) {
        const isToast =
          callee.object === 'toast'
            ? TOAST_METHODS.has(callee.name)
            : callee.name === 'toast' && !callee.object
        if (isToast && first) {
          reportLiterals(first)
          for (const argument of node.arguments)
            if (ts.isObjectLiteralExpression(argument))
              for (const property of argument.properties)
                if (
                  ts.isPropertyAssignment(property) &&
                  TOAST_PROMISE_KEYS.has(propertyName(property.name, file))
                )
                  reportLiterals(property.initializer)
        } else if ((DIALOG_FUNCTIONS.has(callee.name) || NOTICE_SETTER.test(callee.name)) && first)
          reportLiterals(first)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return findings
}

function findDeclarations(file: ts.SourceFile, name: string): ts.VariableDeclaration[] {
  const found: ts.VariableDeclaration[] = []
  const walk = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)
      found.push(node)
    ts.forEachChild(node, walk)
  }
  walk(file)
  return found
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
      `Hard-coded text in a directory with a messages.ts catalog. Move it into the catalog, or keep the line with a real comment ("// ${ESCAPE}" before or at the end of the line, "{/* ${ESCAPE} */}" in JSX; in JSX text the marker would print):\n${failures.join('\n')}`,
    )
    process.exit(1)
  }
}
