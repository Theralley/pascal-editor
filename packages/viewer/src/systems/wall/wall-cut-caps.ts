import { type AnyNodeId, sceneRegistry, useScene, type WallNode } from '@pascal-app/core'
import {
  type Intersection,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  type Raycaster,
} from 'three'
import { buildCutCapGeometry, type SectionLoop, sectionLoops } from '../../lib/display-cut-section'
import { createDefaultMaterial, type RenderShading } from '../../lib/materials'
import { wallCutApplies } from './wall-cut-eligibility'

export const WALL_CUT_CAPS_NAME = 'wall-cut-caps'
const WALL_COLLISION_MESH = 'collision-mesh'

const CAP_COLOR = '#e9e7e3'

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
  private readonly sections = new Map<
    string,
    { key: string | null; loops: readonly SectionLoop[] }
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
      parts.push(`${wall.id}:${this.wallKey(wall as WallNode, root, height) ?? '-'}`)
    }
    return parts.join('|')
  }

  /** What a wall's section is made of: null while it has no geometry or the cut leaves it whole. */
  private wallKey(wall: WallNode, root: Object3D, height: number): string | null {
    if (wall.visible === false || !wallCutApplies(wall)) return null
    const mesh = sceneRegistry.nodes.get(wall.id as AnyNodeId) as Mesh | undefined
    const geometry = mesh?.geometry
    const position = geometry?.getAttribute('position')
    if (!(mesh && geometry && position)) return null
    root.updateWorldMatrix(true, false)
    mesh.updateWorldMatrix(true, false)
    const relative = new Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld)
    return [
      geometry.uuid,
      'version' in position ? position.version : position.data.version,
      geometry.drawRange.start,
      geometry.drawRange.count,
      height,
      ...relative.elements,
    ].join(',')
  }

  /** Where `wall` is cut: the outline of its drawn body at the cut, kept while nothing it is made of changes. */
  private sectionOf(wall: WallNode, root: Object3D, height: number): readonly SectionLoop[] {
    const key = this.wallKey(wall, root, height)
    const kept = this.sections.get(wall.id)
    if (kept && kept.key === key) return kept.loops
    const mesh = sceneRegistry.nodes.get(wall.id as AnyNodeId) as Mesh | undefined
    const loops = key && mesh ? sectionLoops([mesh], root, height) : []
    this.sections.set(wall.id, { key, loops })
    return loops
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
    const sections: { owner: string; loops: readonly SectionLoop[] }[] = []
    for (const childId of childIds) {
      const node = nodes[childId as AnyNodeId]
      if (node?.type !== 'wall') continue
      sections.push({ owner: node.id, loops: this.sectionOf(node as WallNode, root, height) })
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
