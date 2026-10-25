import { afterEach, describe, expect, test } from 'bun:test'
import { formatRoomArea } from '../components/editor/room-labels'
import { setLocale } from '../i18n'
import { measurementHint, parseMeasurement } from '../index'
import { normalizeDecimalComma, parsePlainNumber } from './measurement-parser'
import {
  buildMeasurementAngleArcPoints,
  cubicMetersToVolumeUnit,
  formatAreaLabel,
  formatLinearMeasurement,
  formatVolumeLabel,
  getAreaUnitLabel,
  getLinearUnitLabel,
  getVolumeUnitLabel,
  linearControlValueToMeters,
  linearUnitToMeters,
  MEASUREMENT_ACTIVE_COLOR,
  MEASUREMENT_DANGLING_COLOR,
  MEASUREMENT_FLOORPLAN_COLOR,
  MEASUREMENT_PERSISTENT_COLOR,
  measurementFloorplanPresentationColor,
  measurementPresentationColor,
  metersToLinearUnit,
  squareMetersToAreaUnit,
} from './measurements'

describe('measurement presentation', () => {
  test('uses black at rest, indigo while active, and red for dangling references', () => {
    expect(measurementPresentationColor(false, false)).toBe(MEASUREMENT_PERSISTENT_COLOR)
    expect(measurementPresentationColor(false, true)).toBe(MEASUREMENT_ACTIVE_COLOR)
    expect(measurementPresentationColor(true, false)).toBe(MEASUREMENT_DANGLING_COLOR)
    expect(measurementPresentationColor(true, true)).toBe(MEASUREMENT_DANGLING_COLOR)
  })

  test('uses an indigo analysis color for resting 2D measurements', () => {
    expect(measurementFloorplanPresentationColor(false, false)).toBe(MEASUREMENT_FLOORPLAN_COLOR)
    expect(measurementFloorplanPresentationColor(false, true)).toBe(MEASUREMENT_ACTIVE_COLOR)
    expect(measurementFloorplanPresentationColor(true, false)).toBe(MEASUREMENT_DANGLING_COLOR)
  })
})

describe('angle arc presentation', () => {
  test('samples the smaller angle from the first ray to the second', () => {
    const arc = buildMeasurementAngleArcPoints([1, 0, 0], [0, 0, 0], [0, 0, 1], {
      radius: 0.25,
      sampleCount: 8,
    })

    expect(arc).toHaveLength(9)
    expect(arc[0]?.[0]).toBeCloseTo(0.25)
    expect(arc[0]?.[2]).toBeCloseTo(0)
    expect(arc.at(-1)?.[0]).toBeCloseTo(0)
    expect(arc.at(-1)?.[2]).toBeCloseTo(0.25)
    expect(arc[4]?.[0]).toBeGreaterThan(0)
    expect(arc[4]?.[2]).toBeGreaterThan(0)
  })

  test('keeps a constant radius on an arbitrary 3D angle plane', () => {
    const arc = buildMeasurementAngleArcPoints([1, 0, 0], [0, 0, 0], [0, 1, 0], {
      radius: 0.3,
    })

    expect(arc.length).toBeGreaterThan(4)
    for (const point of arc) expect(Math.hypot(...point)).toBeCloseTo(0.3)
    expect(arc.at(-1)?.[1]).toBeCloseTo(0.3)
  })

  test('omits an arc when either ray is degenerate', () => {
    expect(buildMeasurementAngleArcPoints([0, 0, 0], [0, 0, 0], [1, 0, 0])).toEqual([])
  })
})

