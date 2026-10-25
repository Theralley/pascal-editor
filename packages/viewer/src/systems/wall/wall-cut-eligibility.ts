import type { WallNode } from '@pascal-app/core'

/**
 * Whether the low-wall cut applies to a wall: a curtain wall keeps its glass, in the live view and
 * in a baked scene alike.
 */
export function wallCutApplies(wall: Pick<WallNode, 'wallType'>): boolean {
  return wall.wallType !== 'curtain'
}
