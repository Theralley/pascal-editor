import { Box3, type Intersection, type Material, Mesh, type Object3D, Vector3 } from 'three'
import {
  cutLike,
  setDisplayCutHeight,
  setDisplayCutRaycast,
  setDisplayCutRoot,
} from '../../lib/display-cut'
import {
  baseFootprint,
  buildCutCapGeometry,
  groupInstances,
  type PreparedSection,
  prepareSection,
  type Solid,
} from '../../lib/display-cut-section'

/**
 * `follower`: a node of a kind that follows the wall mode (a column), stamped by the bake. It is cut
 * as the walls are, with what is hosted on it, and every one of its meshes is a solid of its own.
 */
type BakedWall = { object: Object3D; level: Object3D; follower?: boolean }

export const GLB_WALL_CAPS_NAME = 'wall-cut-caps'

const isIdentity = (object: Object3D) =>
  Boolean((object.userData as { pascalId?: string }).pascalId)

/** The meshes a baked wall draws itself: its own, not those of the openings and items hosted on it. */
function ownMeshes(wall: Object3D, hosted = false): Mesh[] {
  const meshes: Mesh[] = []
  const walk = (node: Object3D) => {
    if ((node as Mesh).isMesh) meshes.push(node as Mesh)
    for (const child of node.children) if (hosted || !isIdentity(child)) walk(child)
  }
  walk(wall)
  return meshes
}

const volume = new Box3()
const size = new Vector3()

/**
 * The body of a baked wall among the meshes it draws itself: the meshes sharing the position
 * attribute of the one with the largest extent in the world (a moulding scaled small is not it).
 * The rest are trims, which are cut and capped as solids of their own.
 */
function splitBody(all: readonly Mesh[]): { body: Mesh[]; trims: Mesh[] } {
  // A mesh that is hidden is not drawn, so it takes no cap (as a hidden part of a live wall).
  const meshes = all.filter((mesh) => mesh.visible)
  let widest: Mesh | undefined
  let most = -1
  for (const mesh of meshes) {
    if (!mesh.geometry?.getAttribute('position')) continue
    volume.setFromObject(mesh).getSize(size)
    if (size.x * size.y * size.z > most) {
      most = size.x * size.y * size.z
      widest = mesh
    }
  }
  const position = widest?.geometry.getAttribute('position')
  const body = meshes.filter((mesh) => mesh.geometry?.getAttribute('position') === position)
  return { body, trims: meshes.filter((mesh) => !body.includes(mesh)) }
}

/**
 * Whether a baked material is glass: an alpha blend, or the transmission a bake exports glass as
 * (opaque, `transparent` off, with its authored opacity kept in the material's extras).
 */
function seesThrough(mesh: Mesh): boolean {
  const baked = (mesh.userData as { __bakedMaterial?: Material | Material[] }).__bakedMaterial
  return [baked ?? mesh.material].flat().some((material) => {
    const glass = material as Material & { transmission?: number }
    return (
      (glass.transmission ?? 0) > 0 ||
      typeof material.userData?.pascalGlassOpacity === 'number' ||
      (material.transparent && material.opacity < 1)
    )
  })
}

/**
 * Whether the cut applies to a baked wall. A bake says so itself (`displayCut`); one made before
 * it did is judged by what it draws: a wall in glass is a curtain wall, which the cut leaves whole.
 * That is a guess: a glass finish on a wall that is not a curtain wall reads the same.
 */
function cutApplies(object: Object3D, meshes: readonly Mesh[]): boolean {
  const stamped = (object.userData as { displayCut?: boolean }).displayCut
  return stamped ?? !meshes.some(seesThrough)
}

export type BakedWallCut = {
  setHeight: (height: number) => void
  dispose: () => void
}

/**
 * Cuts the walls of a baked scene (a published GLB) like the live viewer cuts them: their
 * materials wear the mask, a pick sees the stub, and each level gets a cap at the cut taken from the
 * section of the walls' drawn bodies, so a doorway, a window the cut passes through and a wall
 * shorter than the cut come out as they do live. Presentation only: `dispose` puts every mesh back
 * as it was.
 */
