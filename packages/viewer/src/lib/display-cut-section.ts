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
 */

/** A closed outline in the frame's plan: x and z of the frame, as x and y. */
export type SectionLoop = readonly Vector2[]

/** Endpoints this close are one point. */
const WELD = 1e-5
/** Ends of an open outline this close are joined: a seam in the mesh, not a gap. */
const JOIN = 2e-3

type Segment = readonly [from: number, to: number]

/**
 * The outlines where `meshes` cross y = `height` of `frame`. A vertex at or above the height counts
 * as above, so a face lying on the plane is never cut twice. Meshes sharing a position attribute
 * (the primitives of one baked mesh) are one body; open outlines are dropped.
 */
export function sectionLoops(
  meshes: readonly Mesh[],
  frame: Object3D,
  height: number,
): SectionLoop[] {
  const bodies = new Map<unknown, Mesh[]>()
  for (const mesh of meshes) {
    const position = mesh.geometry?.getAttribute('position')
    if (!position) continue
    const body = bodies.get(position)
    if (body) body.push(mesh)
    else bodies.set(position, [mesh])
  }
  frame.updateWorldMatrix(true, false)
  const inverse = new Matrix4().copy(frame.matrixWorld).invert()
  const loops: SectionLoop[] = []
  for (const body of bodies.values())
    loops.push(...closeOutlines(bodySegments(body, inverse, height)))
  return loops
}

function bodySegments(
  meshes: readonly Mesh[],
  inverse: Matrix4,
  height: number,
): { points: Vector2[]; segments: Segment[] } {
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
  const toFrame = new Matrix4()
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false)
    toFrame.multiplyMatrices(inverse, mesh.matrixWorld)
    const position = mesh.geometry.getAttribute('position')!
    const e = toFrame.elements
    const xyz = new Float64Array(position.count * 3)
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i)
      const y = position.getY(i)
      const z = position.getZ(i)
      const w = 1 / (e[3]! * x + e[7]! * y + e[11]! * z + e[15]!)
      xyz[i * 3] = (e[0]! * x + e[4]! * y + e[8]! * z + e[12]!) * w
      xyz[i * 3 + 1] = (e[1]! * x + e[5]! * y + e[9]! * z + e[13]!) * w
      xyz[i * 3 + 2] = (e[2]! * x + e[6]! * y + e[10]! * z + e[14]!) * w
    }
    const index = mesh.geometry.getIndex()
    const total = index ? index.count : position.count
    const { start, count } = mesh.geometry.drawRange
    const end = Math.min(total, start + count)
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
      const t = (height - xyz[p + 1]!) / (xyz[q + 1]! - xyz[p + 1]!)
      return idOf(xyz[p]! + (xyz[q]! - xyz[p]!) * t, xyz[p + 2]! + (xyz[q + 2]! - xyz[p + 2]!) * t)
    }
    const found: number[] = []
    for (let i = Math.max(0, start); i + 2 < end; i += 3) {
      const v = [0, 1, 2].map((k) => (index ? index.getX(i + k) : i + k))
      found.length = 0
      for (let k = 0; k < 3; k++) {
        const a = v[k]!
        const b = v[(k + 1) % 3]!
        if (xyz[a * 3 + 1]! >= height !== xyz[b * 3 + 1]! >= height) found.push(crossing(a, b))
      }
      if (found.length === 2 && found[0] !== found[1]) segments.push([found[0]!, found[1]!])
    }
  }
  return { points, segments }
}

function closeOutlines({
  points,
  segments,
}: {
  points: Vector2[]
  segments: Segment[]
}): SectionLoop[] {
  const touching = new Map<number, number[]>()
  segments.forEach(([from, to], s) => {
    for (const id of [from, to]) {
      const list = touching.get(id)
      if (list) list.push(s)
      else touching.set(id, [s])
    }
  })
  const used = new Uint8Array(segments.length)
  const extend = (chain: number[]) => {
    for (;;) {
      const last = chain[chain.length - 1]!
      const next = touching.get(last)?.find((s) => !used[s])
      if (next === undefined) return
      used[next] = 1
      const [from, to] = segments[next]!
      chain.push(from === last ? to : from)
    }
  }
  const closed: number[][] = []
  const open: number[][] = []
  for (let s = 0; s < segments.length; s++) {
    if (used[s]) continue
    used[s] = 1
    const chain = [...segments[s]!]
    extend(chain)
    if (chain[0] !== chain[chain.length - 1]) {
      chain.reverse()
      extend(chain)
    }
    if (chain[0] === chain[chain.length - 1]) closed.push(chain.slice(1))
    else open.push(chain)
  }
  const near = (a: number, b: number) => points[a]!.distanceTo(points[b]!) <= JOIN
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
  }
  return closed
    .filter((ids) => ids.length >= 3)
    .map((ids) => ids.map((id) => points[id]!.clone()))
    .filter((loop) => Math.abs(ShapeUtils.area(loop as Vector2[])) > 1e-9)
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

/**
 * One flat mesh of the loops' faces in the frame's plan (x, z at y = 0), facing up, with the owner
 * of each triangle. A loop inside one loop is a hole, inside a hole an island again, so a doorway
 * is open and the pier beside it is solid.
 */
export function buildCutCapGeometry<T>(
  sections: readonly { owner: T; loops: readonly SectionLoop[] }[],
): { geometry: BufferGeometry; triangleOwners: T[] } | null {
  const positions: number[] = []
  const indices: number[] = []
  const triangleOwners: T[] = []
  for (const { owner, loops } of sections) {
    const area = loops.map((loop) => Math.abs(ShapeUtils.area(loop as Vector2[])))
    const probes = loops.map(probe)
    // The loops that contain loop i, widest first.
    const around = loops.map((_, i) =>
      loops
        .map((_, j) => j)
        .filter((j) => j !== i && area[j]! > area[i]! && contains(loops[j]!, probes[i]!))
        .sort((a, b) => area[b]! - area[a]!),
    )
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
