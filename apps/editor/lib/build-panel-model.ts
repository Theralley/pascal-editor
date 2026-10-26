'use client'

import {
  type AnyNodeId,
  isFenceFeatureNode,
  RoofType as RoofTypeSchema,
  useRegistryVersion,
  useScene,
} from '@pascal-app/core'
import {
  type MessageKey,
  type PanelToolOption,
  translate,
  useEditor,
  useFloorplanMode,
  useLocale,
} from '@pascal-app/editor'
import { useLiquidLineToolOptions } from '@pascal-app/nodes'
import { useViewer } from '@pascal-app/viewer'
import type { XRWandBuildItem, XRWandBuildModel } from '@webxr/plugin'
import { messages as buildMessages } from '@/components/messages'
import { BUILD_TYPE_KEYS, MEP_ITEM_KEYS, ROOF_TYPE_KEYS } from './build-label-keys'
import {
  activateBuildTool,
  activateFenceFeaturePlacement,
  activateModularCabinetTool,
  activatePaintMode,
  activateRoofFeatureTool,
  activateRoofFootprintSource,
  activateRoofType,
  activateTerrainSculptMode,
  collectBuildTypes,
  collectRoofFeatures,
  MEP_ITEMS,
  MEP_TOOL_KINDS,
  MODULAR_CABINET_ICON,
} from './build-palette'
import {
  getRoofFootprintSource,
  getRoofFootprintSources,
  ROOF_TYPE_OPTIONS,
} from './build-tab-state'
import { messages } from './messages'

const build = (key: MessageKey<typeof buildMessages>) => translate(buildMessages, key)
const wand = (key: MessageKey<typeof messages>, vars?: Record<string, string | number>) =>
  translate(messages, key, vars)

/** An id-keyed palette label in the active language; a kind registered later keeps its own. */
function labelOf(
  table: Readonly<Record<string, MessageKey<typeof buildMessages>>>,
  id: string,
  fallback: string,
) {
  const key = table[id]
  return key ? build(key) : fallback
}

const FOOTPRINT_SOURCE_KEYS = {
  room: 'wand.fromRoom',
  walls: 'wand.fromWalls',
  draw: 'wand.fromDraw',
} as const satisfies Record<string, MessageKey<typeof messages>>

/** The roof types the wand lists, in the active language. */
export function localizedRoofTypeOptions() {
  return ROOF_TYPE_OPTIONS.map((option) => ({
    ...option,
    label: labelOf(ROOF_TYPE_KEYS, option.value, option.label),
  }))
}

/** The footprint sources of a roof type, in the active language. */
export function localizedFootprintSources(roofType: Parameters<typeof getRoofFootprintSources>[0]) {
  return getRoofFootprintSources(roofType).map((source) => ({
    ...source,
    label: wand(FOOTPRINT_SOURCE_KEYS[source.value]),
  }))
}

export function useBuildToolOptions(): PanelToolOption[] {
  useLocale()
  const mode = useEditor((state) => state.mode)
  const tool = useEditor((state) => state.tool)
  const defaults = useEditor((state) => state.toolDefaults.roof)
  const follow = useLiquidLineToolOptions((state) => state.follow)
  const toggleFollow = useLiquidLineToolOptions((state) => state.toggleFollow)
  if (mode !== 'build') return []
  if (tool === 'liquid-line') {
    return [
      {
        id: 'liquid-line-follow',
        label: build('build.followLineset'),
        value: follow ? 'on' : 'off',
        choices: [
          { value: 'on', label: wand('wand.on') },
          { value: 'off', label: wand('wand.off') },
        ],
        set: (value) => {
          if ((value === 'on') !== useLiquidLineToolOptions.getState().follow) toggleFollow()
        },
      },
    ]
  }
  const parsed = RoofTypeSchema.safeParse(defaults?.roofType)
  const roofType = parsed.success ? parsed.data : 'gable'
  if (tool !== 'roof' || roofType === 'conical') return []
  return [
    {
      id: 'roof-footprint-source',
      label: wand('wand.createFrom'),
      value: getRoofFootprintSource(roofType, defaults?.footprintSource),
      choices: localizedFootprintSources(roofType).map((source) => ({
        ...source,
        description: source.value === 'room' ? wand('wand.roomHint') : wand('wand.drawHint'),
      })),
      set: (value) => activateRoofFootprintSource(getRoofFootprintSource(roofType, value)),
    },
  ]
}

