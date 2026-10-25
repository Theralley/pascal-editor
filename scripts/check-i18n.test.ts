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
    ['the escape on the line above', '// i18n-ignore\n<p>Hello</p>'],
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
