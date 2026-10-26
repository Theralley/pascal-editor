import type { MessageKey } from '@pascal-app/editor'
import type { messages } from '@/components/messages'

type Key = MessageKey<typeof messages>

// Labels the palette ships in English, by id. A kind registered later keeps its own label.
export const BUILD_TYPE_KEYS: Readonly<Record<string, Key>> = {
  wall: 'type.wall',
  fence: 'type.fence',
  slab: 'type.slab',
  ceiling: 'type.ceiling',
  roof: 'type.roof',
  stair: 'type.stair',
  elevator: 'type.elevator',
  door: 'type.door',
  window: 'type.window',
  column: 'type.column',
  shelf: 'type.shelf',
  spawn: 'type.spawn',
  kitchen: 'type.kitchen',
  mep: 'build.mep',
  terrain: 'type.terrain',
  terrace: 'type.terrace',
}

export const MEP_ITEM_KEYS: Readonly<Record<string, Key>> = {
  'duct-segment': 'mep.duct-segment',
  'duct-terminal': 'mep.duct-terminal',
  'hvac-equipment': 'mep.hvac-equipment',
  lineset: 'mep.lineset',
  'liquid-line': 'mep.liquid-line',
  'pipe-segment': 'mep.pipe-segment',
}

export const ROOF_TYPE_KEYS: Readonly<Record<string, Key>> = {
  hip: 'roof.hip',
  gable: 'roof.gable',
  shed: 'roof.shed',
  flat: 'roof.flat',
  gambrel: 'roof.gambrel',
  dutch: 'roof.dutch',
  mansard: 'roof.mansard',
  conical: 'roof.conical',
}
