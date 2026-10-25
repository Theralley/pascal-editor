import {
  type AnyNodeId,
  getEffectiveNode,
  getWallPlanFootprint,
  isCurvedWall,
  type Point2D,
  sceneRegistry,
  useScene,
  type WallNode,
} from '@pascal-app/core'
import {
  type Intersection,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  type Raycaster,
  Vector2,
} from 'three'
import {
  buildCutCapGeometry,
  type PreparedSection,
  prepareSection,
  type Section,
  type Solid,
} from '../../lib/display-cut-section'
import { createDefaultMaterial, type RenderShading } from '../../lib/materials'
import { getCachedLevelMiters } from './level-miter-cache'
import { wallCutApplies } from './wall-cut-eligibility'
import { wallParts } from './wall-cutout-cache'

export const WALL_CUT_CAPS_NAME = 'wall-cut-caps'
const WALL_COLLISION_MESH = 'collision-mesh'

const CAP_COLOR = '#e9e7e3'
const EPS = 1e-4

/** A stretch of a wall (metres from its start) the cut plane passes through empty: a doorway. */
type Gap = readonly [from: number, to: number]

type Cut = Point2D[]

/** `polygon` kept where `along(point)` is above `min` (or below, with `above` false); convex clip, any subject. */
function clipHalf(
  polygon: Cut,
  along: (point: Point2D) => number,
  limit: number,
  above: boolean,
): Cut {
  const out: Cut = []
  const inside = (value: number) => (above ? value >= limit : value <= limit)
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i]!
    const next = polygon[(i + 1) % polygon.length]!
    const a = along(current)
    const b = along(next)
    if (inside(a)) out.push(current)
    if (inside(a) !== inside(b) && a !== b) {
      const t = (limit - a) / (b - a)
      out.push({ x: current.x + (next.x - current.x) * t, y: current.y + (next.y - current.y) * t })
    }
  }
  return out
}

/** The footprint pieces of a wall that remain once its gaps are taken out. */
function wallPieces(footprint: Cut, wall: WallNode, gaps: readonly Gap[]): Cut[] {
  if (gaps.length === 0 || isCurvedWall(wall)) return [footprint]
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const length = Math.hypot(dx, dz)
  if (length < 1e-9) return [footprint]
  const along = (point: Point2D) =>
    ((point.x - wall.start[0]) * dx + (point.y - wall.start[1]) * dz) / length
  const solid: Gap[] = []
  let at = Number.NEGATIVE_INFINITY
  for (const [from, to] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (from > at) solid.push([at, from])
    at = Math.max(at, to)
  }
  solid.push([at, Number.POSITIVE_INFINITY])
  const pieces: Cut[] = []
  for (const [from, to] of solid) {
    let piece = footprint
    if (Number.isFinite(from)) piece = clipHalf(piece, along, from, true)
    if (Number.isFinite(to)) piece = clipHalf(piece, along, to, false)
    if (piece.length >= 3) pieces.push(piece)
  }
  return pieces
}

type OpeningLike = { id: string; position: number[]; width: number; height: number }

const isOpeningLike = (node: unknown): node is OpeningLike => {
  const candidate = node as Partial<OpeningLike> | undefined
  return (
    Array.isArray(candidate?.position) &&
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number'
  )
}

/**
 * The stretches of `wall` where one of its openings is open at the cut plane (level-local height).
 * An opening's height is the wall's own, which starts at the wall's base over its level.
 */
function gapsAt(
  wall: WallNode,
  nodes: ReturnType<typeof useScene.getState>['nodes'],
  height: number,
): Gap[] {
  const gaps: Gap[] = []
  const base = (sceneRegistry.nodes.get(wall.id as AnyNodeId)?.position.y ?? 0) as number
  for (const childId of wall.children ?? []) {
    const child = getEffectiveNode(nodes[childId as AnyNodeId] as never) as unknown
    if (!isOpeningLike(child)) continue
    const bottom = base + child.position[1]! - child.height / 2
    const top = base + child.position[1]! + child.height / 2
    if (bottom >= height - EPS || top <= height + EPS) continue
    gaps.push([child.position[0]! - child.width / 2, child.position[0]! + child.width / 2])
  }
  return gaps
}

