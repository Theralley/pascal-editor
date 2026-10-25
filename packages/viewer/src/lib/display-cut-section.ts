import {
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  type Mesh,
  type Object3D,
  ShapeUtils,
  Vector2,
} from 'three'

/**
 * The cap of a display cut is the section of what is drawn with the cut plane: the outline of the
 * meshes where they cross y = height, so a doorway, an arch, a raised sill or a stepped base is
 * open in the cap exactly where it is open in the mesh. Built from triangles alone, it works the
 * same on a live wall and on one read back from a baked file.
 *
 * The cut keeps what is at or under the height (`display-cut.ts`), and the section is taken to
 * agree with it: a vertex above the height is one strictly over it.
 */

/** A closed outline in the frame's plan: x and z of the frame, as x and y. */
export type SectionLoop = readonly Vector2[]

/** The outlines of one solid (a body), outer ones and the holes in them. */
export type Solid = readonly SectionLoop[]

/**
 * `solids` is the section; `complete` is false when an outline would not close, so the section is
 * missing a piece and the caller should not trust it for a cap.
 */
export type Section = { solids: Solid[]; complete: boolean }

/** Endpoints this close are one point. */
const WELD = 1e-5
/** A vertex this close over the plane still counts as on it: kept, like the mask keeps it. */
const ON_PLANE = 1e-6
/** An end this close to the inside of another segment is a T-junction. */
const ON_SEGMENT = 1e-4
/** How wide a seam the section closes by default. */
const DEFAULT_JOIN = 1e-3
/** A dropped loop longer than this is a piece of the section that is missing. */
const REAL_LENGTH = 2e-3

/**
 * One number for a grid cell. Two cells far apart may share it, which only costs a few extra
 * distance tests: every hit is checked against the geometry.
 */
const cellKey = (cx: number, cz: number) => cx * 67108864 + cz

/** Point ids stay under this, so a piece's two ids pack into one number (`a * MAX_POINTS + b`). */
const MAX_POINTS = 4194304

/** A piece of the outline, directed so the solid is on its right (the outward normal on its left). */
type Segment = readonly [from: number, to: number]

type Body = {
  /** Vertices in the frame. */
  xyz: Float64Array
  /** Triangle corners, three per triangle. */
  corners: number[]
  min: number
  max: number
}

export type PreparedSection = {
  /** The section at `height` over the frame. Cheap enough to take every frame of a drag. */
  at: (height: number) => Section
  /** The lowest and highest the meshes reach over the frame. */
  bounds: { min: number; max: number }
}

/**
 * Takes `meshes` into `frame` once. Meshes that share a position attribute, a parent and a
 * transform are the primitives of one baked mesh and make one solid; any other pair of meshes are
 * separate solids, and never become each other's holes.
 */
/**
 * The meshes grouped into solids: those sharing a position attribute, a parent and a transform are
 * the primitives of one baked mesh. Two instances of one geometry are two solids.
 */
export function groupInstances(meshes: readonly Mesh[]): Mesh[][] {
  const instances = new Map<unknown, Map<string, Mesh[]>>()
  for (const mesh of meshes) {
    const position = mesh.geometry?.getAttribute('position')
    if (!position) continue
    mesh.updateWorldMatrix(true, false)
    const instance = `${mesh.parent?.uuid ?? ''}|${mesh.matrixWorld.elements.join(',')}`
    const known = instances.get(position) ?? new Map<string, Mesh[]>()
    instances.set(position, known)
    const list = known.get(instance)
    if (list) list.push(mesh)
    else known.set(instance, [mesh])
  }
  return [...instances.values()].flatMap((known) => [...known.values()])
}

export function prepareSection(
  meshes: readonly Mesh[],
  frame: Object3D,
  joinTolerance = DEFAULT_JOIN,
): PreparedSection {
  frame.updateWorldMatrix(true, false)
  const inverse = new Matrix4().copy(frame.matrixWorld).invert()
  const bodies = groupInstances(meshes).map((group) => prepareBody(group, inverse))
  return {
    bounds: {
      min: Math.min(...bodies.map((body) => body.min)),
      max: Math.max(...bodies.map((body) => body.max)),
    },
    at: (height) => {
      const solids: Solid[] = []
      let complete = true
      for (const body of bodies) {
        const section = sectionBody(body, height, joinTolerance)
        if (section.loops.length > 0) solids.push(section.loops)
        if (!section.complete) complete = false
      }
      return { solids, complete }
    },
  }
}

