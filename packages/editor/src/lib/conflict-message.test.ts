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
      'Bjälklaget ovanför vilar också på Golv · Kitchen. Höj båda eller ingen.',
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
    [
      'floor key',
      {
        code: 'room-floor-footprint',
        message: 'Choose an existing floor key on this level, or "new".',
      },
      'Välj en befintlig golvnyckel på den här våningen, eller ”new”.',
    ],
    [
      'level the floors first, another storey',
      {
        code: 'room-floor-footprint',
        message: 'Level the floors first. Changing the footprint would move another storey.',
      },
      'Jämna ut golven först. Ändrad golvyta skulle flytta en annan våning.',
    ],
    [
      'level the floors first, door or window',
      {
        code: 'room-floor-footprint',
        message: 'Level the floors first. Changing the footprint would move a door or window.',
      },
      'Jämna ut golven först. Ändrad golvyta skulle flytta en dörr eller ett fönster.',
    ],
    [
      'level the floors first, unknown reason stays English',
      { code: 'room-floor-footprint', message: 'Level the floors first. Something new.' },
      'Level the floors first. Something new.',
    ],
    [
      'a door that does not fit',
      {
        code: 'floor-opening-fit',
        message: 'The door does not fit: it exceeds its wall top by 0.2 m.',
      },
      'Dörren ryms inte: den går 0,2 m över väggens överkant.',
    ],
    [
      'a window that does not fit',
      {
        code: 'floor-opening-fit',
        message: 'The window does not fit: it exceeds its wall top by 0.2 m.',
      },
      'Fönstret ryms inte: det går 0,2 m över väggens överkant.',
    ],
    [
      'a roof over two footprints',
      {
        code: 'floor-foundation-shared-storey',
        message: 'The roof also sits over Shared floor; raise both or neither.',
      },
      'Taket vilar också på Gemensamt golv. Höj båda eller ingen.',
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
