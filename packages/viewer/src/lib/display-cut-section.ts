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
/** A vertex this close to the plane lies on it. */
const ON_PLANE = 1e-6
/** An end this close to the inside of another segment is a T-junction. */
const ON_SEGMENT = 1e-4
/** Past this many loose ends a section is not worth repairing. */
const MAX_LOOSE_ENDS = 400
/** How wide a seam the section closes by default. */
const DEFAULT_JOIN = 1e-3

type Segment = readonly [from: number, to: number]

type Body = {
  /** Vertices in the frame. */
  xyz: Float64Array
  /** Triangle corners, three per triangle. */
  corners: number[]
  min: number
  max: number
  /** The distinct heights of the vertices, ascending: where a face can lie on the plane. */
  heights: Float64Array
}

export type PreparedSection = {
  /** The section at `height` over the frame. Cheap enough to take every frame of a drag. */
  at: (height: number) => Section
}

/**
 * Takes `meshes` into `frame` once. Meshes that share a position attribute, a parent and a
 * transform are the primitives of one baked mesh and make one solid; any other pair of meshes are
 * separate solids, and never become each other's holes.
 */
export function prepareSection(
  meshes: readonly Mesh[],
  frame: Object3D,
  joinTolerance = DEFAULT_JOIN,
): PreparedSection {
  frame.updateWorldMatrix(true, false)
  const inverse = new Matrix4().copy(frame.matrixWorld).invert()
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
  const bodies: Body[] = []
  for (const known of instances.values())
    for (const group of known.values()) bodies.push(prepareBody(group, inverse))
  return {
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
  const heights = Float64Array.from(
    new Set(Array.from({ length: position.count }, (_, i) => xyz[i * 3 + 1]!)),
  ).sort()
  return { xyz, corners, min, max, heights }
}

/**
 * The section of one solid. A face lying on the plane is the question: material under it is cut
 * and drawn, material over it is not, so a cap belongs only where the solid is on both sides. The
 * two readings of the plane (a vertex on it counts as under, or as over) each reach past the part
 * they share, and where one holds the other the smaller is that part. Two features on the plane in
 * opposite senses at once are not nested, and then the smaller reading is still only an estimate.
 */
function sectionBody(
  body: Body,
  height: number,
  joinTolerance: number,
): { loops: SectionLoop[]; complete: boolean } {
  if (height < body.min - ON_PLANE || height >= body.max + ON_PLANE) return NONE
  const strict = sectionBodyAs(body, height, false, joinTolerance)
  if (!touchesPlane(body, height)) return strict
  const inclusive = sectionBodyAs(body, height, true, joinTolerance)
  return netArea(inclusive.loops) < netArea(strict.loops) ? inclusive : strict
}

const NONE = { loops: [] as SectionLoop[], complete: true }

function touchesPlane(body: Body, height: number): boolean {
  const { heights } = body
  let low = 0
  let high = heights.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (heights[mid]! < height - ON_PLANE) low = mid + 1
    else high = mid
  }
  return low < heights.length && heights[low]! <= height + ON_PLANE
}

function sectionBodyAs(
  body: Body,
  height: number,
  planeIsOver: boolean,
  joinTolerance: number,
): { loops: SectionLoop[]; complete: boolean } {
  const { xyz, corners } = body
  const ids = new Map<string, number>()
  const points: Vector2[] = []
  const segments: Segment[] = []
  const idOf = (x: number, z: number) => {
    const key = `${Math.round(x / WELD)},${Math.round(z / WELD)}`
    let id = ids.get(key)
    if (id === undefined) {
      id = points.length
      ids.set(key, id)
      points.push(new Vector2(x, z))
    }
    return id
  }
  const isOver = (vertex: number) => {
    const y = xyz[vertex * 3 + 1]!
    return planeIsOver ? y >= height - ON_PLANE : y > height + ON_PLANE
  }
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
    if (found.length === 2 && found[0] !== found[1]) segments.push([found[0]!, found[1]!])
  }
  return closeOutlines(points, segments, joinTolerance)
}

