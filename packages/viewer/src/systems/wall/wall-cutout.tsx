import { type AnyNodeId, emitter, sceneRegistry, useScene, type WallNode } from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import type { Camera, Material, Object3D } from 'three'
import { type Mesh, Vector3 } from 'three/webgpu'
import {
  cutMaterial,
  cutMaterials,
  getDisplayCutHeight,
  getDisplayCutRoot,
  setDisplayCutHeight,
  setDisplayCutRoot,
  uncutMaterial,
  uncutMaterials,
} from '../../lib/display-cut'
import useViewer, { type WallMode } from '../../store/use-viewer'
import { WallCutCaps } from './wall-cut-caps'
import { wallCutApplies } from './wall-cut-eligibility'
import {
  sameMaterialArray,
  WallCutoutCache,
  type WallCutoutViewerStore,
  wallHiddenFromFacing,
  wallParts,
} from './wall-cutout-cache'
import { getWallFinishRefs } from './wall-finish-data'
import {
  getMaterialsForWall,
  getSelectionHighlightMaterials,
  type WallMaterialsResolver,
} from './wall-materials'
import { subscribeWallRebuilds } from './wall-rebuild-notifications'

const v = new Vector3()

export const WALL_CUTOUT_FRAME_PRIORITY = 0

export function runWallCutoutFrame(
  cache: WallCutoutCache,
  { camera, clock }: { camera: Camera; clock: { elapsedTime: number } },
) {
  cache.update(camera, clock.elapsedTime)
}

/**
 * Whether a wall should be hidden or see-through for the current camera and
 * wall mode. Pure: reads only its arguments and the mesh's world direction.
 *
 * Exported so hosts rendering their own layers inside `<Viewer>` can match
 * these semantics instead of re-deriving the facing test or inferring state
 * from the assigned material variant.
 */
export function getWallHideState(
  wallNode: WallNode,
  wallMesh: Mesh,
  wallMode: WallMode,
  cameraDir: Vector3,
): boolean {
  if (wallMode === 'up' || wallMode === 'low') return false
  if (wallMode === 'down') return true
  wallMesh.getWorldDirection(v)
  return wallHiddenFromFacing(wallNode, wallMode, v.dot(cameraDir) < 0)
}

/**
 * The walls as a capture draws them, until the returned function puts them back: a delete or a
 * selection highlight taken off and, with `wholeWalls`, every wall whole whatever the wall mode.
 * The palettes come from the renderer's own resolver, so a curtain wall keeps its glass.
 */
export function wallsForCapture(
  materialResolver: WallMaterialsResolver,
  viewerStore: WallCutoutViewerStore,
  wholeWalls: boolean,
): () => void {
  const snapshot = new Map<Mesh, Material | Material[]>()
  const cutParts = new Map<Mesh, { material: Material | Material[]; root: Object3D | null }>()
  const viewer = viewerStore.getState()
  sceneRegistry.byType.wall!.forEach((wallId) => {
    const wallMesh = sceneRegistry.nodes.get(wallId) as Mesh | undefined
    if (!wallMesh) return
    const wallNode = useScene.getState().nodes[wallId as AnyNodeId] as WallNode | undefined
    if (wallNode?.type !== 'wall') return
    const mats = materialResolver(
      wallNode,
      viewer.shading,
      viewer.textures,
      viewer.colorPreset,
      viewer.sceneTheme,
      useScene.getState().materials,
      getWallFinishRefs(wallMesh.geometry),
    )
    // Whole walls are whole in what they carry too: a low view cut their parts, and a part is not a wall.
    if (wholeWalls) {
      for (const part of wallParts(wallMesh)) {
        const root = getDisplayCutRoot(part)
        if (!root) continue
        cutParts.set(part, { material: part.material, root })
        setDisplayCutRoot(part, null)
        part.material = Array.isArray(part.material)
          ? uncutMaterials(part.material)
          : uncutMaterial(part.material)
      }
    }
    const current = wallMesh.material as Material | Material[]
    snapshot.set(wallMesh, current)
    if (wholeWalls || current === mats.deleteVisible) {
      wallMesh.material = mats.visible
    } else if (current === mats.deleteInvisible) {
      wallMesh.material = mats.invisible
    } else if (
      current === mats.deleteTranslucent ||
      sameMaterialArray(current, getSelectionHighlightMaterials(mats.translucent))
    ) {
      wallMesh.material = mats.translucent
    }
  })
  return () => {
    snapshot.forEach((material, mesh) => {
      mesh.material = material
    })
    cutParts.forEach(({ material, root }, part) => {
      setDisplayCutRoot(part, root)
      part.material = material
    })
  }
}