/** The section of `meshes` with the plane y = `height` of `frame`; see `prepareSection`. */
export function sectionLoops(
  meshes: readonly Mesh[],
  frame: Object3D,
  height: number,
  joinTolerance?: number,
): Section {
  return prepareSection(meshes, frame, joinTolerance).at(height)
}

function prepareBody(meshes: readonly Mesh[], inverse: Matrix4): Body {
  const first = meshes[0]!
  const position = first.geometry.getAttribute('position')!
  const toFrame = new Matrix4().multiplyMatrices(inverse, first.matrixWorld)
  const e = toFrame.elements
  const xyz = new Float64Array(position.count * 3)
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const w = 1 / (e[3]! * x + e[7]! * y + e[11]! * z + e[15]!)
    const fy = (e[1]! * x + e[5]! * y + e[9]! * z + e[13]!) * w
    xyz[i * 3] = (e[0]! * x + e[4]! * y + e[8]! * z + e[12]!) * w
    xyz[i * 3 + 1] = fy
    xyz[i * 3 + 2] = (e[2]! * x + e[6]! * y + e[10]! * z + e[14]!) * w
    if (fy < min) min = fy
    if (fy > max) max = fy
  }
  const corners: number[] = []
  for (const mesh of meshes) {
    const index = mesh.geometry.getIndex()
    const total = index ? index.count : position.count
    const { start, count } = mesh.geometry.drawRange
    const end = Math.min(total, start + count)
    for (let i = Math.max(0, start); i + 2 < end; i += 3)
      for (let k = 0; k < 3; k++) corners.push(index ? index.getX(i + k) : i + k)
  }
  return { xyz, corners, min, max }
}

const NONE = { loops: [] as SectionLoop[], complete: true }

/**
 * The section of one solid at the plane y = `height`, read as the cut reads it: what is at or under
 * the height is kept (`display-cut.ts`), what is over it is not. A face lying on the plane is
 * therefore under it. A sill, a step or a top exactly at the height has its own face as the top and
 * no cap, and a head exactly there is bridged, as it is by a cut a hair above.
 */
function sectionBody(
  body: Body,
  height: number,
  joinTolerance: number,
): { loops: SectionLoop[]; complete: boolean } {
  // A body that starts at or above the height keeps nothing: its base is not a stub's top.
  if (height <= body.min + ON_PLANE || height >= body.max + ON_PLANE) return NONE
  const { xyz, corners } = body
  const cells = new Map<number, number[]>()
  const points: Vector2[] = []
  const segments: Segment[] = []
  // A point within WELD of an existing one is that one, whichever side of a cell border it fell;
  // the nearest, so which of a cluster it joins does not depend on the order they arrived in.
  const idOf = (x: number, z: number) => {
    const cx = Math.floor(x / WELD)
    const cz = Math.floor(z / WELD)
    let nearest = -1
    let nearestDistance = Number.POSITIVE_INFINITY
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const list = cells.get(cellKey(cx + dx, cz + dz))
        if (!list) continue
        for (let i = 0; i < list.length; i++) {
          const point = points[list[i]!]!
          const distance = Math.max(Math.abs(point.x - x), Math.abs(point.y - z))
          if (distance <= WELD && distance < nearestDistance) {
            nearest = list[i]!
            nearestDistance = distance
          }
        }
      }
    if (nearest >= 0) return nearest
    const id = points.length
    points.push(new Vector2(x, z))
    const own = cells.get(cellKey(cx, cz))
    if (own) own.push(id)
    else cells.set(cellKey(cx, cz), [id])
    return id
  }
  const isOver = (vertex: number) => xyz[vertex * 3 + 1]! > height + ON_PLANE
  // Where the edge a-b crosses the plane; the same point whichever triangle asks, so the
  // outline of a closed mesh closes.
  const crossing = (a: number, b: number) => {
    let [p, q] = [a * 3, b * 3]
    if (
      xyz[p]! > xyz[q]! ||
      (xyz[p]! === xyz[q]! &&
        (xyz[p + 1]! > xyz[q + 1]! || (xyz[p + 1]! === xyz[q + 1]! && xyz[p + 2]! > xyz[q + 2]!)))
    )
      [p, q] = [q, p]
    const t = Math.min(1, Math.max(0, (height - xyz[p + 1]!) / (xyz[q + 1]! - xyz[p + 1]!)))
    return idOf(xyz[p]! + (xyz[q]! - xyz[p]!) * t, xyz[p + 2]! + (xyz[q + 2]! - xyz[p + 2]!) * t)
  }
  const found: number[] = []
  for (let i = 0; i + 2 < corners.length; i += 3) {
    found.length = 0
    for (let k = 0; k < 3; k++) {
      const a = corners[i + k]!
      const b = corners[i + ((k + 1) % 3)]!
      if (isOver(a) !== isOver(b)) found.push(crossing(a, b))
    }
    if (found.length !== 2 || found[0] === found[1]) continue
    // Directed with the triangle's outward side on the left, so the walk can tell two solids that
    // touch at a point apart.
    const [a, b, c] = [corners[i]! * 3, corners[i + 1]! * 3, corners[i + 2]! * 3]
    const nx =
      (xyz[b + 1]! - xyz[a + 1]!) * (xyz[c + 2]! - xyz[a + 2]!) -
      (xyz[b + 2]! - xyz[a + 2]!) * (xyz[c + 1]! - xyz[a + 1]!)
    const nz =
      (xyz[b]! - xyz[a]!) * (xyz[c + 1]! - xyz[a + 1]!) -
      (xyz[b + 1]! - xyz[a + 1]!) * (xyz[c]! - xyz[a]!)
    const from = points[found[0]!]!
    const to = points[found[1]!]!
    const turn = (to.x - from.x) * nz - (to.y - from.y) * nx
    segments.push(turn >= 0 ? [found[0]!, found[1]!] : [found[1]!, found[0]!])
  }
  return closeOutlines(points, segments, joinTolerance)
}

