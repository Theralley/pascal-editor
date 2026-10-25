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
  'detail',
  'group',
  'empty',
  'subtitle',
  'defaultName',
])
// `vrLabel`, `helpTitle`, `emptyText`: a prop that says it is a label, title or text is one.
const VISIBLE_NAME_SUFFIX = /(?:Label|Title|Text)$/
const isVisibleName = (name: string) => VISIBLE_PROPS.has(name) || VISIBLE_NAME_SUFFIX.test(name)
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

// What may be printed without a catalog: product names, unit symbols and axis letters.
const ALLOWED_WORDS =
  /\b(?:Pascal|MCP|Preview|IFC|GLB|USDZ|STL|OBJ|SVG|PNG|JSON|PDF|Pro|mm|cm|km|ft|m|X|Y|Z)\b/g
// Key names are allowed only where a key is shown: `keys` arrays, `<kbd>` and shortcut tables.
// Elsewhere a lone "Delete" or "Enter" is a button label.
const KEY_NAMES =
  /\b(?:Ctrl|Control|Shift|Alt|Option|Cmd|Command|Esc|Enter|Return|Tab|Space|Delete|Backspace)\b/g
const KEY_ELEMENTS = new Set(['kbd', 'Kbd', 'ShortcutToken', 'ShortcutKeys'])
// A catalog key such as `floors.add`, held in a table until it is rendered through `t`.
const CATALOG_KEY = /^[a-z][\w-]*(?:\.[\w-]+)+$/
const PATH_OR_URL = /^(?:\/|[a-z][a-z0-9+.-]*:\/\/)\S*$/i

export function isVisibleText(text: string, keyContext = false): boolean {
  const trimmed = text.trim()
  if (PATH_OR_URL.test(trimmed) || CATALOG_KEY.test(trimmed)) return false
  let stripped = trimmed.replace(/&#?\w+;/g, ' ').replace(ALLOWED_WORDS, ' ')
  if (keyContext) stripped = stripped.replace(KEY_NAMES, ' ')
  return /\p{L}/u.test(stripped)
}

function isStringArray(node: ts.Expression): boolean {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node))
    return isStringArray(node.expression)
  return (
    ts.isArrayLiteralExpression(node) &&
    node.elements.length > 0 &&
    node.elements.every(ts.isStringLiteralLike)
  )
}

type Literal = ts.StringLiteralLike | ts.TemplateHead | ts.TemplateMiddle | ts.TemplateTail

/** The string literals an expression would print: through `?:`, `&&`, `||`, `??`, `+`, templates and `.map`. */
function literalsOf(node: ts.Expression): Literal[] {
  if (ts.isStringLiteralLike(node)) return [node]
  if (ts.isTemplateExpression(node))
    return [
      node.head,
      ...node.templateSpans.flatMap((span) => [...literalsOf(span.expression), span.literal]),
    ]
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
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    if (!ts.isBlock(node.body)) return literalsOf(node.body)
    const returned: Literal[] = []
    const walk = (child: ts.Node) => {
      if (ts.isFunctionLike(child)) return
      if (ts.isReturnStatement(child) && child.expression)
        returned.push(...literalsOf(child.expression))
      ts.forEachChild(child, walk)
    }
    ts.forEachChild(node.body, walk)
    return returned
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'map'
  ) {
    const callback = node.arguments[0]
    const printed = callback ? literalsOf(callback) : []
    const receiver = node.expression.expression
    // An inline list of strings, mapped into elements, prints each one unless the callback hands it to `t`.
    const translates = callback ? translatesItem(callback) : false
    return [...(translates ? [] : literalsOf(receiver)), ...printed]
  }
  return []
}

/** Whether a `.map` callback passes its item to `t(...)` or `translate(...)`, so the item is a key. */
function translatesItem(callback: ts.Expression): boolean {
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return false
  const item = callback.parameters[0]?.name
  if (!item || !ts.isIdentifier(item)) return false
  return new RegExp(`\\b(?:t|translate)\\(\\s*${item.text}\\b`).test(callback.getText())
}

const TABLE_SIBLINGS = new Set(['id', 'value', 'icon', 'shortcut', 'keys'])

