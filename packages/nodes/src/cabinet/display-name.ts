import { type MessageKey, translate } from '@pascal-app/editor'
import { messages } from './messages'

const DEFAULT_NAME_KEYS = {
  'Wall Cabinet': 'name.Wall Cabinet',
  'Base Cabinet': 'name.Base Cabinet',
  'Drawer Base': 'name.Drawer Base',
  Dishwasher: 'name.Dishwasher',
  'Gas Hob Base': 'name.Gas Hob Base',
  'Induction Base': 'name.Induction Base',
  'Sink Base': 'name.Sink Base',
  'Tall Pantry': 'name.Tall Pantry',
  'Oven Tower': 'name.Oven Tower',
  'Single Door Refrigerator': 'name.Single Door Refrigerator',
  'Corner Filler': 'name.Corner Filler',
  'Wall Bridge Filler': 'name.Wall Bridge Filler',
  'Corner Wall Filler': 'name.Corner Wall Filler',
  'Wall filler': 'name.Wall filler',
  'Corner Base Run': 'name.Corner Base Run',
  'Corner Wall Bridge': 'name.Corner Wall Bridge',
  'Corner Wall Run': 'name.Corner Wall Run',
  'Tall Cabinet': 'name.Tall Cabinet',
  Chimney: 'name.Chimney',
  'Kitchen Island': 'name.Kitchen Island',
  'Wall cabinets': 'name.Wall cabinets',
  'Kitchen run': 'name.Kitchen run',
} as const satisfies Record<string, MessageKey<typeof messages>>

/**
 * A name shown to the person. The names a tool gives its nodes ("Base Cabinet 2") also tell the
 * run logic which module is which, so they stay English in the scene and read in the active
 * language here. A name the person typed is shown as typed.
 */
export function cabinetDisplayName(name: string): string {
  const match = /^(.*?)(?: (\d+))?$/.exec(name)
  const base = match?.[1] ?? name
  const key = DEFAULT_NAME_KEYS[base as keyof typeof DEFAULT_NAME_KEYS]
  if (!key) return name
  const label = translate(messages, key)
  return match?.[2] ? `${label} ${match[2]}` : label
}
