import type { Mesh, Object3D } from 'three'
import { shareDisplayCutRootDeep } from '../../lib/display-cut'
import { hasMaterialsForGroups } from '../../lib/pointer-events'
import useViewer from '../../store/use-viewer'
import { visibleMaterialsOf } from '../wall/wall-cutout-cache'

/**
 * The picture a deleted node plays out is a copy of what stood there, and a copy wears the
 * material its source had in that frame. A node the cutaway was hiding wears its stipple, so its
 * deletion would play as faint dots: when its source carries a visible variant (the wall cutout
 * keeps one, `visibleMaterialsOf`), the copy wears that instead, the one a capture draws, for as long
 * as it plays. What the cutaway showed, and any other wall mode, keep what they wear. A copy of a
 * wall that stood cut is cut where its source was, so it plays out as the stub that stood there.
 */
export function dressDeletionGhost(source: Object3D, clone: Object3D) {
  shareDisplayCutRootDeep(source, clone)
  const visible = visibleMaterialsOf.get(source)
  const mesh = clone as Mesh
  if (
    visible &&
    useViewer.getState().wallMode === 'cutaway' &&
    source.userData.wallHidden === true &&
    mesh.isMesh &&
    mesh.geometry &&
    // A room-wide paint preview can leave the source with more groups than the palette has
    // entries; a copy with a group and no material throws on every raycast over it (see
    // `WallCutoutCache.mayAssign`), so it keeps what it wears then.
    hasMaterialsForGroups(mesh, visible)
  )
    mesh.material = visible
}