/**
 * Splits every segment at the points that lie inside it, so a T-junction becomes a vertex and two
 * faces that overlap in part share the same pieces (and cancel, or merge) instead of crossing.
 */
function splitAtPoints(points: Vector2[], segments: Segment[]): Segment[] {
  const cell = 0.25
  const grid = new Map<number, number[]>()
  // Each segment is filed in the cells it passes through, sampled at half a cell; a point looks in
  // its own cell and the eight round it, which covers the cells a segment only clips.
  segments.forEach(([from, to], s) => {
    const a = points[from]!
    const b = points[to]!
    const steps = Math.max(1, Math.ceil(a.distanceTo(b) / (cell / 2)))
    let last = Number.NaN
    for (let i = 0; i <= steps; i++) {
      const x = Math.floor((a.x + ((b.x - a.x) * i) / steps) / cell)
      const z = Math.floor((a.y + ((b.y - a.y) * i) / steps) / cell)
      const key = cellKey(x, z)
      if (key === last) continue
      last = key
      const list = grid.get(key)
      if (list) list.push(s)
      else grid.set(key, [s])
    }
  })
  const splits = new Map<number, { along: number; id: number }[]>()
  const edge = new Vector2()
  const offset = new Vector2()
  const looked = new Int32Array(segments.length).fill(-1)
  points.forEach((point, id) => {
    const cx = Math.floor(point.x / cell)
    const cz = Math.floor(point.y / cell)
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const s of grid.get(cellKey(cx + dx, cz + dz)) ?? []) {
          if (looked[s] === id) continue
          looked[s] = id
          const [from, to] = segments[s]!
          if (from === id || to === id) continue
          edge.subVectors(points[to]!, points[from]!)
          const length = edge.length()
          if (length < 2 * ON_SEGMENT) continue
          offset.subVectors(point, points[from]!)
          const along = offset.dot(edge) / length
          if (along <= ON_SEGMENT || along >= length - ON_SEGMENT) continue
          if (Math.abs(offset.cross(edge)) / length > ON_SEGMENT) continue
          const list = splits.get(s)
          if (list) list.push({ along, id })
          else splits.set(s, [{ along, id }])
        }
  })
  if (splits.size === 0) return segments
  return segments.flatMap((segment, s) => {
    const cuts = splits.get(s)
    if (!cuts) return [segment]
    cuts.sort((a, b) => a.along - b.along)
    const ids = [segment[0], ...cuts.map((cut) => cut.id), segment[1]]
    return ids.slice(1).map((id, i): Segment => [ids[i]!, id])
  })
}

