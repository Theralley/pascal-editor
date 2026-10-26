import {
  type AnyNode,
  getScaledDimensions,
  type ItemNode,
  type LiveTransformLike,
  type PlacementNotice,
} from '@pascal-app/core'
import { type FloorItemMisfit, floorItemFit } from '@pascal-app/core/building'
import { getLocale, translate } from '@pascal-app/editor'
import { messages } from './messages'

const round = (value: number) =>
  (Math.round(value * 100) / 100).toLocaleString(getLocale(), { maximumFractionDigits: 2 })

/** What a person reads for a floor item that does not fit: in a door's way, or too large for its room. */
export function floorItemMisfitNotice(
  misfit: FloorItemMisfit,
  dimensions: readonly number[],
): PlacementNotice {
  const name = misfit.room?.name.trim()
  if (misfit.code === 'blocks_door')
    return {
      line: name
        ? translate(messages, 'notice.blocksDoorTo', { name })
        : translate(messages, 'notice.blocksDoor'),
    }
  return {
    line: name
      ? translate(messages, 'notice.tooLargeFor', { name })
      : translate(messages, 'notice.tooLarge'),
    detail: translate(messages, 'notice.size', {
      width: round(dimensions[0] ?? 0),
      depth: round(dimensions[2] ?? 0),
      roomWidth: round(misfit.room.width),
      roomDepth: round(misfit.room.depth),
    }),
  }
}

/**
 * The item's `placementNotice`: a floor item in a door's way or too large for its room, by the
 * check place_items refuses with (`floorItemFit`), at its live pose while it is placed or moved.
 * An item on a table, a shelf or a wall is not checked.
 */
export function itemPlacementNotice(
  node: ItemNode,
  { nodes, live }: { nodes: Readonly<Record<string, AnyNode>>; live?: LiveTransformLike },
): PlacementNotice | null {
  if (!node.parentId || nodes[node.parentId]?.type !== 'level') return null
  const item: ItemNode = live
    ? {
        ...node,
        position: live.position,
        rotation: [node.rotation[0], live.rotation, node.rotation[2]],
      }
    : node
  const dimensions = getScaledDimensions(item)
  const misfit = floorItemFit(nodes, {
    levelId: node.parentId,
    x: item.position[0],
    z: item.position[2],
    rotationDeg: ((item.rotation?.[1] ?? 0) * 180) / Math.PI,
    dimensions,
  })
  return misfit ? floorItemMisfitNotice(misfit, dimensions) : null
}