/** Where the wall stands over its level: null while it has no geometry yet. */
function wallExtent(wallId: string): { base: number; top: number } | null {
  const mesh = sceneRegistry.nodes.get(wallId as AnyNodeId) as Mesh | undefined
  const geometry = mesh?.geometry
  if (!(mesh && geometry?.getAttribute('position'))) return null
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (!box || box.isEmpty()) return null
  return { base: mesh.position.y + box.min.y, top: mesh.position.y + box.max.y }
}

/** A wall's footprint, less the gaps its openings leave, as the solids of a cap. */
function footprintSolids(
  wall: WallNode,
  miters: Parameters<typeof getWallPlanFootprint>[1],
  gaps: readonly Gap[],
): Solid[] {
  const footprint = getWallPlanFootprint(wall, miters)
  if (footprint.length < 3) return []
  return wallPieces(footprint, wall, gaps).map((piece) => [
    piece.map((point) => new Vector2(point.x, point.y)),
  ])
}

/** A wall's parts that are drawn: a hidden one (a stale curtain wall's glass) is no part of the cap. */
const shownParts = (mesh: Mesh) => wallParts(mesh).filter((part) => part.visible)

const EMPTY: Section = { solids: [], complete: true }

type Cap = {
  mesh: Mesh | null
  root: Object3D
  signature: string
  triangleWalls: string[]
}

/**
 * The tops of the walls that stand cut: a cap per level, flat at the cut, so what depth, outlines
 * and picks see at the cut is a surface and not the open end of a hollow wall. Real geometry, merged
 * per level, taken from the section of each wall's drawn body with the cut plane: a wall that does
 * not reach the cut, or stands wholly above it, has none, and a doorway, an arch, a raised sill or a
 * step the cut passes through stays open, whatever the wall's shape. A level is rebuilt when what the cap is made of changes, and not otherwise.
 */
export class WallCutCaps {
  private static readonly live = new Set<WallCutCaps>()
  private readonly caps = new Map<string, Cap>()
  private readonly dirty = new Set<string>()
  /** Per wall: its body taken into the level once, and the section at the last height asked. */
  private readonly sections = new Map<
    string,
    {
      key: string
      body: PreparedSection
      parts: PreparedSection
      height: number
      section: Section
    }
  >()
  private material: Material | null = null
  private shading: RenderShading | undefined
  /** What the caps were last made from; while it holds, an update does nothing. */
  private inputs: { nodes: unknown; revision: number; height: number } | null = null

  constructor() {
    WallCutCaps.live.add(this)
  }

  /** Takes every cap out of the picture until the returned function brings them back (a capture draws its own). */
  static hideAll(): () => void {
    const hidden: Mesh[] = []
    for (const caps of WallCutCaps.live)
      for (const cap of caps.caps.values()) {
        if (cap.mesh?.visible) {
          cap.mesh.visible = false
          hidden.push(cap.mesh)
        }
      }
    return () => {
      for (const mesh of hidden) mesh.visible = true
    }
  }

  /** A wall was rebuilt: its level's cap is made again. */
  markWall(wallId: string): void {
    const node = useScene.getState().nodes[wallId as AnyNodeId]
    this.sections.delete(wallId)
    if (node?.parentId) this.dirty.add(node.parentId)
  }

