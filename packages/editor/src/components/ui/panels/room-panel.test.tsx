import { LevelNode, useScene, ZoneNode } from '@pascal-app/core'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { renderCurrentMarkup } from '../../../test-utils/render-current-markup'
import { setLocale } from '../../../i18n'
import { OpenRoomPanel } from './room-panel'

describe('Room panel in the active language', () => {
  beforeEach(() => {
    const level = LevelNode.parse({ id: 'level_room_panel', level: 0, children: ['zone_room_panel'] })
    const zone = ZoneNode.parse({
      id: 'zone_room_panel',
      parentId: level.id,
      name: 'Kök',
      spaceRole: 'room',
      polygon: [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
    })
    useScene.setState({
      nodes: { [level.id]: level, [zone.id]: zone },
      rootNodeIds: [level.id],
    })
  })
  afterEach(() => setLocale('en'))

  test('words the open-room header in English', () => {
    const html = renderCurrentMarkup(<OpenRoomPanel onClose={() => {}} zoneId="zone_room_panel" />)
    for (const text of ['Room · not enclosed', 'Room name', 'Expand panel']) expect(html).toContain(text)
  })

  test('words the open-room header in Swedish when the locale is sv', () => {
    setLocale('sv')
    const html = renderCurrentMarkup(<OpenRoomPanel onClose={() => {}} zoneId="zone_room_panel" />)
    for (const text of ['Rum · inte slutet', 'Rummets namn', 'Fäll ut panelen'])
      expect(html).toContain(text)
    expect(html).not.toContain('Room name')
  })
})
