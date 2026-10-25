import { describe, expect, test } from 'bun:test'
import {
  BoxGeometry,
  BufferGeometry,
  ExtrudeGeometry,
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

const sectionArea = (loops: ReturnType<typeof sectionLoops>) =>
  capArea(buildCutCapGeometry([{ owner: 'a', loops }])!.geometry)

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

describe('sectionLoops', () => {
  test('an extrusion with a hole gives an outer loop and the hole, and a cap without it', () => {
    const frame = new Group()
    const mesh = new Mesh(slabWithHole(), material)
    frame.add(mesh)
    const loops = sectionLoops([mesh], frame, 0.5)
    expect(loops).toHaveLength(2)
    expect(sectionArea(loops)).toBeCloseTo(4 * 4 - 1, 4)
  })

  test('a cut above or below the mesh has no section', () => {
    const frame = new Group()
    const mesh = new Mesh(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), material)
    frame.add(mesh)
    expect(sectionLoops([mesh], frame, 1.5)).toHaveLength(0)
    expect(sectionLoops([mesh], frame, -0.5)).toHaveLength(0)
    expect(sectionLoops([mesh], frame, 0.5)).toHaveLength(1)
  })

  test("is taken in the frame's own space, wherever the frame is", () => {
    const frame = new Group()
    frame.position.set(5, 3, -2)
    const mesh = new Mesh(new BoxGeometry(2, 1, 1).translate(0, 0.5, 0), material)
    frame.add(mesh)
    frame.updateMatrixWorld(true)
    expect(sectionLoops([mesh], frame, 0.5)).toHaveLength(1)
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
    expect(loops).toHaveLength(1)
    expect(sectionArea(loops)).toBeCloseTo(2, 5)
  })

  test('corners that differ by float noise weld, and a seam a millimetre wide is closed', () => {
    const noisy = new BoxGeometry(2, 1, 1).translate(0, 0.5, 0)
    const position = noisy.getAttribute('position')
    for (let i = 0; i < position.count; i += 2) position.setX(i, position.getX(i) + 3e-6)
    const seamed = new BoxGeometry(2, 1, 1).translate(0, 0.5, 0)
    const front = seamed.getAttribute('position')
    for (let i = 0; i < front.count; i++)
      if (front.getZ(i) > 0.4) front.setX(i, front.getX(i) + 1e-3)
    for (const geometry of [noisy, seamed]) {
      const frame = new Group()
      const mesh = new Mesh(geometry, material)
      frame.add(mesh)
      const loops = sectionLoops([mesh], frame, 0.5)
      expect(loops).toHaveLength(1)
      expect(sectionArea(loops)).toBeCloseTo(2, 2)
    }
  })

  test('an open mesh leaves no loop to cap', () => {
    const open = new BoxGeometry(2, 1, 1).translate(0, 0.5, 0)
    const index = open.getIndex()!
    // Drop the +x side: the section is a U, not a loop.
    open.setIndex(Array.from({ length: index.count - 6 }, (_, i) => index.getX(i + 6)))
    const frame = new Group()
    const mesh = new Mesh(open, material)
    frame.add(mesh)
    expect(sectionLoops([mesh], frame, 0.5)).toHaveLength(0)
  })
})

describe('buildCutCapGeometry', () => {
  test('is nothing for no loops', () => {
    expect(buildCutCapGeometry([])).toBeNull()
    expect(buildCutCapGeometry([{ owner: 'a', loops: [] }])).toBeNull()
  })

  test('an island inside a hole is solid again, and each triangle names its owner', () => {
    const frame = new Group()
    const ring = new Mesh(slabWithHole(6, 4), material)
    const island = new Mesh(new BoxGeometry(2, 1, 2).translate(3, 0.5, 3), material)
    const beside = new Mesh(new BoxGeometry(1, 1, 1).translate(10, 0.5, 0), material)
    frame.add(ring, island, beside)
    const built = buildCutCapGeometry([
      { owner: 'a', loops: sectionLoops([ring, island], frame, 0.5) },
      { owner: 'b', loops: sectionLoops([beside], frame, 0.5) },
    ])!
    expect(built.triangleOwners).toHaveLength(built.geometry.getIndex()!.count / 3)
    expect(new Set(built.triangleOwners)).toEqual(new Set(['a', 'b']))
    expect(capArea(built.geometry)).toBeCloseTo(36 - 16 + 4 + 1, 3)
  })
})