/** Splits every segment an odd-degree point lies inside of, so a T-junction becomes a vertex. */
function splitTJunctions(points: Vector2[], segments: Segment[]): boolean {
  const degree = new Map<number, number>()
  for (const [from, to] of segments) {
    degree.set(from, (degree.get(from) ?? 0) + 1)
    degree.set(to, (degree.get(to) ?? 0) + 1)
  }
  const loose = [...degree].filter(([, count]) => count % 2 === 1).map(([id]) => id)
  if (loose.length > MAX_LOOSE_ENDS) return false
  const edge = new Vector2()
  const offset = new Vector2()
  for (const id of loose) {
    const point = points[id]!
    for (let s = 0; s < segments.length; s++) {
      const [from, to] = segments[s]!
      if (from === id || to === id) continue
      edge.subVectors(points[to]!, points[from]!)
      const length = edge.length()
      if (length < 2 * ON_SEGMENT) continue
      offset.subVectors(point, points[from]!)
      const along = offset.dot(edge) / length
      if (along <= ON_SEGMENT || along >= length - ON_SEGMENT) continue
      if (Math.abs(offset.cross(edge)) / length > ON_SEGMENT) continue
      segments.splice(s, 1, [from, id], [id, to])
      break
    }
  }
  return true
}

/** Joins segments into closed outlines; false in `complete` when some end stays loose. */
function closeOutlines(
  points: Vector2[],
  segments: Segment[],
  joinTolerance: number,
): { loops: SectionLoop[]; complete: boolean } {
  let complete = splitTJunctions(points, segments)
  // A segment met twice (two faces back to back) is no outline at all.
  const parity = new Map<string, Segment>()
  for (const segment of segments) {
    const key =
      segment[0] < segment[1] ? `${segment[0]},${segment[1]}` : `${segment[1]},${segment[0]}`
    if (parity.has(key)) parity.delete(key)
    else parity.set(key, segment)
  }
  const kept = [...parity.values()]
  const touching = new Map<number, number[]>()
  kept.forEach(([from, to], s) => {
    for (const id of [from, to]) {
      const list = touching.get(id)
      if (list) list.push(s)
      else touching.set(id, [s])
    }
  })
  const used = new Uint8Array(kept.length)
  const extend = (chain: number[]) => {
    for (;;) {
      const last = chain[chain.length - 1]!
      const next = touching.get(last)?.find((s) => !used[s])
      if (next === undefined) return
      used[next] = 1
      const [from, to] = kept[next]!
      chain.push(from === last ? to : from)
    }
  }
  const closed: number[][] = []
  const open: number[][] = []
  for (let s = 0; s < kept.length; s++) {
    if (used[s]) continue
    used[s] = 1
    const chain = [...kept[s]!]
    extend(chain)
    if (chain[0] !== chain[chain.length - 1]) {
      chain.reverse()
      extend(chain)
    }
    if (chain[0] === chain[chain.length - 1]) closed.push(chain.slice(1))
    else open.push(chain)
  }
  const near = (a: number, b: number) => points[a]!.distanceTo(points[b]!) <= joinTolerance
  while (open.length > 0) {
    const chain = open.pop()!
    for (let side = 0; side < 2; side++) {
      for (let again = true; again; ) {
        again = false
        const tail = chain[chain.length - 1]!
        for (let j = 0; j < open.length; j++) {
          const other = open[j]!
          const fits = near(tail, other[0]!)
            ? other
            : near(tail, other[other.length - 1]!)
              ? other.reverse()
              : null
          if (!fits) continue
          open.splice(j, 1)
          chain.push(...fits.slice(1))
          again = true
          break
        }
      }
      chain.reverse()
    }
    if (chain.length >= 4 && near(chain[0]!, chain[chain.length - 1]!)) closed.push(chain.slice(1))
    else complete = false
  }
  const loops = closed
    .filter((ids) => ids.length >= 3)
    .map((ids) => ids.map((id) => points[id]!.clone()))
    .filter((loop) => Math.abs(ShapeUtils.area(loop)) > 1e-9)
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

function netArea(loops: Solid): number {
  const { area, around } = nesting(loops)
  return area.reduce((sum, a, i) => sum + (around[i]!.length % 2 === 0 ? a : -a), 0)
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