export function useBuildPanelModel(): XRWandBuildModel {
  useLocale()
  const mode = useEditor((state) => state.mode)
  const tool = useEditor((state) => state.tool)
  const selectedId = useViewer((state) => state.selection.selectedIds[0])
  const selectedFence = useScene((state) => {
    const node = selectedId ? state.nodes[selectedId as AnyNodeId] : undefined
    const host =
      isFenceFeatureNode(node) && node.parentId ? state.nodes[node.parentId as AnyNodeId] : node
    return host?.type === 'fence' ? host : undefined
  })
  const defaults = useEditor((state) => state.toolDefaults.roof)
  const floorplanMode = useFloorplanMode((state) => state.mode)
  useRegistryVersion()
  const features = collectRoofFeatures()
  const roofActive =
    mode === 'build' && (tool === 'roof' || features.some((feature) => feature.kind === tool))
  const mepActive = mode === 'build' && !!tool && MEP_TOOL_KINDS.has(tool)
  const fenceActive = !!selectedFence || (mode === 'build' && tool === 'fence')
  const kitchenActive = mode === 'build' && tool === 'cabinet'
  const duct = mode === 'build' && (tool === 'duct-segment' || tool === 'duct-fitting')
  const pipe =
    mode === 'build' && (tool === 'pipe-segment' || tool === 'pipe-fitting' || tool === 'pipe-trap')
  const parsed = RoofTypeSchema.safeParse(defaults?.roofType)
  const roofType = parsed.success ? parsed.data : 'gable'
  const buildItems = collectBuildTypes(floorplanMode).map(
    (type): XRWandBuildItem => ({
      id: type.id,
      label: labelOf(BUILD_TYPE_KEYS, type.id, type.label),
      icon: { src: type.iconSrc },
      active: type.mode
        ? mode === type.mode
        : type.id === 'roof'
          ? roofActive
          : type.id === 'fence' && selectedFence
            ? true
            : type.id === 'mep'
              ? mepActive
              : type.id === 'kitchen'
                ? kitchenActive
                : mode === 'build' && tool === type.kind,
      onSelect: () => {
        if (type.id === 'fence' && selectedFence) return
        if (type.mode === 'terrain-sculpt') activateTerrainSculptMode()
        else if (type.id === 'mep') activateBuildTool('duct-segment')
        else if (type.id === 'kitchen') activateModularCabinetTool()
        else if (type.kind) activateBuildTool(type.kind)
      },
    }),
  )
  // Painting has its own rail panel on desktop; the wand has no rail, so it stays a Build item here.
  const items: XRWandBuildItem[] = [
    ...buildItems,
    {
      id: 'painting',
      label: wand('wand.painting'),
      icon: { src: '/icons/paint.webp' },
      active: mode === 'material-paint',
      onSelect: activatePaintMode,
    },
  ]
  const secondaryItems: XRWandBuildItem[] = roofActive
    ? [
        ...localizedRoofTypeOptions().map((type) => ({
          id: `roof-${type.value}`,
          label: type.label,
          section: build('build.roofType'),
          active: tool === 'roof' && roofType === type.value,
          onSelect: () => activateRoofType(type.value),
        })),
        ...features.map((feature) => ({
          id: feature.id,
          label: feature.label,
          icon: { src: feature.iconSrc },
          section: build('build.roofFeatures'),
          active: feature.kind === tool,
          onSelect: () => activateRoofFeatureTool(feature),
        })),
      ]
    : fenceActive
      ? [
          ...(['gate', 'opening'] as const).map((kind) => ({
            id: `fence-add-${kind}`,
            label: wand(kind === 'gate' ? 'wand.addGate' : 'wand.addPassage'),
            section: wand('wand.gatesOpenings'),
            active: false,
            onSelect: () => {
              activateFenceFeaturePlacement(kind)
            },
          })),
        ]
      : mepActive
        ? [
            ...MEP_ITEMS.map((item) => ({
              id: item.id,
              label: labelOf(MEP_ITEM_KEYS, item.id, item.label),
              icon: { src: item.iconSrc },
              section: build('build.mep'),
              active:
                item.kind === 'duct-segment'
                  ? duct
                  : item.kind === 'pipe-segment'
                    ? pipe
                    : item.kind === tool,
              onSelect: () => activateBuildTool(item.kind),
            })),
            ...(duct
              ? [
                  {
                    id: 'duct-fitting',
                    label: wand('wand.addFitting'),
                    section: wand('wand.duct'),
                    icon: { src: '/icons/duct-fitting.webp' },
                    active: tool === 'duct-fitting',
                    onSelect: () =>
                      activateBuildTool(tool === 'duct-fitting' ? 'duct-segment' : 'duct-fitting'),
                  },
                ]
              : []),
            ...(pipe
              ? [
                  {
                    id: 'pipe-fitting',
                    label: wand('wand.addFitting'),
                    section: build('mep.pipe-segment'),
                    icon: { src: '/icons/duct-fitting.webp' },
                    active: tool === 'pipe-fitting',
                    onSelect: () =>
                      activateBuildTool(tool === 'pipe-fitting' ? 'pipe-segment' : 'pipe-fitting'),
                  },
                  {
                    id: 'pipe-trap',
                    label: wand('wand.addTrap'),
                    section: build('mep.pipe-segment'),
                    icon: { src: '/icons/dwv-pipes.webp' },
                    active: tool === 'pipe-trap',
                    onSelect: () =>
                      activateBuildTool(tool === 'pipe-trap' ? 'pipe-segment' : 'pipe-trap'),
                  },
                ]
              : []),
          ]
        : kitchenActive
          ? [
              {
                id: 'modular-cabinet',
                label: wand('wand.modularCabinet'),
                section: build('type.kitchen'),
                icon: { src: MODULAR_CABINET_ICON },
                active: true,
                onSelect: activateModularCabinetTool,
              },
            ]
          : []
  const section = roofActive
    ? 'roof'
    : fenceActive
      ? 'fence'
      : mepActive
        ? 'mep'
        : kitchenActive
          ? 'kitchen'
          : 'main'
  return {
    items,
    secondaryItems,
    secondaryTitle: roofActive
      ? build('type.roof')
      : fenceActive
        ? build('type.fence')
        : mepActive
          ? build('build.mep')
          : build('type.kitchen'),
    section,
    title: build('loader.tabBuild'),
    mark: wand('wand.tools', { count: items.length }),
    page: 0,
    pageCount: 1,
    detailMode: mode === 'material-paint' ? 'paint' : undefined,
  }
}
