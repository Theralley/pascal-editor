import { afterEach, describe, expect, test } from 'bun:test'
import type { QuickMeasurementReport } from '@pascal-app/core'
import { QuickMeasurementCard } from '../components/editor/quick-measurement-card'
import { setLocale, translate } from '../i18n'
import { renderCurrentMarkup } from '../test-utils/render-current-markup'
import { openWallEndsSummary } from './floorplan/open-wall-ends'
import { messages as helpMessages } from './help-messages'
import { hudTitleText, toolHudTitle } from './hud-title'
import { mezzanineConflictMessage, mezzanineOutsideMessage } from './mezzanine-messages'
import { paintScopeLabel } from './paint-scope'
import { regionLabel } from './point-ask/region'
import { placeholderFor, suggestionsFor } from './point-ask/suggestions'
import { localizeFootprintName, separateFloorSummary } from './room-built-on'
import { roomTransformMessage } from './room-transform-session'
import { zoneLabel } from './viewer-selection'
import { formatRegionBounds, wallRegionFaceLabels } from './wall-region-list'

const report: QuickMeasurementReport = {
  title: 'Hall',
  kindLabel: 'Room',
  anchor: [0, 0, 0],
  metrics: [{ key: 'area', label: 'Footprint', abbreviation: 'A', quantity: 'area', value: 12 }],
  note: 'Footprint only — room envelope not proven.',
}

// Each row calls a shared feeder and lists the text it must give per language.
const cases: { name: string; read: () => string; en: string; sv: string }[] = [
  {
    name: 'the zone label',
    read: () => zoneLabel({ name: '', spaceRole: 'room' } as Parameters<typeof zoneLabel>[0]),
    en: 'Room',
    sv: 'Rum',
  },
  {
    name: 'a mezzanine refusal',
    read: mezzanineOutsideMessage,
    en: 'Outside the room',
    sv: 'Utanför rummet',
  },
  {
    name: 'a mezzanine conflict by code',
    read: () => mezzanineConflictMessage('too-small') ?? '',
    en: 'At least 1 m²',
    sv: 'Minst 1 m²',
  },
  {
    name: 'a room transform refusal',
    read: () => roomTransformMessage('open-room'),
    en: 'Room is open',
    sv: 'Rummet är öppet',
  },
  {
    name: 'the wall face labels',
    read: () => wallRegionFaceLabels({}, 'wall_missing').a,
    en: 'Face A',
    sv: 'Sida A',
  },
  {
    name: 'wall region bounds',
    read: () => formatRegionBounds({ u0: 1.2, u1: 2.4 }, 'metric'),
    en: '1.20–2.40 m along',
    sv: '1,20–2,40 m längs',
  },
  {
    name: 'the open wall ends summary',
    read: () => openWallEndsSummary(1) ?? '',
    en: "1 wall end isn't joined",
    sv: 'En väggände är inte ihopfogad',
  },
  {
    name: 'the separate floor summary',
    read: () =>
      separateFloorSummary(
        { current: { name: 'Lanai floor' }, shared: { name: 'Shared floor' }, offset: -0.15 },
        (meters) => `${meters} m`,
      ),
    en: 'Lanai floor · 0.15 m below Shared floor',
    sv: 'Lanai floor · 0.15 m under Shared floor',
  },
  {
    name: 'a generated footprint name',
    read: () => localizeFootprintName('Kitchen floor', undefined),
    en: 'Kitchen floor',
    sv: 'Golv · Kitchen',
  },
  {
    name: 'the point-ask chips',
    read: () => suggestionsFor('door').join(' | '),
    en: 'Flip the swing',
    sv: 'Vänd slagriktningen',
  },
  {
    name: 'the point-ask placeholder',
    read: () => placeholderFor([]),
    en: 'Ask about this area…',
    sv: 'Fråga om det här området…',
  },
  {
    name: 'the region chip',
    read: () => regionLabel(2),
    en: 'Area · 2 elements',
    sv: 'Område · 2 element',
  },
  {
    name: 'the HUD title of the wall tool',
    read: () =>
      hudTitleText(toolHudTitle('wall', 'rectangle')!, (key) => translate(helpMessages, key)),
    en: 'Rectangle room',
    sv: 'Rektangulärt rum',
  },
  {
    name: 'the paint scope of a wall face',
    read: () =>
      paintScopeLabel('single', {
        scopes: ['single'],
        slotLabel: '',
        slotKey: 'scope.face',
        nodeNoun: 'wall',
      }),
    en: 'Face',
    sv: 'Väggsida',
  },
  {
    name: 'the quick measure card',
    read: () =>
      renderCurrentMarkup(
        <QuickMeasurementCard
          lensState="live"
          metricNotation="meters"
          report={report}
          unit="metric"
        />,
      ),
    en: 'Footprint',
    sv: 'Golvyta',
  },
]

describe('Shared feeders in the active language', () => {
  afterEach(() => setLocale('en'))

  for (const { name, read, en, sv } of cases) {
    test(`${name} reads English by default`, () => {
      const text = read()
      expect(text).toContain(en)
      expect(text).not.toContain(sv)
    })

    test(`${name} reads Swedish when the locale is sv`, () => {
      setLocale('sv')
      expect(read()).toContain(sv)
    })
  }
})
