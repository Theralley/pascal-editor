import { expect, test } from 'bun:test'
import { createDeferredRetry } from './deferred-retry'

function fakeTimers() {
  const queue = new Map<number, () => void>()
  let next = 0
  return {
    timers: {
      set: (callback: () => void) => {
        queue.set(++next, callback)
        return next
      },
      clear: (handle: number) => void queue.delete(handle),
    },
    fire: () => {
      for (const [handle, callback] of [...queue]) {
        queue.delete(handle)
        callback()
      }
    },
    size: () => queue.size,
  }
}

test('a newer deferral replaces the pending retry, which then runs once', () => {
  const fake = fakeTimers()
  let runs = 0
  const retry = createDeferredRetry(() => runs++, fake.timers)

  retry.schedule(2500)
  retry.schedule(1000)
  expect(fake.size()).toBe(1)
  fake.fire()
  fake.fire()

  expect(runs).toBe(1)
})

test('a cancelled retry never runs', () => {
  const fake = fakeTimers()
  let runs = 0
  const retry = createDeferredRetry(() => runs++, fake.timers)

  retry.schedule(1000)
  retry.cancel()
  fake.fire()

  expect(runs).toBe(0)
})
