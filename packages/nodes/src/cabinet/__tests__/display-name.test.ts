import { expect, test } from 'bun:test'
import { setLocale } from '@pascal-app/editor'
import { cabinetDisplayName } from '../display-name'

test('a default name reads in the active language, with its number', () => {
  setLocale('sv')
  expect(cabinetDisplayName('Base Cabinet 3')).toBe('Underskåp 3')
  expect(cabinetDisplayName('Kitchen run')).toBe('Köksrad')
  setLocale('en')
  expect(cabinetDisplayName('Base Cabinet 3')).toBe('Base Cabinet 3')
})

test('a name the person typed is shown as typed, even one that is an object key', () => {
  setLocale('sv')
  for (const name of ['My kitchen', 'constructor', 'toString', '__proto__', 'hasOwnProperty'])
    expect(cabinetDisplayName(name)).toBe(name)
  setLocale('en')
})