describe('linear measurements', () => {
  test('formats metric measurements in meters', () => {
    expect(formatLinearMeasurement(3, 'metric')).toBe('3m')
    expect(formatLinearMeasurement(3.456, 'metric')).toBe('3.46m')
  })

  test('formats metric measurements in whole millimeters', () => {
    expect(formatLinearMeasurement(3.456, 'metric', 'millimeters')).toBe('3456mm')
    expect(formatLinearMeasurement(-0.1524, 'metric', 'millimeters')).toBe('-152mm')
    expect(formatLinearMeasurement(0.2, 'metric', 'millimeters')).toBe('200mm')
    expect(formatLinearMeasurement(18.4, 'metric', 'millimeters')).toBe('18400mm')
    expect(formatLinearMeasurement(0.0005, 'metric', 'millimeters')).toBe('1mm')
    expect(formatLinearMeasurement(-0.0005, 'metric', 'millimeters')).toBe('-1mm')
  })

  test('formats imperial measurements as feet and inches', () => {
    expect(formatLinearMeasurement(3.048, 'imperial')).toBe(`10'0"`)
    expect(formatLinearMeasurement(3.2004, 'imperial')).toBe(`10'6"`)
  })

  test('carries rounded 12 inches into the next foot', () => {
    expect(formatLinearMeasurement(3.047, 'imperial')).toBe(`10'0"`)
  })

  test('returns a placeholder for non-finite measurements', () => {
    expect(formatLinearMeasurement(NaN, 'imperial')).toBe('--')
    expect(formatLinearMeasurement(Infinity, 'imperial')).toBe('--')
    expect(formatLinearMeasurement(NaN, 'metric')).toBe('--')
  })

  test('formats zero measurements', () => {
    expect(formatLinearMeasurement(0, 'imperial')).toBe(`0'0"`)
    expect(formatLinearMeasurement(0, 'metric')).toBe('0m')
  })

  test('formats sub-foot imperial measurements', () => {
    expect(formatLinearMeasurement(0.1524, 'imperial')).toBe(`0'6"`)
  })

  test('formats negative measurements with a sign', () => {
    expect(formatLinearMeasurement(-0.1524, 'imperial')).toBe(`-0'6"`)
    expect(formatLinearMeasurement(-0.1524, 'metric')).toBe('-0.15m')
  })

  test('converts between meters and the active linear unit', () => {
    expect(metersToLinearUnit(0, 'imperial')).toBe(0)
    expect(linearUnitToMeters(0, 'imperial')).toBe(0)

    expect(metersToLinearUnit(1, 'metric')).toBe(1)
    expect(linearUnitToMeters(1, 'metric')).toBe(1)

    expect(metersToLinearUnit(0.3048, 'imperial')).toBeCloseTo(1)
    expect(linearUnitToMeters(1, 'imperial')).toBeCloseTo(0.3048)
  })

  test('converts numeric control input back to meters for wall panel edits', () => {
    expect(linearControlValueToMeters(10, 'imperial')).toBeCloseTo(3.048)
    expect(linearControlValueToMeters(0.5, 'imperial')).toBeCloseTo(0.1524)
    expect(linearControlValueToMeters(-1, 'imperial')).toBeCloseTo(-0.3048)
    expect(linearControlValueToMeters(3.5, 'metric')).toBe(3.5)
  })

  test('clamps numeric control input after converting to meters', () => {
    expect(linearControlValueToMeters(0.1, 'imperial', { minMeters: 0.1 })).toBe(0.1)
    expect(linearControlValueToMeters(0.3, 'imperial', { minMeters: 0.1 })).toBe(0.1)
    expect(linearControlValueToMeters(19.7, 'imperial', { maxMeters: 6 })).toBe(6)
    expect(linearControlValueToMeters(0.2, 'metric', { minMeters: 0.1 })).toBe(0.2)
    expect(linearControlValueToMeters(0.2, 'metric', { maxMeters: 0.15 })).toBe(0.15)
  })

  test('returns the display label for numeric controls', () => {
    expect(getLinearUnitLabel('metric')).toBe('m')
    expect(getLinearUnitLabel('imperial')).toBe('ft')
  })
})

describe('area measurements', () => {
  test('converts square meters to the active area unit', () => {
    expect(squareMetersToAreaUnit(0, 'imperial')).toBe(0)
    expect(squareMetersToAreaUnit(12.5, 'metric')).toBe(12.5)
    expect(squareMetersToAreaUnit(1, 'imperial')).toBeCloseTo(10.7639)
  })

  test('returns the display label for area readouts', () => {
    expect(getAreaUnitLabel('metric')).toBe('m²')
    expect(getAreaUnitLabel('imperial')).toBe('ft²')
  })

  test('formats an area label with value and unit', () => {
    expect(formatAreaLabel(12.34, 'metric')).toBe('12.3m²')
    expect(formatAreaLabel(1, 'imperial')).toBe('10.8ft²')
    expect(formatAreaLabel(12.34, 'metric', 2)).toBe('12.34m²')
  })

  test('returns a placeholder for non-finite areas', () => {
    expect(formatAreaLabel(NaN, 'metric')).toBe('--')
    expect(formatAreaLabel(Infinity, 'imperial')).toBe('--')
  })
})