/** Joins directed segments into closed outlines; false in `complete` when a piece is missing. */
function closeOutlines(
  points: Vector2[],
  segments: Segment[],
  joinTolerance: number,
): { loops: SectionLoop[]; complete: boolean } {
  // Past that many points a section is not a wall's: leave it to the caller's fallback.
  if (points.length >= MAX_POINTS) return { loops: [], complete: false }
  let complete = true
  segments = splitAtPoints(points, segments)
  // Two faces back to back leave the same piece in both directions, which is no outline at all;
  // the same piece twice the same way (overlapping solids) is one.
  // Counted per piece and direction first, so the result does not depend on the order the faces
  // came in: a piece met once more one way than the other stays, once each way is gone.
  const net = new Map<number, { segment: Segment; count: number }>()
  for (const segment of segments) {
    const forward = segment[0] < segment[1]
    const key = forward
      ? segment[0] * MAX_POINTS + segment[1]
      : segment[1] * MAX_POINTS + segment[0]
    const entry = net.get(key) ?? {
      segment: forward ? segment : [segment[1], segment[0]],
      count: 0,
    }
    entry.count += forward ? 1 : -1
    net.set(key, entry)
  }
  const kept: Segment[] = []
  for (const { segment, count } of net.values())
    if (count > 0) kept.push(segment)
    else if (count < 0) kept.push([segment[1], segment[0]])
  const leaving = new Map<number, number[]>()
  kept.forEach(([from], s) => {
    const list = leaving.get(from)
    if (list) list.push(s)
    else leaving.set(from, [s])
  })
  const used = new Uint8Array(kept.length)
  const direction = (s: number) =>
    new Vector2().subVectors(points[kept[s]![1]]!, points[kept[s]![0]]!).normalize()
  // At a point several outlines leave from, the one that turns tightest toward the solid keeps
  // each solid's outline its own.
  const next = (s: number) => {
    const here = direction(s)
    let best: number | undefined
    let bestTurn = Number.POSITIVE_INFINITY
    for (const candidate of leaving.get(kept[s]![1]) ?? []) {
      if (used[candidate]) continue
      const there = direction(candidate)
      const turn = Math.atan2(here.cross(there), here.dot(there))
      if (turn < bestTurn) {
        best = candidate
        bestTurn = turn
      }
    }
    return best
  }
  const closed: number[][] = []
  const open: number[][] = []
  for (let start = 0; start < kept.length; start++) {
    if (used[start]) continue
    used[start] = 1
    const chain = [kept[start]![0], kept[start]![1]]
    let at = start
    for (;;) {
      const following = next(at)
      if (following === undefined) break
      used[following] = 1
      chain.push(kept[following]![1])
      at = following
      if (chain[chain.length - 1] === chain[0]) break
    }
    if (chain[chain.length - 1] === chain[0]) closed.push(chain.slice(1))
    else open.push(chain)
  }
  const near = (a: number, b: number) => points[a]!.distanceTo(points[b]!) <= joinTolerance
  const length = (ids: number[]) =>
    ids.reduce((sum, id, i) => sum + points[id]!.distanceTo(points[ids[(i + 1) % ids.length]!]!), 0)
  // A chain ends where another begins when they are a seam apart: each end claims the nearest
  // unclaimed start in the cells round it, and the chains so linked are walked end to end.
  const cell = Math.max(joinTolerance, 1e-4)
  const starts = new Map<number, number[]>()
  open.forEach((chain, c) => {
    const p = points[chain[0]!]!
    const key = cellKey(Math.floor(p.x / cell), Math.floor(p.y / cell))
    const list = starts.get(key)
    if (list) list.push(c)
    else starts.set(key, [c])
  })
  // Every end-to-start pair within a seam, the shortest matched first, so a chain that closes on
  // itself does not take the only start another chain could reach.
  const pairs: { distance: number; tail: number; start: number }[] = []
  open.forEach((chain, c) => {
    const tail = points[chain[chain.length - 1]!]!
    const cx = Math.floor(tail.x / cell)
    const cz = Math.floor(tail.y / cell)
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const other of starts.get(cellKey(cx + dx, cz + dz)) ?? []) {
          const distance = tail.distanceTo(points[open[other]![0]!]!)
          if (distance <= joinTolerance) pairs.push({ distance, tail: c, start: other })
        }
  })
  pairs.sort((a, b) => a.distance - b.distance)
  const linked = new Int32Array(open.length).fill(-1)
  const claimed = new Uint8Array(open.length)
  for (const { tail, start } of pairs) {
    if (linked[tail]! >= 0 || claimed[start]) continue
    linked[tail] = start
    claimed[start] = 1
  }
  const walked = new Uint8Array(open.length)
  const walk = (first: number) => {
    const chain: number[] = []
    let ring = false
    for (let c = first; c >= 0; c = linked[c]!) {
      if (walked[c]) {
        ring = c === first
        break
      }
      walked[c] = 1
      chain.push(...(chain.length ? open[c]!.slice(1) : open[c]!))
    }
    // A run of chains that does not come back to its start has an end that matched nothing.
    if (!ring) complete = false
    else if (chain.length >= 4) closed.push(chain.slice(1))
    // A ring of two or three points is a sliver the size of a seam: nothing to cap.
  }
  // Chains no other leads into begin a walk; what is left is a ring of chains.
  for (let c = 0; c < open.length; c++) if (!claimed[c]) walk(c)
  for (let c = 0; c < open.length; c++) if (!walked[c]) walk(c)
  const loops: SectionLoop[] = []
  for (const ids of closed) {
    const loop = ids.map((id) => points[id]!.clone())
    if (ids.length >= 3 && Math.abs(ShapeUtils.area(loop)) > 1e-9) loops.push(loop)
    // A loop with no area that comes back to a point it left folded onto itself: a piece is missing.
    else if (new Set(ids).size < ids.length && length(ids) > REAL_LENGTH) complete = false
  }
  return { loops, complete }
}

