import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeDefinition,
  type AnyNodeId,
  nodeRegistry,
  registerNode,
} from '@pascal-app/core'
import { z } from 'zod'
import {
  createQuickMeasurementPointerScheduler,
  resolveQuickMeasurementReport,
} from './quick-measurement'

function pointer(clientX: number, clientY: number): PointerEvent {
  return { clientX, clientY } as PointerEvent
}

function createFrameDriver() {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  return {
    driver: {
      request: (callback: FrameRequestCallback) => {
        const id = nextId++
        callbacks.set(id, callback)
        return id
      },
      cancel: (frameId: number) => callbacks.delete(frameId),
    },
    pending: () => callbacks.size,
    runNext: (timestamp: number) => {
      const next = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined
      if (!next) throw new Error('No animation frame scheduled')
      callbacks.delete(next[0])
      next[1](timestamp)
    },
  }
}

describe('createQuickMeasurementPointerScheduler', () => {
  test('keeps only the latest pointer event and caps expensive work', () => {
    const frames = createFrameDriver()
    const processed: PointerEvent[] = []
    const scheduler = createQuickMeasurementPointerScheduler(
      (event) => processed.push(event),
      frames.driver,
    )

    scheduler.enqueue(pointer(1, 1))
    scheduler.enqueue(pointer(8, 4))
    expect(frames.pending()).toBe(1)
    frames.runNext(0)
    expect(processed.map((event) => [event.clientX, event.clientY])).toEqual([[8, 4]])

    scheduler.enqueue(pointer(12, 4))
    frames.runNext(16)
    expect(processed).toHaveLength(1)
    expect(frames.pending()).toBe(1)

    scheduler.enqueue(pointer(20, 7))
    frames.runNext(32)
    expect(processed.map((event) => [event.clientX, event.clientY])).toEqual([
      [8, 4],
      [20, 7],
    ])
  })

  test('ignores sub-pixel jitter and cancels queued work', () => {
    const frames = createFrameDriver()
    const processed: PointerEvent[] = []
    const scheduler = createQuickMeasurementPointerScheduler(
      (event) => processed.push(event),
      frames.driver,
    )

    scheduler.enqueue(pointer(10, 10))
    frames.runNext(0)
    scheduler.enqueue(pointer(10.5, 10.5))
    frames.runNext(32)
    expect(processed).toHaveLength(1)

    scheduler.enqueue(pointer(20, 20))
    scheduler.clear()
    expect(frames.pending()).toBe(0)
    expect(processed).toHaveLength(1)
  })
})

describe('resolveQuickMeasurementReport', () => {
  let restoreRegistry: () => void = () => {}
  beforeAll(() => {
    restoreRegistry = nodeRegistry._snapshot()
    nodeRegistry._reset()
    registerNode({
      kind: 'fixture-wall',
      schemaVersion: 1,
      schema: z.object({}),
      category: 'structure',
      defaults: () => ({}),
      capabilities: {},
      translations: { sv: { Wall: 'Vägg', Pace: 'Takt' } },
      measurement: {
        features: () => [],
        quickMeasure: (node: AnyNode) => ({
          title: node.name ?? 'Wall',
          kindLabel: 'Wall',
          anchor: [0, 0, 0],
          metrics: [
            { key: 'pace', label: 'Pace', abbreviation: 'P', quantity: 'length', value: 1 },
          ],
        }),
      },
    } as unknown as AnyNodeDefinition)
  })
  afterAll(() => restoreRegistry())

  const nodeOf = (name?: string) =>
    ({ id: 'n1', type: 'fixture-wall', visible: true, parentId: null, name }) as unknown as AnyNode

  test('translates the kind label and metric labels, and the title of an unnamed node only', () => {
    const cases = [
      { name: undefined, locale: 'sv', title: 'Vägg', kindLabel: 'Vägg', metric: 'Takt' },
      { name: 'Wall', locale: 'sv', title: 'Wall', kindLabel: 'Vägg', metric: 'Takt' },
      { name: undefined, locale: 'en', title: 'Wall', kindLabel: 'Wall', metric: 'Pace' },
    ] as const
    for (const { name, locale, title, kindLabel, metric } of cases) {
      const report = resolveQuickMeasurementReport(
        'n1',
        { n1: nodeOf(name) } as Record<AnyNodeId, AnyNode>,
        locale,
      )
      expect([report?.title, report?.kindLabel, report?.metrics[0]?.label]).toEqual([
        title,
        kindLabel,
        metric,
      ])
    }
  })
})
