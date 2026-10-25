import { describe, expect, test } from 'bun:test'
import {
  BoxGeometry,
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Path,
  Shape,
} from 'three'
import { buildCutCapGeometry, sectionLoops } from './display-cut-section'

const material = new MeshBasicMaterial()

function capArea(geometry: BufferGeometry): number {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()!
  let total = 0
  for (let i = 0; i < index.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => index.getX(i + k))
    const up =
      (position.getZ(b!) - position.getZ(a!)) * (position.getX(c!) - position.getX(a!)) -
      (position.getX(b!) - position.getX(a!)) * (position.getZ(c!) - position.getZ(a!))
    expect(up).toBeGreaterThanOrEqual(-1e-9)
    total += up / 2
  }
  return total
}

const capOf = (section: ReturnType<typeof sectionLoops>) =>
  buildCutCapGeometry([{ owner: 'a', solids: section.solids }])
const sectionArea = (section: ReturnType<typeof sectionLoops>) =>
  capOf(section) ? capArea(capOf(section)!.geometry) : 0
const loopCount = (section: ReturnType<typeof sectionLoops>) => section.solids.flat().length

/** A slab `size` wide and deep, 1 m tall, with a square hole `hole` wide through its middle. */
function slabWithHole(size = 4, hole = 1) {
  const shape = new Shape()
  shape.moveTo(0, 0).lineTo(size, 0).lineTo(size, size).lineTo(0, size).closePath()
  const gap = new Path()
  const from = (size - hole) / 2
  gap
    .moveTo(from, from)
    .lineTo(from, from + hole)
    .lineTo(from + hole, from + hole)
    .lineTo(from + hole, from)
    .closePath()
  shape.holes.push(gap)
  const geometry = new ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

/** Several indexed geometries as one mesh body, with separate vertices. */
function joined(...parts: BufferGeometry[]): BufferGeometry {
  const merged = new BufferGeometry()
  const positions: number[] = []
  const indices: number[] = []
  for (const part of parts) {
    const base = positions.length / 3
    positions.push(...(part.getAttribute('position').array as Float32Array))
    const index = part.getIndex()!
    for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i))
  }
  merged.setAttribute('position', new Float32BufferAttribute(positions, 3))
  merged.setIndex(indices)
  return merged
}

const sectionOfBody = (geometry: BufferGeometry, height: number, join?: number) => {
  const frame = new Group()
  const mesh = new Mesh(geometry, material)
  frame.add(mesh)
  return sectionLoops([mesh], frame, height, join)
}

describe('sectionLoops', () => {
  test('an extrusion with a hole gives an outer loop and the hole, and a cap without it', () => {
    const frame = new Group()
    const mesh = new Mesh(slabWithHole(), material)
    frame.add(mesh)
    const loops = sectionLoops([mesh], frame, 0.5)
    expect(loopCount(loops)).toBe(2)
    expect(sectionArea(loops)).toBeCloseTo(4 * 4 - 1, 4)
  })

  test('a cut above or below the mesh has no section', () => {
    const frame = new Group()
    const mesh = new Mesh(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), material)
    frame.add(mesh)
    expect(loopCount(sectionLoops([mesh], frame, 1.5))).toBe(0)
    expect(loopCount(sectionLoops([mesh], frame, -0.5))).toBe(0)
    expect(loopCount(sectionLoops([mesh], frame, 0.5))).toBe(1)
  })

  test("is taken in the frame's own space, wherever the frame is", () => {
    const frame = new Group()
    frame.position.set(5, 3, -2)
    const mesh = new Mesh(new BoxGeometry(2, 1, 1).translate(0, 0.5, 0), material)
    frame.add(mesh)
    frame.updateMatrixWorld(true)
    expect(loopCount(sectionLoops([mesh], frame, 0.5))).toBe(1)
    expect(sectionArea(sectionLoops([mesh], frame, 0.5))).toBeCloseTo(2, 5)
  })

  test('primitives sharing one position attribute are one body', () => {
    const box = new BoxGeometry(2, 1, 1).translate(0, 0.5, 0)
    const index = box.getIndex()!
    const half = index.count / 2
    const halves = [0, half].map((start) => {
      const part = new BufferGeometry()
      part.setAttribute('position', box.getAttribute('position'))
      part.setIndex(Array.from({ length: half }, (_, i) => index.getX(start + i)))
      return new Mesh(part, material)
    })
    const frame = new Group()
    frame.add(...halves)
    const loops = sectionLoops(halves, frame, 0.5)
    expect(loopCount(loops)).toBe(1)
    expect(sectionArea(loops)).toBeCloseTo(2, 5)
  })

  test('corners that differ by float noise weld', () => {
    const noisy = new BoxGeometry(2, 1, 1).translate(0, 0.5, 0)
    const position = noisy.getAttribute('position')
    for (let i = 0; i < position.count; i += 2) position.setX(i, position.getX(i) + 3e-6)
    const section = sectionOfBody(noisy, 0.5)
    expect(section.complete).toBe(true)
    expect(loopCount(section)).toBe(1)
    expect(sectionArea(section)).toBeCloseTo(2, 4)
  })

  test('a seam of half a millimetre closes within the tolerance and not below it', () => {
    // The +z face stands 0.5 mm proud of the sides it meets: their outlines stop short of its own.
    const seamed = () => {
      const box = new BoxGeometry(2, 1, 1).translate(0, 0.5, 0)
      const position = box.getAttribute('position')
      const normal = box.getAttribute('normal')
      for (let i = 0; i < position.count; i++)
        if (normal.getZ(i) === 1) position.setZ(i, position.getZ(i) + 5e-4)
      return box
    }
    const closes = sectionOfBody(seamed(), 0.5, 1e-3)
    expect(closes.complete).toBe(true)
    expect(sectionArea(closes)).toBeCloseTo(2, 2)
    expect(sectionOfBody(seamed(), 0.5, 1e-4).complete).toBe(false)
  })

  test('an open mesh leaves no loop to cap', () => {
    const open = new BoxGeometry(2, 1, 1).translate(0, 0.5, 0)
    const index = open.getIndex()!
    // Drop the +x side: the section is a U, not a loop, and says so.
    open.setIndex(Array.from({ length: index.count - 6 }, (_, i) => index.getX(i + 6)))
    const frame = new Group()
    const mesh = new Mesh(open, material)
    frame.add(mesh)
    const section = sectionLoops([mesh], frame, 0.5)
    expect(section.complete).toBe(false)
    expect(loopCount(section)).toBe(0)
  })
})

