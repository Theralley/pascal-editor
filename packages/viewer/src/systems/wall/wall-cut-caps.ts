import {
  type AnyNodeId,
  getEffectiveNode,
  getWallPlanFootprint,
  type Point2D,
  sceneRegistry,
  useScene,
  type WallNode,
} from '@pascal-app/core'
import {
  BufferGeometry,
  Float32BufferAttribute,
  type Material,
  Mesh,
  type Object3D,
  ShapeUtils,
  Vector2,
} from 'three'
import { createDefaultMaterial, type RenderShading } from '../../lib/materials'
import { getCachedLevelMiters } from './level-miter-cache'

export const WALL_CUT_CAPS_NAME = 'wall-cut-caps'

const CAP_COLOR = '#e9e7e3'

/**
 * One flat mesh of the floor-plan footprints of `walls`, in the plan's own frame (x, z at y = 0),
 * facing up. The cut moves it by its transform, so changing the height rebuilds nothing.
 */
export function buildWallCapGeometry(
  walls: readonly WallNode[],
  miters: Parameters<typeof getWallPlanFootprint>[1],
): BufferGeometry | null {
  const positions: number[] = []
  const indices: number[] = []
  for (const wall of walls) {
    const footprint = getWallPlanFootprint(wall, miters)
    if (footprint.length < 3) continue
    const contour = footprint.map((point: Point2D) => new Vector2(point.x, point.y))
    const triangles = ShapeUtils.triangulateShape(contour, [])
    if (triangles.length === 0) continue
    const base = positions.length / 3
    for (const point of contour) positions.push(point.x, 0, point.y)
    // In the plan y is world z: wind each triangle so it faces up, whatever the triangulator did.
    for (const [a, b, c] of triangles) {
      const pa = contour[a!]!
      const pb = contour[b!]!
      const pc = contour[c!]!
      const up = (pb.y - pa.y) * (pc.x - pa.x) - (pb.x - pa.x) * (pc.y - pa.y)
      if (up >= 0) indices.push(base + a!, base + b!, base + c!)
      else indices.push(base + a!, base + c!, base + b!)
    }
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
  return geometry
}

type Cap = { mesh: Mesh | null; root: Object3D; walls: readonly WallNode[] }

function sameWalls(a: readonly WallNode[], b: readonly WallNode[]): boolean {
  return a.length === b.length && a.every((wall, i) => wall === b[i])
}

/**
 * The tops of the walls that stand cut: a cap per level, flat at the cut, so what depth, outlines
 * and picks see at the cut is a surface and not the open end of a hollow wall. Real geometry,
 * merged per level, that follows the walls' footprints and moves with the cut height by its
 * transform.
 */
export class WallCutCaps {
  private readonly caps = new Map<string, Cap>()
  private material: Material | null = null
  private shading: RenderShading | undefined

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
    const levelIds = sceneRegistry.byType.level ?? new Set<string>()
    for (const [levelId, cap] of this.caps) {
      if (!levelIds.has(levelId) || sceneRegistry.nodes.get(levelId as AnyNodeId) !== cap.root)
        this.remove(levelId)
    }
    for (const levelId of levelIds) {
      const level = nodes[levelId as AnyNodeId]
      const root = sceneRegistry.nodes.get(levelId as AnyNodeId)
      if (level?.type !== 'level' || !root) continue
      const walls: WallNode[] = []
      for (const childId of level.children) {
        const child = nodes[childId as AnyNodeId]
        if (child?.type === 'wall') walls.push(getEffectiveNode(child as WallNode))
      }
      const cap = this.caps.get(levelId)
      if (!cap || cap.root !== root || !sameWalls(cap.walls, walls)) {
        this.build(levelId, root, walls)
      }
      const mesh = this.caps.get(levelId)?.mesh
      if (mesh && mesh.position.y !== height) mesh.position.y = height
    }
  }

  dispose(): void {
    this.clear()
    this.material?.dispose()
    this.material = null
  }

  private build(levelId: string, root: Object3D, walls: WallNode[]): void {
    const previous = this.caps.get(levelId)
    // A curtain wall keeps its glass: it is not cut, so it has no cap.
    const capped = walls.filter((wall) => wall.visible !== false && wall.wallType !== 'curtain')
    const geometry =
      capped.length > 0 ? buildWallCapGeometry(capped, getCachedLevelMiters(levelId, walls)) : null
    if (!geometry) {
      this.remove(levelId)
      this.caps.set(levelId, { mesh: null, root, walls })
      return
    }
    let mesh = previous?.root === root ? previous.mesh : null
    if (mesh) {
      mesh.geometry.dispose()
      mesh.geometry = geometry
    } else {
      this.remove(levelId)
      mesh = new Mesh(geometry, this.material!)
      mesh.name = WALL_CUT_CAPS_NAME
      mesh.userData.pascalExport = 'strip'
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.raycast = () => {}
      root.add(mesh)
    }
    this.caps.set(levelId, { mesh, root, walls })
  }

  private remove(levelId: string): void {
    const cap = this.caps.get(levelId)
    if (!cap) return
    cap.mesh?.removeFromParent()
    cap.mesh?.geometry.dispose()
    this.caps.delete(levelId)
  }

  private clear(): void {
    for (const levelId of [...this.caps.keys()]) this.remove(levelId)
  }
}