/** `name:` in an option or menu table: the object also carries an id, value, icon or shortcut. */
function isTableName(node: ts.PropertyAssignment, file: ts.SourceFile): boolean {
  if (propertyName(node.name, file) !== 'name' || !ts.isObjectLiteralExpression(node.parent))
    return false
  return node.parent.properties.some(
    (property) =>
      property !== node &&
      (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
      TABLE_SIBLINGS.has(propertyName(property.name, file)),
  )
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

  // Where a `//` or `/*` is text, not a comment: the marker only counts outside these.
  const textRanges: [number, number][] = []
  const stringArrays = new Set<string>()
  const collect = (node: ts.Node) => {
    if (
      ts.isJsxText(node) ||
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    )
      textRanges.push([node.getStart(file), node.end])
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      !/Keys?$/.test(node.name.text) &&
      isStringArray(node.initializer)
    )
      stringArrays.add(node.name.text)
    ts.forEachChild(node, collect)
  }
  collect(file)

  const lineStarts = [0]
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1)
  const inText = (position: number) =>
    textRanges.some(([start, end]) => position >= start && position < end)
  /** A real comment with the marker on `line`: `//` or `/*` before it, and neither inside text. */
  const markerOn = (line: number): boolean => {
    const text = lines[line]
    if (!text) return false
    const base = lineStarts[line] ?? 0
    let at = text.indexOf(ESCAPE)
    while (at !== -1) {
      if (!inText(base + at)) {
        const opener = Math.max(text.lastIndexOf('//', at), text.lastIndexOf('/*', at))
        if (opener !== -1 && !inText(base + opener)) return true
      }
      at = text.indexOf(ESCAPE, at + 1)
    }
    return false
  }
  /** On the line itself, or alone on the line above. */
  const hasEscape = (line: number) => {
    if (markerOn(line)) return true
    const above = lines[line - 1]?.trim() ?? ''
    const commentOnly = above.startsWith('//') || (above.startsWith('{/*') && above.endsWith('*/}'))
    return markerOn(line - 1) && commentOnly
  }

  const insideNamed = (node: ts.Node, names: ReadonlySet<string>) => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isJsxElement(parent) && names.has(parent.openingElement.tagName.getText(file)))
        return true
      if (ts.isJsxSelfClosingElement(parent) && names.has(parent.tagName.getText(file))) return true
    }
    return false
  }
  const insideKeys = (node: ts.Node) => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isPropertyAssignment(parent) && propertyName(parent.name, file) === 'keys') return true
      if (
        ts.isVariableDeclaration(parent) &&
        ts.isIdentifier(parent.name) &&
        /shortcut|keys/i.test(parent.name.text)
      )
        return true
    }
    return false
  }
  const STYLE = new Set(['style'])

  const report = (node: ts.Node, text: string) => {
    if (insideNamed(node, STYLE)) return
    if (!isVisibleText(text, insideNamed(node, KEY_ELEMENTS) || insideKeys(node))) return
    const raw = node.getText(file)
    const start = node.getStart(file) + (raw.length - raw.trimStart().length)
    const line = file.getLineAndCharacterOfPosition(start).line
    if (hasEscape(line)) return
    findings.push({ line: line + 1, text: text.trim().replace(/\s+/g, ' ') })
  }
  const reportLiterals = (
    expression: ts.Expression,
    accept: (text: string) => boolean = () => true,
  ) => {
    for (const literal of literalsOf(expression))
      if (accept(literal.text)) report(literal, literal.text)
  }
  const renderedStringArray = (expression: ts.Expression) => {
    const target =
      ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)
        ? expression.expression.expression
        : expression
    return (
      ts.isIdentifier(target) &&
      stringArrays.has(target.text) &&
      !(
        ts.isCallExpression(expression) &&
        expression.arguments[0] &&
        translatesItem(expression.arguments[0])
      )
    )
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
    } else if (ts.isJsxAttribute(node) && isVisibleName(node.name.getText(file))) {
      const value = node.initializer
      if (value && ts.isStringLiteral(value)) report(value, value.text)
      else if (value && ts.isJsxExpression(value) && value.expression)
        reportLiterals(value.expression)
    } else if (
      ts.isPropertyAssignment(node) &&
      (isVisibleName(propertyName(node.name, file)) || isTableName(node, file))
    ) {
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
        } else if (NOTICE_SETTER.test(callee.name)) {
          // A later argument is often a status word (`'uploading'`); only a sentence is a message.
          node.arguments.forEach((argument, index) => {
            reportLiterals(argument, index === 0 ? () => true : (text) => /\s/.test(text.trim()))
          })
        } else if (DIALOG_FUNCTIONS.has(callee.name) && first) reportLiterals(first)
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