describe('repairs and the plane', () => {
  test('a box laid against a wall merges with it: the shared stretch is split at its ends and cancels', () => {
    // The stub's two corners lie inside the long face's one segment: a T-junction at each.
    const wall = new BoxGeometry(4, 1, 1).translate(0, 0.5, 0)
    const stub = new BoxGeometry(1, 1, 1).translate(0, 0.5, 1)
    const section = sectionOfBody(joined(wall, stub), 0.5)
    expect(section.complete).toBe(true)
    expect(loopCount(section)).toBe(1)
    expect(sectionArea(section)).toBeCloseTo(4 + 1, 4)
  })

  test('two boxes back to back leave one outline, not a figure-8 of nothing', () => {
    const left = new BoxGeometry(1, 1, 0.2).translate(0, 0.5, 0)
    const right = new BoxGeometry(1, 1, 0.2).translate(1, 0.5, 0)
    const section = sectionOfBody(joined(left, right), 0.37)
    expect(section.complete).toBe(true)
    expect(loopCount(section)).toBe(1)
    expect(sectionArea(section)).toBeCloseTo(2 * 0.2, 4)
  })

  test('two boxes that meet at one corner stay two outlines and both are capped', () => {
    const a = new BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5)
    const b = new BoxGeometry(1, 1, 1).translate(1.5, 0.5, 1.5)
    const section = sectionOfBody(joined(a, b), 0.5)
    expect(section.complete).toBe(true)
    expect(sectionArea(section)).toBeCloseTo(2, 4)
  })

  // A 1 m box stood on a 0.5 m plinth, so the heights 0, 0.5 and 1.5 each lie on a face.
  const plinthed = () => {
    const frame = new Group()
    const plinth = new BoxGeometry(2, 0.5, 2).translate(0, 0.25, 0)
    const box = new BoxGeometry(1, 1, 1).translate(0, 1, 0)
    const merged = new BufferGeometry()
    const positions: number[] = []
    const indices: number[] = []
    for (const part of [plinth, box]) {
      const base = positions.length / 3
      positions.push(...(part.getAttribute('position').array as Float32Array))
      const index = part.getIndex()!
      for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i))
    }
    merged.setAttribute('position', new Float32BufferAttribute(positions, 3))
    merged.setIndex(indices)
    const mesh = new Mesh(merged, material)
    frame.add(mesh)
    return { frame, mesh }
  }

  test('a cut exactly on a top, and a hair either side of it, caps what is solid on both sides', () => {
    const { frame, mesh } = plinthed()
    // Under 0.5 the plinth is cut across; just over it, the box. At 0.5 itself the plinth's top
    // is drawn, and only the box's foot (solid on both sides) is capped.
    expect(sectionArea(sectionLoops([mesh], frame, 0.4999))).toBeCloseTo(4, 3)
    expect(sectionArea(sectionLoops([mesh], frame, 0.5))).toBeCloseTo(1, 3)
    expect(sectionArea(sectionLoops([mesh], frame, 0.5001))).toBeCloseTo(1, 3)
    // At the very top of the box there is nothing above to be capped.
    expect(sectionArea(sectionLoops([mesh], frame, 1.5))).toBe(0)
    expect(sectionArea(sectionLoops([mesh], frame, 1.4999))).toBeCloseTo(1, 3)
    expect(sectionArea(sectionLoops([mesh], frame, 1.5001))).toBe(0)
  })
})