/**
 * The walls as one picture draws them low: each cut at `height` over its level, with its own caps,
 * until the returned function puts everything back exactly as it was (the live cut included). A
 * capture renders inside one callback, so the cut is laid on the meshes themselves instead of
 * waiting on the wall mode and a frame, and what the live view cut stays out of the picture.
 */
export function presentWallsLowForCapture(height: number): () => void {
  const restores: (() => void)[] = []
  const previousHeight = getDisplayCutHeight()
  setDisplayCutHeight(height)
  restores.push(() => setDisplayCutHeight(previousHeight))
  restores.push(WallCutCaps.hideAll())
  const nodes = useScene.getState().nodes
  const dress = (mesh: Mesh, root: Object3D | null) => {
    const material = mesh.material
    const previousRoot = getDisplayCutRoot(mesh)
    setDisplayCutRoot(mesh, root)
    mesh.material = Array.isArray(material)
      ? cutMaterials(uncutMaterials(material))
      : cutMaterial(uncutMaterial(material))
    restores.push(() => {
      setDisplayCutRoot(mesh, previousRoot)
      mesh.material = material
    })
  }
  sceneRegistry.byType.wall!.forEach((wallId) => {
    const mesh = sceneRegistry.nodes.get(wallId) as Mesh | undefined
    const node = nodes[wallId as AnyNodeId] as WallNode | undefined
    if (!mesh || node?.type !== 'wall' || !wallCutApplies(node)) return
    const root =
      (sceneRegistry.nodes.get(node.parentId as AnyNodeId) as Object3D | undefined) ?? mesh.parent
    dress(mesh, root)
    for (const part of wallParts(mesh)) dress(part, root)
  })
  const caps = new WallCutCaps()
  caps.update(true, height, useViewer.getState().shading)
  restores.push(() => caps.dispose())
  return () => {
    for (const restore of restores.reverse()) restore()
  }
}

export const WallCutout = ({
  viewerStore = useViewer,
  materialResolver = getMaterialsForWall,
}: {
  viewerStore?: WallCutoutViewerStore
  materialResolver?: WallMaterialsResolver
}) => {
  const cache = useMemo(
    () => new WallCutoutCache(viewerStore, materialResolver),
    [viewerStore, materialResolver],
  )

  useEffect(() => subscribeWallRebuilds((id) => cache.handleRebuilt(id)), [cache])

  useEffect(() => cache.subscribeLiveTransforms(), [cache])

  const caps = useMemo(() => new WallCutCaps(), [])
  useEffect(() => () => caps.dispose(), [caps])
  useEffect(() => subscribeWallRebuilds((id) => caps.markWall(id)), [caps])

  // Camera changes reach PostProcessing (1) in this frame. WallSystem (4)
  // notifies the next frame; WallBatchSystem (5) reads this frame's stamps.
  useFrame((state) => {
    runWallCutoutFrame(cache, state)
    const viewer = viewerStore.getState()
    caps.update(viewer.wallMode === 'low', viewer.wallCutHeight, viewer.shading)
  }, WALL_CUTOUT_FRAME_PRIORITY)

  useEffect(() => {
    let restore: (() => void) | null = null
    const restoreForCapture = (event?: { wholeWalls?: boolean }) => {
      restore = wallsForCapture(materialResolver, viewerStore, event?.wholeWalls === true)
    }
    const reapplyAfterCapture = () => {
      restore?.()
      restore = null
    }

    emitter.on('thumbnail:before-capture', restoreForCapture)
    emitter.on('thumbnail:after-capture', reapplyAfterCapture)
    return () => {
      emitter.off('thumbnail:before-capture', restoreForCapture)
      emitter.off('thumbnail:after-capture', reapplyAfterCapture)
    }
  }, [viewerStore, materialResolver])

  return null
}
