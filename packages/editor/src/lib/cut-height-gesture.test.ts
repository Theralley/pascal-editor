import { describe, expect, test } from 'bun:test'
import { createCutHeightGesture, cutHeightKeyTarget } from './cut-height-gesture'

function harness(projectId: string | null = 'p1') {
  const log: string[] = []
  const frames = new Map<number, () => void>()
  let next = 1
  let current = projectId
  const gesture = createCutHeightGesture({
    requestFrame: (callback) => {
      frames.set(next, callback)
      return next++
    },
    cancelFrame: (id) => void frames.delete(id),
    preview: (height) => log.push(`preview ${height}`),
    save: (height, project) => log.push(`save ${height} ${project}`),
    currentProjectId: () => current,
  })
  const runFrame = () => {
    for (const [id, callback] of [...frames]) {
      frames.delete(id)
      callback()
    }
  }
  return { gesture, log, runFrame, close: () => (current = null), frames }
}

describe('a cut height gesture', () => {
  test('previews once per frame and saves once, when it ends', () => {
    const { gesture, log, runFrame } = harness()
    gesture.move(0.3)
    gesture.move(0.4)
    gesture.move(0.5)
    expect(log).toEqual([])
    runFrame()
    expect(log).toEqual(['preview 0.5'])
    gesture.move(0.6)
    runFrame()
    expect(gesture.commit()).toBe(true)
    expect(log).toEqual(['preview 0.5', 'preview 0.6', 'save 0.6 p1'])
  })

  test('a second end of the same gesture saves nothing more, and no frame previews after it', () => {
    const { gesture, log, runFrame, frames } = harness()
    gesture.move(0.4)
    gesture.commit()
    expect(gesture.commit()).toBe(false)
    expect(frames.size).toBe(0)
    runFrame()
    expect(log).toEqual(['save 0.4 p1'])
  })

  test('ending it with nothing moved saves nothing', () => {
    const { gesture, log } = harness()
    expect(gesture.commit()).toBe(false)
    expect(log).toEqual([])
  })

  test('saves to the project it began on when that project is closed before it ends', () => {
    const { gesture, log, close } = harness('p1')
    gesture.move(0.4)
    close()
    gesture.move(0.45)
    gesture.commit()
    expect(log).toEqual(['save 0.45 p1'])
  })

  test('the next gesture is a new one, with its own project', () => {
    const { gesture, log, close } = harness('p1')
    gesture.move(0.4)
    gesture.commit()
    close()
    gesture.move(0.5)
    gesture.commit()
    expect(log).toEqual(['save 0.4 p1', 'save 0.5 null'])
  })
})

describe('keys on the slider row', () => {
  test.each([
    ['ArrowRight', 0.25, 0.26],
    ['ArrowLeft', 0.25, 0.24],
    ['PageUp', 0.25, 0.35],
    ['PageDown', 0.25, 0.15],
    ['Home', 0.25, 0.05],
    ['End', 0.25, 1.5],
    ['ArrowRight', 1.5, 1.5],
    ['PageDown', 0.08, 0.05],
    ['ArrowUp', 0.25, null],
    ['ArrowDown', 0.25, null],
    ['Tab', 0.25, null],
  ])('%s from %p sets %p', (key, current, expected) => {
    expect(cutHeightKeyTarget(key, current)).toBe(expected)
  })
})