describe('volume measurements', () => {
  test('converts cubic meters to the active volume unit', () => {
    expect(cubicMetersToVolumeUnit(0, 'imperial')).toBe(0)
    expect(cubicMetersToVolumeUnit(12.5, 'metric')).toBe(12.5)
    expect(cubicMetersToVolumeUnit(1, 'imperial')).toBeCloseTo(35.3147)
  })

  test('returns the display label for volume readouts', () => {
    expect(getVolumeUnitLabel('metric')).toBe('m³')
    expect(getVolumeUnitLabel('imperial')).toBe('ft³')
  })

  test('formats a volume label with value and unit', () => {
    expect(formatVolumeLabel(12.34, 'metric')).toBe('12.3m³')
    expect(formatVolumeLabel(1, 'imperial')).toBe('35.3ft³')
    expect(formatVolumeLabel(12.34, 'metric', 2)).toBe('12.34m³')
  })

  test('returns a placeholder for non-finite volumes', () => {
    expect(formatVolumeLabel(NaN, 'metric')).toBe('--')
    expect(formatVolumeLabel(Infinity, 'imperial')).toBe('--')
    expect(formatVolumeLabel(Number.NEGATIVE_INFINITY, 'metric')).toBe('--')
  })
})

describe('typed measurement fields', () => {
  test('canonicalizes explicit, compound, and scientific dimensions', () => {
    const length = { kind: 'length', unitId: 'm' } as const
    expect(parseMeasurement('180cm', length)).toBeCloseTo(1.8)
    expect(parseMeasurement('1m80', length)).toBeCloseTo(1.8)
    expect(parseMeasurement(`5'11"`, length)).toBeCloseTo(1.8034)
    expect(parseMeasurement('1.234e-4 m', length)).toBeCloseTo(0.0001234, 10)
    expect(parseMeasurement('6', length, { bareUnit: 'ft' })).toBeCloseTo(1.8288)
    expect(parseMeasurement('180deg', { kind: 'angle', unitId: 'rad' })).toBeCloseTo(Math.PI)
  })

  test('rejects ranges, incomplete arithmetic, and nonfinite input', () => {
    const length = { kind: 'length', unitId: 'm' } as const
    for (const input of ['2+3 m', '2-3 m', 'between 2 and 3 m', '1e999 m']) {
      expect(parseMeasurement(input, length)).toBeNull()
      expect(measurementHint(input, length)).toBeNull()
    }
    expect(measurementHint('180cm', length)).toBe('= 1.80 m')
    expect(measurementHint('6', length)).toBeNull()
  })
})