  /** Brings the caps up to the walls (`enabled`), or takes them away. */
  update(enabled: boolean, height: number, shading: RenderShading): void {
    if (!enabled) {
      this.clear()
      return
    }
    if (this.shading !== shading) {
      this.material?.dispose()
      this.material = createDefaultMaterial(CAP_COLOR, 0.9, shading)
      this.shading = shading
      for (const cap of this.caps.values()) if (cap.mesh) cap.mesh.material = this.material
    }
    const { nodes } = useScene.getState()
    const last = this.inputs
    if (
      last &&
      last.nodes === nodes &&
      last.revision === sceneRegistry.revision &&
      last.height === height &&
      this.dirty.size === 0
    )
      return
    this.inputs = { nodes, revision: sceneRegistry.revision, height }
    const levelIds = sceneRegistry.byType.level ?? new Set<string>()
    for (const [levelId, cap] of this.caps) {
      if (!levelIds.has(levelId) || sceneRegistry.nodes.get(levelId as AnyNodeId) !== cap.root)
        this.remove(levelId)
    }
    for (const levelId of levelIds) {
      const level = nodes[levelId as AnyNodeId]
      const root = sceneRegistry.nodes.get(levelId as AnyNodeId)
      if (level?.type !== 'level' || !root) continue
      const cap = this.caps.get(levelId)
      const signature = this.signature(level.children, nodes, root, height)
      if (!cap || cap.root !== root || cap.signature !== signature || this.dirty.delete(levelId)) {
        this.build(levelId, root, level.children, signature, height)
      }
      const mesh = this.caps.get(levelId)?.mesh
      if (mesh && mesh.position.y !== height) mesh.position.y = height
    }
    this.dirty.clear()
    const alive = new Set<string>()
    for (const levelId of levelIds)
      for (const childId of (nodes[levelId as AnyNodeId] as { children?: string[] })?.children ??
        [])
        alive.add(childId)
    for (const wallId of this.sections.keys()) if (!alive.has(wallId)) this.sections.delete(wallId)
  }

  dispose(): void {
    this.clear()
    this.material?.dispose()
    this.material = null
    WallCutCaps.live.delete(this)
  }

  /** What the cap of a level is made of at this height: change it and the cap is made again. */
  private signature(
    childIds: readonly string[],
    nodes: ReturnType<typeof useScene.getState>['nodes'],
    root: Object3D,
    height: number,
  ): string {
    const parts: string[] = []
    for (const childId of childIds) {
      const wall = nodes[childId as AnyNodeId]
      if (wall?.type !== 'wall') continue
      const key = this.bodyKey(wall as WallNode, root)
      // A wall drawn from its footprint depends on its openings, which the section does not see.
      const gaps =
        this.sections.get(wall.id)?.section.complete === false
          ? gapsAt(wall as WallNode, nodes, height).join(',')
          : ''
      parts.push(`${wall.id}:${key === null ? '-' : `${key},${height},${gaps}`}`)
    }
    return parts.join('|')
  }