export function cutBakedWalls(
  walls: readonly BakedWall[],
  height: number,
  capMaterial: Material,
): BakedWallCut {
  setDisplayCutHeight(height)
  const worn = new Map<Mesh, Material | Material[]>()
  const perLevel = new Map<
    Object3D,
    {
      object: Object3D
      /** Each instance of the body on its own: its bounds, its fallback, its completeness. */
      instances: { section: PreparedSection; meshes: Mesh[]; footprint?: Solid[] }[]
      trims: PreparedSection
      /**
       * A follower's hosted meshes: cut with it only while the cut passes through the follower's
       * own geometry, as the live clip does, and left whole when it is wholly under or over it.
       */
      hosted?: { meshes: Mesh[]; section: PreparedSection; on: boolean }
    }[]
  >()
  for (const { object, level, follower } of walls) {
    // A follower is cut by its own geometry, and what is hosted on it follows that (see `hosted`).
    const own = ownMeshes(object)
    if (!follower && !cutApplies(object, own)) continue
    const entries = perLevel.get(level) ?? []
    perLevel.set(level, entries)
    const { body, trims } = follower
      ? { body: own.filter((m) => m.visible), trims: [] }
      : splitBody(own)
    const hostedMeshes = follower
      ? ownMeshes(object, true).filter((mesh) => !own.includes(mesh) && mesh.visible)
      : []
    entries.push({
      object,
      instances: groupInstances(body).map((meshes) => ({
        section: prepareSection(meshes, level),
        meshes,
      })),
      trims: prepareSection(trims, level),
      ...(follower
        ? {
            hosted: {
              meshes: hostedMeshes,
              section: prepareSection(hostedMeshes, level),
              on: false,
            },
          }
        : {}),
    })
    for (const mesh of own) {
      worn.set(mesh, mesh.material)
      setDisplayCutRoot(mesh, level)
      setDisplayCutRaycast(mesh, true)
      mesh.material = cutLike(mesh, mesh.material)
    }
  }
  const setHosted = (
    hosted: { meshes: Mesh[]; on: boolean },
    level: Object3D,
    on: boolean,
  ): void => {
    if (hosted.on === on) return
    hosted.on = on
    for (const mesh of hosted.meshes) {
      if (on) {
        worn.set(mesh, mesh.material)
        setDisplayCutRoot(mesh, level)
        setDisplayCutRaycast(mesh, true)
        mesh.material = cutLike(mesh, mesh.material)
      } else {
        mesh.material = worn.get(mesh) ?? mesh.material
        worn.delete(mesh)
        setDisplayCutRaycast(mesh, false)
        setDisplayCutRoot(mesh, null)
      }
    }
  }
  const caps = new Map<Object3D, Mesh>()
  const owners = new WeakMap<Mesh, Object3D[]>()
  const capLevels = (at: number) => {
    for (const [level, entries] of perLevel) {
      const built = buildCutCapGeometry(
        entries.map((entry) => {
          const solids: Solid[] = []
          for (const instance of entry.instances) {
            const section = instance.section.at(at)
            // An instance whose section will not close is capped from its base, where it stands
            // across the cut, and not left a hollow stub; one wholly over or under it is not.
            if (
              !section.complete &&
              instance.section.bounds.min < at &&
              instance.section.bounds.max > at
            ) {
              instance.footprint ??= baseFootprint(instance.meshes, level)
              solids.push(...instance.footprint)
            } else solids.push(...section.solids)
          }
          // A trim never decides that.
          solids.push(...entry.trims.at(at).solids)
          if (entry.hosted) {
            const reach = entry.instances.reduce(
              (range, instance) => ({
                min: Math.min(range.min, instance.section.bounds.min),
                max: Math.max(range.max, instance.section.bounds.max),
              }),
              { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
            )
            const straddles = reach.min < at && reach.max > at
            setHosted(entry.hosted, level, straddles)
            if (straddles) solids.push(...entry.hosted.section.at(at).solids)
          }
          return { owner: entry.object, solids }
        }),
      )
      let cap = caps.get(level)
      if (!built) {
        if (cap) {
          cap.removeFromParent()
          cap.geometry.dispose()
          caps.delete(level)
        }
        continue
      }
      if (cap) cap.geometry.dispose()
      else {
        cap = new Mesh(built.geometry, capMaterial)
        cap.name = GLB_WALL_CAPS_NAME
        cap.userData.pascalExport = 'strip'
        cap.castShadow = true
        cap.receiveShadow = true
        // A pick lands on the stub's top as on the wall it belongs to.
        cap.raycast = function raycast(raycaster, intersects) {
          const hits: Intersection[] = []
          Mesh.prototype.raycast.call(this, raycaster, hits)
          for (const hit of hits) {
            const owner = owners.get(this as Mesh)?.[hit.faceIndex ?? -1]
            if (owner) intersects.push({ ...hit, object: owner })
          }
        }
        level.add(cap)
        caps.set(level, cap)
      }
      cap.geometry = built.geometry
      owners.set(cap, built.triangleOwners)
      cap.position.y = at
    }
  }
  capLevels(height)
  return {
    setHeight: (next) => {
      setDisplayCutHeight(next)
      capLevels(next)
    },
    dispose: () => {
      for (const cap of caps.values()) {
        cap.removeFromParent()
        cap.geometry.dispose()
      }
      caps.clear()
      for (const [mesh, material] of worn) {
        setDisplayCutRaycast(mesh, false)
        setDisplayCutRoot(mesh, null)
        mesh.material = material
      }
    },
  }
}