describe('measurements in the active language', () => {
  afterEach(() => setLocale('en'))

  test('Swedish writes a decimal comma and a space before the unit', () => {
    const cases = [
      [formatAreaLabel(818.7, 'metric', 1, 'sv'), '818,7 m²'],
      [formatAreaLabel(12, 'metric', 2, 'sv'), '12,00 m²'],
      [formatAreaLabel(12, 'imperial', 1, 'sv'), '129,2 ft²'],
      [formatVolumeLabel(3.456, 'metric', 2, 'sv'), '3,46 m³'],
      [formatLinearMeasurement(3.5, 'metric', 'meters', 'sv'), '3,5 m'],
      [formatLinearMeasurement(-2.25, 'metric', 'meters', 'sv'), '-2,25 m'],
      [formatLinearMeasurement(1.234, 'metric', 'millimeters', 'sv'), '1234 mm'],
      [formatLinearMeasurement(1000, 'metric', 'meters', 'sv'), '1000 m'],
    ]
    for (const [actual, expected] of cases) expect(actual).toBe(expected)
  })

  test('English keeps the point and the unit attached', () => {
    expect(formatAreaLabel(818.7, 'metric', 1, 'en')).toBe('818.7m²')
    expect(formatLinearMeasurement(3.5, 'metric', 'meters', 'en')).toBe('3.5m')
    expect(formatLinearMeasurement(1.234, 'metric', 'millimeters', 'en')).toBe('1234mm')
  })

  test('English digits are exactly the ones toFixed gives, where Intl would round half up', () => {
    const cases = [
      [formatAreaLabel(0.15, 'metric', 1, 'en'), '0.1m²'],
      [formatAreaLabel(1.15, 'metric', 1, 'en'), '1.1m²'],
      [formatAreaLabel(2.675, 'metric', 2, 'en'), '2.67m²'],
      [formatAreaLabel(2.55, 'metric', 1, 'en'), '2.5m²'],
      [formatVolumeLabel(1.005, 'metric', 2, 'en'), '1.00m³'],
      [formatVolumeLabel(0.35, 'metric', 1, 'en'), '0.3m³'],
      [formatRoomArea(0.15, 'metric'), '0.1 m²'],
    ]
    for (const [actual, expected] of cases) expect(actual).toBe(expected)
  })

  test('Swedish digits are the same ones with a comma, and a negative keeps the ASCII minus', () => {
    expect(formatAreaLabel(0.15, 'metric', 1, 'sv')).toBe('0,1 m²')
    expect(formatAreaLabel(-1, 'metric', 1, 'sv')).toBe('-1,0 m²')
    expect(formatLinearMeasurement(-1.5, 'metric', 'meters', 'sv')).toBe('-1,5 m')
  })

  test('feet and inches read the same in both languages', () => {
    expect(formatLinearMeasurement(5.8, 'imperial', 'meters', 'sv')).toBe(`19'0"`)
    expect(formatLinearMeasurement(5.8, 'imperial', 'meters', 'en')).toBe(`19'0"`)
  })

  test('without a language argument the formatters follow the stored preference', () => {
    expect(formatAreaLabel(818.7, 'metric')).toBe('818.7m²')
    setLocale('sv')
    expect(formatAreaLabel(818.7, 'metric')).toBe('818,7 m²')
    expect(formatRoomArea(33, 'metric')).toBe('33,0 m²')
  })

  test('a comma decimal is read in Swedish, and a point in both', () => {
    const length = { kind: 'length', unitId: 'm' } as const
    expect(parseMeasurement('1,5', length, { locale: 'sv' })).toBeCloseTo(1.5)
    expect(parseMeasurement('1,5 m', length, { locale: 'sv' })).toBeCloseTo(1.5)
    expect(parseMeasurement('1,500', length, { locale: 'sv' })).toBeCloseTo(1.5)
    expect(parseMeasurement('180 cm', length, { locale: 'sv' })).toBeCloseTo(1.8)
    expect(parseMeasurement('1.5', length, { locale: 'sv' })).toBeCloseTo(1.5)
    expect(parseMeasurement('1.5', length, { locale: 'en' })).toBeCloseTo(1.5)
    expect(parseMeasurement('1,500', length, { locale: 'en' })).toBeCloseTo(1500)
  })

  test('Swedish keeps the English reading when the text also has a point', () => {
    const length = { kind: 'length', unitId: 'm' } as const
    expect(parseMeasurement('1,234.5 m', length, { locale: 'sv' })).toBeCloseTo(1234.5)
    expect(parseMeasurement('1,234.5 m', length, { locale: 'en' })).toBeCloseTo(1234.5)
    expect(parseMeasurement(`5'11"`, length, { locale: 'sv' })).toBeCloseTo(1.8034)
    expect(parseMeasurement(`5'11"`, length, { locale: 'en' })).toBeCloseTo(1.8034)
  })

  test('a typed number commits only when it is whole', () => {
    const cases = [
      ['1,5', 'sv', 1.5],
      ['1.5', 'sv', 1.5],
      ['-2,25', 'sv', -2.25],
      ['1.5', 'en', 1.5],
      ['1,5 cm garbage', 'sv', null],
      ['1.5 cm garbage', 'en', null],
      ['1.5abc', 'en', null],
      ['', 'en', null],
    ] as const
    for (const [text, locale, expected] of cases)
      expect(parsePlainNumber(text, locale)).toBe(expected)
  })

  test('a plain Swedish decimal gets no hint; a unit still does', () => {
    const length = { kind: 'length', unitId: 'm' } as const
    expect(measurementHint('1,5', length, { locale: 'sv' })).toBeNull()
    expect(measurementHint('1,5 cm', length, { locale: 'sv' })).toBe('= 0,02 m')
    expect(measurementHint('1,234.5 m', length, { locale: 'sv' })).toBe('= 1234,50 m')
    expect(measurementHint('1,234.5 m', length, { locale: 'en' })).toBe('= 1234.50 m')
    expect(normalizeDecimalComma('1,5', 'sv')).toBe('1.5')
    expect(normalizeDecimalComma('1,5', 'en')).toBe('1,5')
  })
})