  /** What a wall's body is made of in its level: null while it has no geometry or the cut leaves it whole. */
  private bodyKey(wall: WallNode, root: Object3D): string | null {
    if (wall.visible === false || !wallCutApplies(wall)) return null
    const mesh = sceneRegistry.nodes.get(wall.id as AnyNodeId) as Mesh | undefined
    const geometry = mesh?.geometry
    const position = geometry?.getAttribute('position')
    if (!(mesh && geometry && position)) return null
    root.updateWorldMatrix(true, false)
    mesh.updateWorldMatrix(true, false)
    const relative = new Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld)
    // A moulding or finish the wall carries is cut with it, so a change in one remakes the cap.
    const parts = shownParts(mesh).map((part) => part.geometry.uuid)
    return [
      geometry.uuid,
      'version' in position ? position.version : position.data.version,
      geometry.drawRange.start,
      geometry.drawRange.count,
      ...relative.elements,
      ...parts,
    ].join(',')
  }

  /**
   * Where `wall` is cut: its drawn body taken into the level once, and sectioned again only when
   * the height moves. Null when the wall has nothing drawn or the cut leaves it whole.
   */
  private sectionOf(wall: WallNode, root: Object3D, height: number): Section | null {
    const key = this.bodyKey(wall, root)
    const mesh = sceneRegistry.nodes.get(wall.id as AnyNodeId) as Mesh | undefined
    if (key === null || !mesh) {
      this.sections.delete(wall.id)
      return null
    }
    let kept = this.sections.get(wall.id)
    if (!kept || kept.key !== key) {
      // A seam narrower than a hundredth of the wall's thickness is the mesh's, not a gap.
      const seam = Math.max(1e-3, (wall.thickness ?? 0.1) * 0.01)
      // The parts are solids of their own, so one that overlaps the body is never its hole; their
      // outlines may stay open without the body's cap going back to the footprint.
      kept = {
        key,
        body: prepareSection([mesh], root, seam),
        parts: prepareSection(shownParts(mesh), root, seam),
        height,
        section: EMPTY,
      }
      kept.section = this.sectionAt(kept, height)
      this.sections.set(wall.id, kept)
    } else if (kept.height !== height) {
      kept.height = height
      kept.section = this.sectionAt(kept, height)
    }
    return kept.section
  }

  private sectionAt(
    kept: { body: PreparedSection; parts: PreparedSection },
    height: number,
  ): Section {
    const body = kept.body.at(height)
    return { solids: [...body.solids, ...kept.parts.at(height).solids], complete: body.complete }
  }

  private build(
    levelId: string,
    root: Object3D,
    childIds: readonly string[],
    signature: string,
    height: number,
  ): void {
    const { nodes } = useScene.getState()
    const previous = this.caps.get(levelId)
    const sections: { owner: string; solids: readonly Solid[] }[] = []
    let effective: WallNode[] | null = null
    for (const childId of childIds) {
      const node = nodes[childId as AnyNodeId]
      if (node?.type !== 'wall') continue
      const section = this.sectionOf(node as WallNode, root, height)
      if (!section) continue
      if (section.complete) {
        sections.push({ owner: node.id, solids: section.solids })
        continue
      }
      // The mesh would not close at the cut: this wall is capped from its footprint, with the
      // gaps its openings leave, and not left a hollow stub.
      if (process.env.NODE_ENV !== 'production')
        console.debug(`[wall-cut-caps] ${node.id}: section did not close, capped from footprint`)
      const extent = wallExtent(node.id)
      if (!extent || extent.top <= height + EPS || extent.base >= height - EPS) continue
      effective ??= childIds.flatMap((id) => {
        const wall = nodes[id as AnyNodeId]
        return wall?.type === 'wall' ? [getEffectiveNode(wall as WallNode)] : []
      })
      const wall = getEffectiveNode(node as WallNode)
      sections.push({
        owner: node.id,
        solids: footprintSolids(
          wall,
          getCachedLevelMiters(levelId, effective),
          gapsAt(wall, nodes, height),
        ),
      })
    }
    const built = buildCutCapGeometry(sections)
    if (!built) {
      this.remove(levelId)
      this.caps.set(levelId, { mesh: null, root, signature, triangleWalls: [] })
      return
    }
    let mesh = previous?.root === root ? previous.mesh : null
    if (mesh) {
      mesh.geometry.dispose()
      mesh.geometry = built.geometry
    } else {
      this.remove(levelId)
      mesh = new Mesh(built.geometry, this.material!)
      mesh.name = WALL_CUT_CAPS_NAME
      mesh.userData.pascalExport = 'strip'
      mesh.castShadow = true
      mesh.receiveShadow = true
      root.add(mesh)
    }
    const cap: Cap = { mesh, root, signature, triangleWalls: built.triangleOwners }
    // A pick lands on the stub's top as on the wall it belongs to.
    mesh.raycast = function raycast(raycaster: Raycaster, intersects: Intersection[]) {
      const hits: Intersection[] = []
      Mesh.prototype.raycast.call(this, raycaster, hits)
      for (const hit of hits) {
        const wallId = cap.triangleWalls[hit.faceIndex ?? -1]
        const owner = wallId
          ? (sceneRegistry.nodes.get(wallId as AnyNodeId)?.getObjectByName(WALL_COLLISION_MESH) ??
            sceneRegistry.nodes.get(wallId as AnyNodeId))
          : null
        if (owner) intersects.push({ ...hit, object: owner })
      }
    }
    this.caps.set(levelId, cap)
  }

  private remove(levelId: string): void {
    const cap = this.caps.get(levelId)
    if (!cap) return
    cap.mesh?.removeFromParent()
    cap.mesh?.geometry.dispose()
    this.caps.delete(levelId)
  }

  private clear(): void {
    this.inputs = null
    this.sections.clear()
    for (const levelId of [...this.caps.keys()]) this.remove(levelId)
  }
}