describe('order and welding', () => {
  /** A seeded shuffle of a geometry's triangles. */
  const shuffled = (geometry: BufferGeometry, seed: number) => {
    const index = geometry.getIndex()!
    const triangles = Array.from({ length: index.count / 3 }, (_, t) => [
      index.getX(t * 3),
      index.getX(t * 3 + 1),
      index.getX(t * 3 + 2),
    ])
    let state = seed
    for (let i = triangles.length - 1; i > 0; i--) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      const j = state % (i + 1)
      ;[triangles[i], triangles[j]] = [triangles[j]!, triangles[i]!]
    }
    const copy = geometry.clone()
    copy.setIndex(triangles.flat())
    return copy
  }

  test('the same faces in any order give the same section', () => {
    // A wall and a casing back to back with it, so faces cancel in pairs.
    const body = joined(
      new BoxGeometry(2, 1, 0.2).translate(0, 0.5, 0),
      new BoxGeometry(2, 1, 0.2).translate(0, 0.5, 0.2),
      new BoxGeometry(0.4, 1, 0.2).translate(-0.5, 0.5, 0.4),
    )
    const reference = sectionOfBody(body, 0.37)
    expect(reference.complete).toBe(true)
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const section = sectionOfBody(shuffled(body, seed), 0.37)
      expect(section.complete).toBe(true)
      expect(loopCount(section)).toBe(loopCount(reference))
      expect(sectionArea(section)).toBeCloseTo(sectionArea(reference), 5)
    }
  })

  test('points a hair apart across a weld cell border are one point', () => {
    // Corners at 0 and 1e-5 / 2 fall on either side of a rounding border.
    const box = new BoxGeometry(2, 1, 1).translate(0, 0.5, 0)
    const position = box.getAttribute('position')
    for (let i = 0; i < position.count; i += 3) position.setX(i, position.getX(i) + 6e-6)
    const section = sectionOfBody(box, 0.5)
    expect(section.complete).toBe(true)
    expect(sectionArea(section)).toBeCloseTo(2, 3)
  })

  test('a hundred and one boxes, each with a half-millimetre seam, all close', () => {
    const boxes = Array.from({ length: 101 }, (_, i) => {
      const box = new BoxGeometry(1, 1, 1).translate(i * 2, 0.5, 0)
      const position = box.getAttribute('position')
      const normal = box.getAttribute('normal')
      for (let v = 0; v < position.count; v++)
        if (normal.getZ(v) === 1) position.setZ(v, position.getZ(v) + 5e-4)
      return box
    })
    const section = sectionOfBody(joined(...boxes), 0.5, 1e-3)
    expect(section.complete).toBe(true)
    expect(loopCount(section)).toBe(101)
    expect(sectionArea(section)).toBeCloseTo(101, 1)
  })

  test('a body that begins at the cut has no section', () => {
    const body = new BoxGeometry(2, 1, 1).translate(0, 1.5, 0)
    expect(loopCount(sectionOfBody(body, 1))).toBe(0)
    expect(loopCount(sectionOfBody(body, 1.01))).toBe(1)
  })
})

describe('buildCutCapGeometry', () => {
  test('is nothing for no loops', () => {
    expect(buildCutCapGeometry([])).toBeNull()
    expect(buildCutCapGeometry([{ owner: 'a', solids: [] }])).toBeNull()
  })

  test('an island inside a hole is solid again, the hole round it open, and each triangle names its owner', () => {
    const frame = new Group()
    const ring = new Mesh(slabWithHole(6, 4), material)
    // The ring stands on x, -z in 0..6 (extruded then turned); its hole is the middle 4 x 4.
    const island = new Mesh(new BoxGeometry(2, 1, 2).translate(3, 0.5, -3), material)
    const beside = new Mesh(new BoxGeometry(1, 1, 1).translate(10, 0.5, 0), material)
    frame.add(ring, island, beside)
    const built = buildCutCapGeometry([
      { owner: 'a', solids: sectionLoops([ring, island], frame, 0.5).solids },
      { owner: 'b', solids: sectionLoops([beside], frame, 0.5).solids },
    ])!
    expect(built.triangleOwners).toHaveLength(built.geometry.getIndex()!.count / 3)
    expect(new Set(built.triangleOwners)).toEqual(new Set(['a', 'b']))
    expect(capArea(built.geometry)).toBeCloseTo(36 - 16 + 4 + 1, 3)
    const covers = (x: number, z: number) => {
      const position = built.geometry.getAttribute('position')
      const index = built.geometry.getIndex()!
      for (let i = 0; i < index.count; i += 3) {
        const [p, q, r] = [0, 1, 2].map((k) => index.getX(i + k) as number)
        const side = (u: number, v: number) =>
          (position.getX(v) - position.getX(u)) * (z - position.getZ(u)) -
          (position.getZ(v) - position.getZ(u)) * (x - position.getX(u))
        const signs = [side(p!, q!), side(q!, r!), side(r!, p!)]
        if (signs.every((v) => v >= 0) || signs.every((v) => v <= 0)) return true
      }
      return false
    }
    expect(covers(3, -3)).toBe(true)
    expect(covers(1.5, -3)).toBe(false)
    expect(covers(0.5, -3)).toBe(true)
  })
})
