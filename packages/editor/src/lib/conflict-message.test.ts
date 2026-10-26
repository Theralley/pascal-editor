import { describe, expect, test } from 'bun:test'
import { conflictMessage, conflictMessages } from './conflict-message'

describe('conflictMessage', () => {
  const cases: [string, { code?: string; message: string }, string][] = [
    [
      'shared storey',
      {
        code: 'floor-foundation-shared-storey',
        message: 'The upper floor also sits over Kitchen floor; raise both or neither.',
      },
      'Bjälklaget ovanför vilar också på Kitchen floor. Höj båda eller ingen.',
    ],
    [
      'opening fit',
      { code: 'floor-opening-fit', message: 'Floor must be at most 0.35 m for door to fit.' },
      'Golvet får ligga högst 0,35 m för att dörren ska rymmas.',
    ],
    [
      'by code',
      { code: 'floor-door-step', message: 'The doorway step exceeds 20 cm and needs steps.' },
      'Tröskeln i dörröppningen är över 20 cm och behöver trappsteg.',
    ],
    [
      'drawn slab',
      {
        code: 'room-drawn-floor',
        message:
          "This room's floor is the drawn slab \"Deck\" (slab_1). Its height is the slab's: change that slab's elevation instead.",
      },
      'Rummets golv är det ritade bjälklaget ”Deck” (slab_1). Höjden sitter på bjälklaget: ändra bjälklagets höjd i stället.',
    ],
    ['unknown stays as core wrote it', { code: 'x', message: 'Something odd.' }, 'Something odd.'],
  ]
  test.each(cases)('%s', (_label, conflict, sv) => {
    expect(conflictMessage(conflict, 'en')).toBe(conflict.message)
    expect(conflictMessage(conflict, 'sv')).toBe(sv)
  })

  test('joins distinct refusals once', () => {
    const a = {
      code: 'floor-door-step',
      message: 'The doorway step exceeds 20 cm and needs steps.',
    }
    expect(conflictMessages([a, a], 'sv')).toBe(conflictMessage(a, 'sv'))
  })
})
