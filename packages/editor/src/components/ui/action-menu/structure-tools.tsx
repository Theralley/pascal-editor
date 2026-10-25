import type { MessageKey } from '../../../i18n'
import type { CatalogCategory, StructureTool } from '../../../store/use-editor'
import type { messages } from './messages'

export type ToolConfig = {
  id: StructureTool
  iconSrc: string
  labelKey: MessageKey<typeof messages>
  catalogCategory?: CatalogCategory
}

// Shared structure-tool metadata (icons + labels). The build palette now lives
// in the community Build sidebar; this list survives only as the lookup table
// for cursor/floorplan indicators. Roof-mounted accessories are intentionally
// absent — they're placed from the roof inspector's "Add element" section.
export const tools: ToolConfig[] = [
  { id: 'wall', iconSrc: '/icons/wall.webp', labelKey: 'tools.wall' },
  { id: 'door', iconSrc: '/icons/door.webp', labelKey: 'tools.door' },
  { id: 'window', iconSrc: '/icons/window.webp', labelKey: 'tools.window' },
  { id: 'stair', iconSrc: '/icons/stairs.webp', labelKey: 'tools.stair' },
  { id: 'roof', iconSrc: '/icons/roof.webp', labelKey: 'tools.roof' },
  { id: 'fence', iconSrc: '/icons/fence.webp', labelKey: 'tools.fence' },
  { id: 'column', iconSrc: '/icons/column.webp', labelKey: 'tools.column' },
  { id: 'elevator', iconSrc: '/icons/elevator.webp', labelKey: 'tools.elevator' },
  { id: 'slab', iconSrc: '/icons/floor.webp', labelKey: 'tools.slab' },
  { id: 'ceiling', iconSrc: '/icons/ceiling.webp', labelKey: 'tools.ceiling' },
  { id: 'zone', iconSrc: '/icons/zone.webp', labelKey: 'tools.zone' },
  { id: 'spawn', iconSrc: '/icons/spawn-point.webp', labelKey: 'tools.spawn' },
  { id: 'shelf', iconSrc: '/icons/shelf.webp', labelKey: 'tools.shelf' },
  { id: 'duct-segment', iconSrc: '/icons/duct.webp', labelKey: 'tools.duct' },
  { id: 'duct-fitting', iconSrc: '/icons/duct-fitting.webp', labelKey: 'tools.ductFitting' },
  { id: 'duct-terminal', iconSrc: '/icons/registers.webp', labelKey: 'tools.register' },
  { id: 'hvac-equipment', iconSrc: '/icons/HVAC.webp', labelKey: 'tools.hvac' },
  { id: 'pipe-segment', iconSrc: '/icons/dwv-pipes.webp', labelKey: 'tools.dwvPipe' },
  { id: 'pipe-trap', iconSrc: '/icons/dwv-pipes.webp', labelKey: 'tools.trap' },
  { id: 'pipe-fitting', iconSrc: '/icons/duct-fitting.webp', labelKey: 'tools.pipeFitting' },
  { id: 'lineset', iconSrc: '/icons/lineset.webp', labelKey: 'tools.lineset' },
  { id: 'liquid-line', iconSrc: '/icons/lineset.webp', labelKey: 'tools.liquidLine' },
]
