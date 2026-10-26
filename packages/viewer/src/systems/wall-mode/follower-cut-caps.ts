import { type Intersection, type Material, Mesh, type Object3D, type Raycaster } from 'three'
import { buildCutCapGeometry, prepareSection } from '../../lib/display-cut-section'
import { createDefaultMaterial, type RenderShading } from '../../lib/materials'

export const FOLLOWER_CUT_CAPS_NAME = 'follower-cut-caps'

const CAP_COLOR = '#e9e7e3'

/** A follower the cut passes through: the object it is built in, its meshes, and the level it stands on. */
export type CappedFollower = {
  id: string
  group: Object3D
  meshes: readonly Mesh[]
  level: Object3D
}

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
          solids: prepareSection(follower.meshes, level).at(height).solids,
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

  clear(): void {
    for (const level of [...this.caps.keys()]) this.remove(level)
  }

  dispose(): void {
    this.clear()
    this.material?.dispose()
    this.material = null
    FollowerCutCaps.live.delete(this)
  }

  private remove(level: Object3D): void {
    const cap = this.caps.get(level)
    if (!cap) return
    cap.mesh.removeFromParent()
    cap.mesh.geometry.dispose()
    this.caps.delete(level)
  }
}
