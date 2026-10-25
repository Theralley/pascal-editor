import { type MessageKey, translate } from '../../../i18n'
import type { CatalogCategory, StructureTool } from '../../../store/use-editor'
import { messages } from './messages'

export type ToolConfig = {
  id: StructureTool
  iconSrc: string
  labelKey: MessageKey<typeof messages>
  /** `labelKey` in the active language, read when a host renders it. */
  readonly label: string
  catalogCategory?: CatalogCategory
}

const structureTool = (
  id: StructureTool,
  iconSrc: string,
  labelKey: MessageKey<typeof messages>,
): ToolConfig => ({
  id,
  iconSrc,
  labelKey,
  get label() {
    return translate(messages, labelKey)
  },
})

// Shared structure-tool metadata (icons + labels). The build palette now lives
// in the community Build sidebar; this list survives only as the lookup table
// for cursor/floorplan indicators. Roof-mounted accessories are intentionally
// absent — they're placed from the roof inspector's "Add element" section.
export const tools: ToolConfig[] = [
  structureTool('wall', '/icons/wall.webp', 'tools.wall'),
  structureTool('door', '/icons/door.webp', 'tools.door'),
  structureTool('window', '/icons/window.webp', 'tools.window'),
  structureTool('stair', '/icons/stairs.webp', 'tools.stair'),
  structureTool('roof', '/icons/roof.webp', 'tools.roof'),
  structureTool('fence', '/icons/fence.webp', 'tools.fence'),
  structureTool('column', '/icons/column.webp', 'tools.column'),
  structureTool('elevator', '/icons/elevator.webp', 'tools.elevator'),
  structureTool('slab', '/icons/floor.webp', 'tools.slab'),
  structureTool('ceiling', '/icons/ceiling.webp', 'tools.ceiling'),
  structureTool('zone', '/icons/zone.webp', 'tools.zone'),
  structureTool('spawn', '/icons/spawn-point.webp', 'tools.spawn'),
  structureTool('shelf', '/icons/shelf.webp', 'tools.shelf'),
  structureTool('duct-segment', '/icons/duct.webp', 'tools.duct'),
  structureTool('duct-fitting', '/icons/duct-fitting.webp', 'tools.ductFitting'),
  structureTool('duct-terminal', '/icons/registers.webp', 'tools.register'),
  structureTool('hvac-equipment', '/icons/HVAC.webp', 'tools.hvac'),
  structureTool('pipe-segment', '/icons/dwv-pipes.webp', 'tools.dwvPipe'),
  structureTool('pipe-trap', '/icons/dwv-pipes.webp', 'tools.trap'),
  structureTool('pipe-fitting', '/icons/duct-fitting.webp', 'tools.pipeFitting'),
  structureTool('lineset', '/icons/lineset.webp', 'tools.lineset'),
  structureTool('liquid-line', '/icons/lineset.webp', 'tools.liquidLine'),
]
