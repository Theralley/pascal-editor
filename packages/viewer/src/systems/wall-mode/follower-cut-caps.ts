import {
  type Intersection,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  type Raycaster,
} from 'three'
import { ChangeRecord } from '../../lib/change-record'
import {
  baseFootprint,
  buildCutCapGeometry,
  type PreparedSection,
  prepareSection,
  type Section,
  type Solid,
} from '../../lib/display-cut-section'
import { createDefaultMaterial, type RenderShading } from '../../lib/materials'
import { isDrawnInScene } from '../../lib/scene-visibility'

export const FOLLOWER_CUT_CAPS_NAME = 'follower-cut-caps'

const CAP_COLOR = '#e9e7e3'

/**
 * A follower the cut passes through: the object it is built in, its own meshes and all of them
 * (what is hosted on it too), and the level it stands on.
 */
export type CappedFollower = {
  id: string
  group: Object3D
  own: readonly Mesh[]
  meshes: readonly Mesh[]
  level: Object3D
}

/** What a follower's cap keeps between passes, so a slider frame sections it again and does no more. */
type Prepared = {
  record: ChangeRecord
  shown: Mesh[]
  prepared: PreparedSection | null
  height: number
  section: Section | null
  footprint?: Solid[]
}

/** Drawn: visible up to the level, and on the scene layer itself (layers are not inherited). */
function drawn(mesh: Mesh, level: Object3D): boolean {
  if (!isDrawnInScene(mesh)) return false
  for (let object: Object3D | null = mesh; object && object !== level; object = object.parent)
    if (!object.visible) return false
  return true
}

const inverse = new Matrix4()
const relative = new Matrix4()

type Cap = { mesh: Mesh; owners: Object3D[] }

/**
 * The tops of the followers (columns, opted-in blocks) the Low cut passes through: a cap per level,
 * flat at the cut, from the section of the follower's own meshes and of everything hosted on it,
 * which the clip cuts with it. A pick on a cap lands on the follower it caps. Real geometry like the
 * walls' caps, made again whenever the followers are re-judged.
 */
export class FollowerCutCaps {
  private static readonly live = new Set<FollowerCutCaps>()
  private readonly caps = new Map<Object3D, Cap>()
  private readonly prepared = new Map<string, Prepared>()
  private material: Material | null = null
  private shading: RenderShading | undefined

  constructor() {
    FollowerCutCaps.live.add(this)
  }

  /** Takes every cap out of the picture until the returned function brings them back (a capture of whole walls). */
  static hideAll(): () => void {
    const hidden: Mesh[] = []
    for (const caps of FollowerCutCaps.live)
      for (const { mesh } of caps.caps.values()) {
        if (mesh.visible) {
          mesh.visible = false
          hidden.push(mesh)
        }
      }
    return () => {
      for (const mesh of hidden) mesh.visible = true
    }
  }

  /** Makes the caps of `followers` at `height` over their levels; a level with none loses its cap. */
  update(followers: readonly CappedFollower[], height: number, shading: RenderShading): void {
    if (this.shading !== shading) {
      this.material?.dispose()
      this.material = createDefaultMaterial(CAP_COLOR, 0.9, shading)
      this.shading = shading
      for (const { mesh } of this.caps.values()) mesh.material = this.material
    }
    const alive = new Set(followers.map((follower) => follower.id))
    for (const id of [...this.prepared.keys()]) if (!alive.has(id)) this.prepared.delete(id)
    const byLevel = new Map<Object3D, CappedFollower[]>()
    for (const follower of followers) {
      const list = byLevel.get(follower.level)
      if (list) list.push(follower)
      else byLevel.set(follower.level, [follower])
    }
    for (const level of [...this.caps.keys()]) if (!byLevel.has(level)) this.remove(level)
    for (const [level, list] of byLevel) {
      const built = buildCutCapGeometry(
        list.map((follower) => ({
          owner: follower.group,
          solids: this.solidsOf(follower, height),
        })),
      )
      if (!built) {
        this.remove(level)
        continue
      }
      let cap = this.caps.get(level)
      if (cap) {
        cap.mesh.geometry.dispose()
        cap.mesh.geometry = built.geometry
      } else {
        const mesh = new Mesh(built.geometry, this.material!)
        mesh.name = FOLLOWER_CUT_CAPS_NAME
        mesh.userData.pascalExport = 'strip'
        mesh.castShadow = true
        mesh.receiveShadow = true
        cap = { mesh, owners: [] }
        const own = cap
        // A pick lands on the stub's top as on the follower it belongs to.
        mesh.raycast = function raycast(raycaster: Raycaster, intersects: Intersection[]) {
          const hits: Intersection[] = []
          Mesh.prototype.raycast.call(this, raycaster, hits)
          for (const hit of hits) {
            const owner = own.owners[hit.faceIndex ?? -1]
            if (owner) intersects.push({ ...hit, object: owner })
          }
        }
        level.add(mesh)
        this.caps.set(level, cap)
      }
      cap.owners = built.triangleOwners
      cap.mesh.position.y = height
    }
  }

