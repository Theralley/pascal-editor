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

  test('reports the line of the text', () => {
    const source = 'const view = (\n  <div>\n    <p>Hello</p>\n  </div>\n)'
    expect(findHardcodedText(source)).toEqual([{ line: 3, text: 'Hello' }])
  })
})
