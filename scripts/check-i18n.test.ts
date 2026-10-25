import { describe, expect, test } from 'bun:test'
import { findHardcodedText } from './check-i18n'

const texts = (source: string) => findHardcodedText(source).map((finding) => finding.text)

describe('findHardcodedText', () => {
  test.each([
    ['JSX text', '<p>Save the file</p>', ['Save the file']],
    ['JSX text across lines', '<p>\n  Save the\n  file\n</p>', ['Save the file']],
    ['a string literal in a visible prop', '<Button title="Save" />', ['Save']],
    ['an expression literal in a visible prop', "<Input placeholder={'Name'} />", ['Name']],
    ['aria-label', '<Button aria-label="Close" />', ['Close']],
    ['either branch of a conditional', "<Tip label={on ? 'On' : 'Off'} />", ['On', 'Off']],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: JSX source under test
    ['a template literal', '<Tip description={`Remove ${name}`} />', ['Remove']],
    ['a string child', "<p>{'Hello'}</p>", ['Hello']],
    ['a fallback literal', "<p>{name ?? 'Unnamed'}</p>", ['Unnamed']],
    ['a toast', "toast.error('Could not save')", ['Could not save']],
    ['a bare toast', "toast('Saved')", ['Saved']],
    ['text beside a product term', '<p>Open Pascal now</p>', ['Open Pascal now']],
  ])('flags %s', (_label, source, expected) => {
    expect(
      texts(`const view = ${source.startsWith('toast') ? `() => ${source}` : source}`),
    ).toEqual(expected)
  })

  test.each([
    ['a catalog call', "<p>{t('save')}</p>"],
    ['a catalog call in a prop', "<Button title={t('save')} />"],
    ['a translated toast', "toast.error(t('failed'))"],
    ['whitespace children', "<p>{' '}</p>"],
    ['non-alphabetic text', '<span>×1.5</span>'],
    ['numbers and symbols', '<span>· 12 %</span>'],
    ['a product term alone', '<span>Pascal</span>'],
    ['product terms only', '<span>GLB / IFC</span>'],
    ['an unrelated prop', '<input type="file" className="hidden" id="upload" />'],
    ['a non-visible literal', '<Item key={\'abc\'} value="abc" />'],
    ['the per-line escape', '<p>Hello</p> // i18n-ignore'],
    ['the escape on the line above', 'const view = (\n// i18n-ignore\n<p>Hello</p>\n)'],
  ])('allows %s', (_label, source) => {
    expect(texts(`const view = ${source}`)).toEqual([])
  })

  test.each([
    [
      'JSX text with the marker (it would print)',
      'const v = (\n<div>\n  <p>Hello</p> // i18n-ignore\n</div>\n)',
      ['Hello', '// i18n-ignore'],
    ],
    [
      'a marker line inside JSX text',
      'const v = (\n<div>\n  // i18n-ignore\n  <p>Hello</p>\n</div>\n)',
      ['// i18n-ignore', 'Hello'],
    ],
    [
      'a label in an object in an array',
      "const v = <Select options={[{ label: 'Metric', value: 'm' }]} />",
      ['Metric'],
    ],
    ['a table label read later', "const ITEMS = [{ label: 'Save file' }]", ['Save file']],
    [
      'a string array rendered by map',
      "const NAMES = ['Wall', 'Door']\nconst v = <ul>{NAMES.map((n) => <li>{n}</li>)}</ul>",
      ['Wall', 'Door'],
    ],
    ['a tooltip prop', 'const v = <Btn tooltip="Delete wall" />', ['Delete wall']],
    [
      'a TooltipContent child',
      'const v = <TooltipContent>Delete wall</TooltipContent>',
      ['Delete wall'],
    ],
    [
      'showNotice',
      "const f = () => useEditor.getState().showNotice('Wall removed')",
      ['Wall removed'],
    ],
    ['a set…Error call', "const f = () => setError('Could not save')", ['Could not save']],
    [
      'a set…Message object',
      "const f = () => setSendMessage({ tone: 'error', text: 'Not found' })",
      ['Not found'],
    ],
    [
      'toast.promise options',
      "const f = () => toast.promise(run(), { loading: 'Saving', success: 'Saved', error: 'Failed' })",
      ['Saving', 'Saved', 'Failed'],
    ],
    ['a map callback string', "const v = <p>{xs.map(() => 'Item')}</p>", ['Item']],
    ['confirm', "const f = () => window.confirm('Delete everything?')", ['Delete everything?']],
    ['aria-valuetext', 'const v = <div aria-valuetext="Half open" />', ['Half open']],
    ['ariaLabel', 'const v = <Icon ariaLabel="Close" />', ['Close']],
    ['a conditional with &&', "const v = <p>{ready && 'Ready now'}</p>", ['Ready now']],
  ])('also flags %s', (_label, source, expected) => {
    expect(texts(source)).toEqual(expected)
  })

  test.each([
    [
      'a fallback beside a translated key',
      "const v = <ul>{['save'].map((k) => (ready ? t(k) : 'Missing translation'))}</ul>",
      ['Missing translation'],
    ],
    [
      'raw labels beside an unrelated translated tooltip',
      "const v = <ul>{['Wall', 'Door'].map((n) => <li title={t('tip')}>{n}</li>)}</ul>",
      ['Wall', 'Door'],
    ],
    [
      'a comment-and-code line above',
      'const v = (\n<div>\n{/* i18n-ignore */}<p>Ignored</p>\n<p>Shown</p>\n</div>\n)',
      ['Shown'],
    ],
    ['defaultName', 'const v = <Row defaultName="Unnamed room" />', ['Unnamed room']],
    ['name in an option table', "const rows = [{ id: 'wall', name: 'Wall' }]", ['Wall']],
    ['name beside an icon', "const row = { icon: Box, name: 'Items' }", ['Items']],
    [
      'a sentence as a later setter argument',
      "const f = () => setStatus(id, 'Upload failed, try again')",
      ['Upload failed, try again'],
    ],
    ['a lone key name outside a key context', 'const v = <Button>Delete</Button>', ['Delete']],
    ['Enter in a prop', 'const v = <Btn vrLabel="Enter VR" />', ['Enter VR']],
    ['a detail key', "const rows = [{ detail: 'Needs a roof' }]", ['Needs a roof']],
    ['a subtitle key', "const row = { subtitle: 'Draft' }", ['Draft']],
    [
      'a label written as a function',
      "const row = { label: () => (open ? 'Exit Preview' : 'Enter Preview') }",
      ['Exit Preview', 'Enter Preview'],
    ],
    ['a block function label', "const row = { label: () => { return 'Close it' } }", ['Close it']],
    [
      'a setter message that is not first',
      "const f = () => setError(levelId, 'Could not add that scan.')",
      ['Could not add that scan.'],
    ],
    [
      'an inline array mapped in JSX',
      "const v = <ul>{['Wall', 'Door'].map((n) => <li>{n}</li>)}</ul>",
      ['Wall', 'Door'],
    ],
    [
      'an as-const array mapped in JSX',
      "const NAMES = ['Wall', 'Door'] as const\nconst v = <ul>{NAMES.map((n) => <li>{n}</li>)}</ul>",
      ['Wall', 'Door'],
    ],
    [
      'a template ternary',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: JSX source under test
      'const v = <p>{open ? `Close ${name}` : `Open ${name}`}</p>',
      ['Close', 'Open'],
    ],
    [
      'a toast callback string',
      "const f = () => toast.promise(run(), { success: (d) => 'Saved it' })",
      ['Saved it'],
    ],
    [
      'a marker inside a string',
      "const f = () => setError('Could not save') && 'i18n-ignore'",
      ['Could not save'],
    ],
    [
      'a marker only in a string above',
      "const note = '// i18n-ignore'\nconst v = <p>Hello</p>",
      ['Hello'],
    ],
    [
      'a trailing marker silencing the next line',
      'const v = (\n<div>\n{x} {/* i18n-ignore */}\n<p>Hello</p>\n</div>\n)',
      ['Hello'],
    ],
  ])('also flags %s', (_label, source, expected) => {
    expect(texts(source)).toEqual(expected)
  })

  test.each([
    ['a name without table siblings', "const node = { name: 'Wall' }"],
    ['a status word as a later setter argument', "const f = () => setStatus(levelId, 'uploading')"],
    ['a key name in a keys array', "const row = { keys: ['Ctrl', 'Delete'], action: 'x.y' }"],
    ['a key name in a kbd', 'const v = <kbd>Delete</kbd>'],
    ['a key name in a ShortcutToken', 'const v = <ShortcutToken value="Enter" />'],
    ['a shortcut table', "const SHORTCUTS = [{ keys: ['Esc'] }]"],
    ['an axis letter', 'const v = <text>X</text>'],
    ['CSS in a style element', 'const v = <style>{`.a { color: red; }`}</style>'],
    [
      'an array of catalog keys',
      "const KEYS = ['save', 'cancel']\nconst v = <ul>{KEYS.map((k) => <li>{t(k)}</li>)}</ul>",
    ],
    [
      'an inline array translated by t',
      "const v = <ul>{['save', 'cancel'].map((k) => <li>{t(k)}</li>)}</ul>",
    ],
    ['a Key field', "const rows = [{ labelKey: 'save' }]"],
    [
      'a trailing marker on its own line',
      "const f = () => setError('Could not save') // i18n-ignore",
    ],
  ])('also allows %s', (_label, source) => {
    expect(texts(source)).toEqual([])
  })

  test.each([
    ['a comparison operand', "const v = <p>{mode === 'edit' ? t('a') : t('b')}</p>"],
    ['a unit symbol', 'const v = <tspan>m</tspan>'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: JSX source under test
    ['a unit after a number', 'const v = <span>{`${n} m`}</span>'],
    ['a square-metre symbol', 'const v = <span>m²</span>'],
    ['a key name', 'const v = <kbd>Ctrl</kbd>'],
    ['an entity', 'const v = <p>&nbsp;</p>'],
    ['entities between expressions', 'const v = <p>{a}&nbsp;&times;&nbsp;{b}</p>'],
    ['a path', 'const v = <code>{url}/api/scenes</code>'],
    ['a URL', 'const v = <a href="https://example.com">{t(\'link\')}</a>'],
    ['a product label', 'const v = <Badge label="Pro" />'],
    ['a catalog key in a table', "const ROWS = [{ label: 'floors.add' }]"],
    ['an error nobody shows yet', "const f = () => { throw new Error('Export failed') }"],
    ['a variable', "const label = open ? 'Close panel' : 'Open panel'\nconst v = <b>{label}</b>"],
    [
      'a real JSX comment escape',
      'const v = (\n<div>\n  {/* i18n-ignore */}\n  <p>Hello</p>\n</div>\n)',
    ],
    [
      'a real comment at the end of a JS line',
      "const f = () => setError('Could not save') // i18n-ignore",
    ],
  ])('allows %s', (_label, source) => {
    expect(texts(source)).toEqual([])
  })

  test('reports the line of the text', () => {
    const source = 'const view = (\n  <div>\n    <p>Hello</p>\n  </div>\n)'
    expect(findHardcodedText(source)).toEqual([{ line: 3, text: 'Hello' }])
  })
})