  /**
   * The section of a follower's drawn meshes at the cut. The meshes are taken into the level once
   * and again only when something they are made from, where they stand or whether they are drawn
   * changes; a height alone sections what is kept. A hidden follower, or a hidden part of one, feeds
   * nothing. A section that will not close, or comes out empty though the cut passes through, is
   * capped from the follower's base instead, so no hollow top is left.
   */
  private solidsOf(follower: CappedFollower, height: number): Solid[] {
    const { level } = follower
    let entry = this.prepared.get(follower.id)
    if (!entry) {
      entry = {
        record: new ChangeRecord(),
        shown: [],
        prepared: null,
        height: Number.NaN,
        section: null,
      }
      this.prepared.set(follower.id, entry)
    }
    level.updateWorldMatrix(true, false)
    inverse.copy(level.matrixWorld).invert()
    entry.record.begin()
    const shown: Mesh[] = []
    for (const mesh of follower.meshes) {
      const geometry = mesh.geometry
      const position = geometry?.getAttribute('position')
      if (!position) continue
      const visible = drawn(mesh, level)
      const index = geometry.getIndex()
      entry.record.ref(geometry)
      entry.record.ref(position)
      entry.record.ref(index)
      entry.record.put('version' in position ? position.version : position.data.version)
      entry.record.put(index ? index.version : 0)
      entry.record.put(geometry.drawRange.start)
      entry.record.put(Number.isFinite(geometry.drawRange.count) ? geometry.drawRange.count : -1)
      entry.record.put(visible ? 1 : 0)
      relative.multiplyMatrices(inverse, mesh.matrixWorld)
      for (let k = 0; k < 16; k++) entry.record.put(relative.elements[k]!)
      if (visible) shown.push(mesh)
    }
    if (entry.record.end() || !entry.prepared) {
      entry.shown = shown
      entry.prepared = prepareSection(shown, level)
      entry.section = null
      entry.footprint = undefined
    }
    if (entry.shown.length === 0) return []
    if (!entry.section || entry.height !== height) {
      entry.section = entry.prepared.at(height)
      entry.height = height
    }
    if (entry.section.complete && entry.section.solids.length > 0) return entry.section.solids
    const own = follower.own.filter((mesh) => entry.shown.includes(mesh))
    entry.footprint ??= baseFootprint(own, level)
    return entry.footprint
  }

  clear(): void {
    for (const level of [...this.caps.keys()]) this.remove(level)
  }

  dispose(): void {
    this.clear()
    this.prepared.clear()
    this.material?.dispose()
    this.material = null
    FollowerCutCaps.live.delete(this)
  }

  private remove(level: Object3D): void {
    const cap = this.caps.get(level)
    if (!cap) return
    cap.mesh.removeFromParent()
    cap.mesh.geometry.dispose()
    // The renderer keeps a record per object; it lets go on this.
    cap.mesh.dispose()
    this.caps.delete(level)
  }
}