function contains(loop: SectionLoop, point: Vector2): boolean {
  let inside = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i]!
    const b = loop[j]!
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside
  }
  return inside
}

/** A point on the loop's own outline, away from its corners: where another loop's containment is judged. */
function probe(loop: SectionLoop): Vector2 {
  let at = 0
  let longest = -1
  for (let i = 0; i < loop.length; i++) {
    const length = loop[i]!.distanceToSquared(loop[(i + 1) % loop.length]!)
    if (length > longest) {
      longest = length
      at = i
    }
  }
  return loop[at]!.clone().lerp(loop[(at + 1) % loop.length]!, 0.5)
}

/** For each loop, the loops that contain it, widest first: an even count is solid, an odd one a hole. */
function nesting(loops: Solid): { area: number[]; around: number[][] } {
  const area = loops.map((loop) => Math.abs(ShapeUtils.area(loop as Vector2[])))
  const probes = loops.map(probe)
  const around = loops.map((_, i) =>
    loops
      .map((_, j) => j)
      .filter((j) => j !== i && area[j]! > area[i]! && contains(loops[j]!, probes[i]!))
      .sort((a, b) => area[b]! - area[a]!),
  )
  return { area, around }
}

/**
 * One flat mesh of the solids' faces in the frame's plan (x, z at y = 0), facing up, with the
 * owner of each triangle. Inside a solid a loop within one loop is a hole, within a hole an
 * island again, so a doorway is open and the pier beside it is solid.
 */
export function buildCutCapGeometry<T>(
  sections: readonly { owner: T; solids: readonly Solid[] }[],
): { geometry: BufferGeometry; triangleOwners: T[] } | null {
  const positions: number[] = []
  const indices: number[] = []
  const triangleOwners: T[] = []
  for (const { owner, solids } of sections)
    for (const loops of solids) {
      const { around } = nesting(loops)
      loops.forEach((loop, i) => {
        if (around[i]!.length % 2 === 1) return
        const holes = loops.filter(
          (_, j) => around[j]!.length === around[i]!.length + 1 && around[j]!.at(-1) === i,
        )
        const contour = [...loop]
        const all = [...contour, ...holes.flat()]
        const triangles = ShapeUtils.triangulateShape(
          contour,
          holes.map((hole) => [...hole]),
        )
        const base = positions.length / 3
        for (const point of all) positions.push(point.x, 0, point.y)
        // In the plan y is world z: wind each triangle so it faces up, whatever the triangulator did.
        for (const [a, b, c] of triangles) {
          const pa = all[a!]!
          const pb = all[b!]!
          const pc = all[c!]!
          const up = (pb.y - pa.y) * (pc.x - pa.x) - (pb.x - pa.x) * (pc.y - pa.y)
          if (up >= 0) indices.push(base + a!, base + b!, base + c!)
          else indices.push(base + a!, base + c!, base + b!)
          triangleOwners.push(owner)
        }
      })
    }
  if (indices.length === 0) return null
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute(
    'normal',
    new Float32BufferAttribute(
      Array.from({ length: positions.length / 3 }, () => [0, 1, 0]).flat(),
      3,
    ),
  )
  geometry.setIndex(indices)
  return { geometry, triangleOwners }
}
