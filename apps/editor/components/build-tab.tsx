'use client'

import {
  type AnyNodeId,
  isFenceFeatureNode,
  RoofType as RoofTypeSchema,
  useRegistryVersion,
  useScene,
} from '@pascal-app/core'
import {
  BuildPanelAdvancedSection,
  BuildPanelRoomsSection,
  BuildPanelSection,
  BuildToolGrid,
  BuildToolTile,
  type MessageKey,
  selectWallDrawVariant,
  startTerraceDraft,
  TerrainSculptPanel,
  ToolOptionsPanel,
  triggerSFX,
  useEditor,
  useFloorplanMode,
  useT,
  useTerraceDraft,
  useWallDrawVariant,
  viewerMessages,
} from '@pascal-app/editor'
import { useLiquidLineToolOptions } from '@pascal-app/nodes'
import { useViewer } from '@pascal-app/viewer'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/toolbar-tooltip'
import {
  activateBuildTool,
  activateFenceFeaturePlacement,
  activateRoofFeatureTool,
  activateRoofType,
  activateTerrainSculptMode,
  BASE_BUILD_TYPES,
  type BuildType,
  collectBuildTypes,
  collectRoofFeatures,
  MEP_ITEMS,
  MEP_TOOL_KINDS,
  type MepItem,
} from '@/lib/build-palette'
import { getActiveRoofFeatureId, ROOF_TYPE_OPTIONS } from '@/lib/build-tab-state'
import { cn } from '@/lib/utils'
import { KitchenBrowser } from './kitchen-browser'
import { messages } from './messages'

const subscribeToClientMount = () => () => {}

type Key = MessageKey<typeof messages>

// Labels the palette ships in English, by id. A kind registered later keeps its own label.
const BUILD_TYPE_KEYS: Readonly<Record<string, Key>> = {
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

const MEP_ITEM_KEYS: Readonly<Record<string, Key>> = {
  'duct-segment': 'mep.duct-segment',
  'duct-terminal': 'mep.duct-terminal',
  'hvac-equipment': 'mep.hvac-equipment',
  lineset: 'mep.lineset',
  'liquid-line': 'mep.liquid-line',
  'pipe-segment': 'mep.pipe-segment',
}

const ROOF_TYPE_KEYS: Readonly<Record<string, Key>> = {
  hip: 'roof.hip',
  gable: 'roof.gable',
  shed: 'roof.shed',
  flat: 'roof.flat',
  gambrel: 'roof.gambrel',
  dutch: 'roof.dutch',
  mansard: 'roof.mansard',
  conical: 'roof.conical',
}

/**
 * Build tab for the open-source standalone editor — a preset-less replica of
 * the community Build sidebar. Clicking a type activates its raw tool, drawn
 * with the kind's own `def.defaults()`. Painting has its own rail panel.
 */
export function BuildTab() {
  const t = useT(messages)
  const v = useT(viewerMessages)
  const labelOf = (table: Readonly<Record<string, Key>>, id: string, fallback: string) => {
    const key = table[id]
    return key ? t(key) : fallback
  }
  const [mepOpen, setMepOpen] = useState(false)
  const [kitchenOpen, setKitchenOpen] = useState(false)
  const [buildSearch, setBuildSearch] = useState('')
  const activeTool = useEditor((s) => s.tool)
  const selectedId = useViewer((s) => s.selection.selectedIds[0])
  const selectedFenceFeature = useScene((s) => {
    const selected = selectedId ? s.nodes[selectedId as AnyNodeId] : undefined
    return isFenceFeatureNode(selected) ? selected : undefined
  })
  const selectedFence = useScene((s) => {
    const selected = selectedId ? s.nodes[selectedId as AnyNodeId] : undefined
    const host =
      isFenceFeatureNode(selected) && selected.parentId
        ? s.nodes[selected.parentId as AnyNodeId]
        : selected
    return host?.type === 'fence' ? host : undefined
  })
  const mode = useEditor((s) => s.mode)
  const isTerraceActive = useTerraceDraft((s) => !!s.host)
  const roofDefaults = useEditor((s) => s.toolDefaults.roof)
  const fenceDefaults = useEditor((s) => s.toolDefaults.fence)
  const placingFenceFeature =
    mode === 'build' && activeTool === 'fence' ? fenceDefaults?.featurePlacement : undefined
  const floorplanMode = useFloorplanMode((s) => s.mode)
  const wallVariant = useWallDrawVariant()
  const follow = useLiquidLineToolOptions((s) => s.follow)
  const toggleFollow = useLiquidLineToolOptions((s) => s.toggleFollow)
  useRegistryVersion()
  const registryReady = useSyncExternalStore(
    subscribeToClientMount,
    () => true,
    () => false,
  )
  const buildTypes = registryReady ? collectBuildTypes(floorplanMode) : BASE_BUILD_TYPES

  const ductContext =
    mode === 'build' && (activeTool === 'duct-segment' || activeTool === 'duct-fitting')
  const pipeContext =
    mode === 'build' &&
    (activeTool === 'pipe-segment' || activeTool === 'pipe-fitting' || activeTool === 'pipe-trap')
  const liquidLineContext = mode === 'build' && activeTool === 'liquid-line'
  const fenceContext = !!selectedFence || (mode === 'build' && activeTool === 'fence')

  const isMepItemActive = (item: MepItem) => mode === 'build' && activeTool === item.kind

  // Read at render time (not module scope): the registry is populated by the
  // app bootstrap, so enumerating earlier would race it and see no kinds.
  const roofFeatures = registryReady ? collectRoofFeatures() : []

  // Tile highlight derives from the single source of truth (the active tool /
  // mode), never a separate local selection — so keyboard shortcuts and panel
  // clicks always agree on which tile is lit.
  // The roof Features sub-grid arms roof-accessory tools (skylight, chimney,
  // …); keep the Roof tile lit (and its panel open) while any of them is the
  // active tool, the same way MEP stays lit for its sub-grid tools.
  const activeRoofFeatureId = getActiveRoofFeatureId(roofFeatures, activeTool)
  const isRoofFeatureActive = mode === 'build' && activeRoofFeatureId !== null
  const isMepActive =
    (mode === 'build' && !!activeTool && MEP_TOOL_KINDS.has(activeTool)) ||
    (mode === 'select' && mepOpen)
  const isKitchenActive = kitchenOpen || (mode === 'build' && activeTool === 'cabinet')
  const parsedRoofType = RoofTypeSchema.safeParse(roofDefaults?.roofType)
  const activeRoofType = parsedRoofType.success ? parsedRoofType.data : 'gable'

  const isTypeActive = (type: BuildType) => {
    if (type.mode) return mode === type.mode
    if (type.id === 'mep') return isMepActive
    if (type.id === 'kitchen') return isKitchenActive
    if (type.id === 'terrace') return isTerraceActive
    if (type.id === 'roof')
      return mode === 'build' && (activeTool === 'roof' || isRoofFeatureActive)
    if (type.id === 'fence' && selectedFence) return true
    return mode === 'build' && activeTool === type.kind
  }

  const handleTypeClick = useCallback(
    (type: BuildType) => {
      setMepOpen(type.id === 'mep')
      setKitchenOpen(type.id === 'kitchen')
      setBuildSearch('')
      if (type.id === 'fence' && selectedFence) return
      if (type.mode === 'terrain-sculpt') {
        activateTerrainSculptMode()
      } else if (type.id === 'mep') {
        const ed = useEditor.getState()
        ed.setPhase('building')
        ed.setCatalogCategory(null)
        ed.setMode('build')
        ed.setTool(null)
      } else if (type.id === 'kitchen') {
        useEditor.getState().setMode('select')
      } else if (type.id === 'terrace') {
        startTerraceDraft()
      } else if (type.kind) {
        activateBuildTool(type.kind)
      }
    },
    [selectedFence],
  )

  // On open, land on the first build tool — parity with the community Build
  // sidebar, so switching to Build immediately arms a usable tool. Skip when a
  // Build-tab tool or special mode is already active: the current editor state
  // is the source of truth, including entry from another panel.
  const didInitRef = useRef(false)
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    if (selectedFence) return
    const ed = useEditor.getState()
    if (ed.mode === 'terrain-sculpt') return
    if (ed.mode === 'build' && ed.tool) return
    const firstType = buildTypes.find((t) => t.kind)
    if (firstType) handleTypeClick(firstType)
  }, [buildTypes, handleTypeClick, selectedFence])

  const renderTile = (type: BuildType) => (
    <BuildToolTile
      active={isTypeActive(type)}
      data-build-tool={type.id}
      iconSrc={type.iconSrc}
      key={type.id}
      label={labelOf(BUILD_TYPE_KEYS, type.id, type.label)}
      onClick={() => {
        triggerSFX('sfx:menu-click')
        handleTypeClick(type)
      }}
      onMouseEnter={() => triggerSFX('sfx:menu-hover')}
      title={labelOf(BUILD_TYPE_KEYS, type.id, type.label)}
    />
  )
  const typesIn = (section: NonNullable<BuildType['section']>) =>
    buildTypes.filter((type) => type.section === section)
  const advancedTypes = typesIn('advanced')

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <label className="sr-only" htmlFor="build-search">
        {t('build.searchLabel')}
      </label>
      <input
        id="build-search"
        type="search"
        placeholder={t('build.search')}
        value={buildSearch}
        onChange={(event) => setBuildSearch(event.target.value)}
        className="h-9 w-full shrink-0 rounded-lg border border-border bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {buildSearch.trim() ? (
        <>
          <BuildToolGrid columns={4}>
            {buildTypes
              .filter((type) =>
                labelOf(BUILD_TYPE_KEYS, type.id, type.label)
                  .toLowerCase()
                  .includes(buildSearch.toLowerCase()),
              )
              .map(renderTile)}
          </BuildToolGrid>
          <KitchenBrowser query={buildSearch} />
        </>
      ) : (
        <>
          {isKitchenActive ? (
            <button
              type="button"
              className="w-fit rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setKitchenOpen(false)
                useEditor.getState().setMode('select')
              }}
            >
              {t('build.allTools')}
            </button>
          ) : (
            <div className="flex flex-col gap-3 [&>section+section]:border-border/60 [&>section+section]:border-t [&>section+section]:pt-3">
              <BuildPanelRoomsSection
                activeVariant={mode === 'build' && activeTool === 'wall' ? wallVariant : null}
                onHover={() => triggerSFX('sfx:menu-hover')}
                onSelect={(variant) => {
                  triggerSFX('sfx:menu-click')
                  selectWallDrawVariant(variant)
                  const editor = useEditor.getState()
                  if (!(editor.mode === 'build' && editor.tool === 'wall'))
                    activateBuildTool('wall')
                }}
              />
              <BuildPanelSection id="add" title={t('build.addToRooms')}>
                <BuildToolGrid columns={4}>{typesIn('add').map(renderTile)}</BuildToolGrid>
              </BuildPanelSection>
              <BuildPanelSection id="outdoor" title={t('build.outdoor')}>
                <BuildToolGrid columns={4}>{typesIn('outdoor').map(renderTile)}</BuildToolGrid>
              </BuildPanelSection>
              <BuildPanelAdvancedSection
                containsActiveTool={advancedTypes.some(isTypeActive)}
                description={t('build.advancedDescription')}
                hint={t('build.advancedHint')}
              >
                <BuildToolGrid columns={4}>{advancedTypes.map(renderTile)}</BuildToolGrid>
              </BuildPanelAdvancedSection>
            </div>
          )}

          {mode === 'terrain-sculpt' ? (
            <div className="border-border/60 border-t pt-3">
              <TerrainSculptPanel />
            </div>
          ) : mode === 'build' && (activeTool === 'roof' || isRoofFeatureActive) ? (
            <div className="flex flex-col gap-3 border-border/60 border-t pt-3">
              <div className="flex flex-col gap-2">
                <div className="px-0.5 pt-1 font-medium text-muted-foreground text-xs">
                  {t('build.roofType')}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {ROOF_TYPE_OPTIONS.map((roofType) => {
                    const active = activeTool === 'roof' && activeRoofType === roofType.value
                    return (
                      <button
                        aria-pressed={active}
                        className={cn(
                          'rounded-lg px-2.5 py-2 text-left font-medium text-xs transition-colors',
                          active
                            ? 'bg-primary/10 text-primary ring-1 ring-primary/50'
                            : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                        key={roofType.value}
                        onClick={() => {
                          triggerSFX('sfx:menu-click')
                          activateRoofType(roofType.value)
                        }}
                        onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                        type="button"
                      >
                        {labelOf(ROOF_TYPE_KEYS, roofType.value, roofType.label)}
                      </button>
                    )
                  })}
                </div>
              </div>

              <ToolOptionsPanel
                className="border-border/50 border-t pt-3"
                kind="roof"
                onSelect={() => {
                  const editor = useEditor.getState()
                  if (!(editor.mode === 'build' && editor.tool === 'roof'))
                    activateBuildTool('roof')
                }}
              />
              {activeRoofType === 'conical' && (
                <p className="border-border/50 border-t px-0.5 pt-3 text-[11px] text-muted-foreground leading-relaxed">
                  {t('build.conicalHint')}
                </p>
              )}

              {roofFeatures.length > 0 ? (
                <div className="flex flex-col gap-2 border-border/50 border-t pt-3">
                  <div className="px-0.5 font-medium text-muted-foreground text-xs">
                    {t('build.roofFeatures')}
                  </div>
                  <TooltipProvider delayDuration={0} disableHoverableContent>
                    <div
                      className="grid gap-1.5"
                      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}
                    >
                      {roofFeatures.map((feature) => {
                        const active = mode === 'build' && feature.id === activeRoofFeatureId
                        return (
                          <Tooltip key={feature.id}>
                            <TooltipTrigger asChild>
                              <button
                                aria-pressed={active}
                                className={cn(
                                  'group relative flex aspect-square items-center justify-center rounded-xl p-1 transition-all duration-200',
                                  active
                                    ? 'bg-primary/10 ring-1 ring-primary/50'
                                    : 'bg-muted/40 opacity-70 grayscale hover:bg-muted hover:opacity-100 hover:grayscale-0',
                                )}
                                onClick={() => {
                                  triggerSFX('sfx:menu-click')
                                  activateRoofFeatureTool(feature)
                                }}
                                onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                                type="button"
                              >
                                <Image
                                  alt={feature.label}
                                  className="size-full object-contain transition-transform duration-200 group-hover:scale-110"
                                  height={48}
                                  src={feature.iconSrc}
                                  width={48}
                                />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="pointer-events-none" side="top">
                              {feature.label}
                            </TooltipContent>
                          </Tooltip>
                        )
                      })}
                    </div>
                  </TooltipProvider>
                </div>
              ) : null}
            </div>
          ) : fenceContext ? (
            <div className="flex flex-col gap-3 border-border/50 border-t pt-3">
              <div className="px-0.5 font-medium text-muted-foreground text-xs">
                {t('build.fenceFeatures')}
              </div>
              <BuildToolGrid columns={4}>
                {/* i18n-ignore: feature ids, labelled below */}
                {(['gate', 'opening'] as const).map((kind) => (
                  <BuildToolTile
                    active={placingFenceFeature === kind}
                    iconSrc={kind === 'gate' ? '/icons/gate.webp' : '/icons/open-passage.webp'}
                    key={kind}
                    label={kind === 'gate' ? t('build.gate') : t('build.opening')}
                    onClick={() => {
                      triggerSFX('sfx:menu-click')
                      activateFenceFeaturePlacement(kind)
                    }}
                    onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                    title={kind === 'gate' ? t('build.addGate') : t('build.addOpening')}
                  />
                ))}
              </BuildToolGrid>
              {selectedFenceFeature && (
                <label className="flex items-center justify-between text-xs">
                  {t('build.matchFenceStyle')}
                  <input
                    aria-label={t('build.matchFenceStyle')}
                    type="checkbox"
                    checked={selectedFenceFeature.matchFenceStyle !== false}
                    onChange={(event) =>
                      useScene.getState().updateNode(selectedFenceFeature.id, {
                        matchFenceStyle: event.currentTarget.checked,
                      })
                    }
                  />
                </label>
              )}
              {!!placingFenceFeature && (
                <div className="space-y-2 text-xs">
                  <p>{t('build.fenceHint')}</p>
                  {typeof fenceDefaults?.featurePlacementFeedback === 'string' && (
                    <p role="status" className="text-amber-400">
                      {fenceDefaults.featurePlacementFeedback}
                    </p>
                  )}
                  <label className="flex items-center justify-between">
                    {t('build.matchFenceStyle')}
                    <input
                      type="checkbox"
                      checked={fenceDefaults?.featureMatchStyle !== false}
                      onChange={(event) =>
                        useEditor.getState().setToolDefaults('fence', {
                          ...fenceDefaults,
                          featureMatchStyle: event.currentTarget.checked,
                        })
                      }
                    />
                  </label>
                  {fenceDefaults?.featureMatchStyle === false && placingFenceFeature === 'gate' && (
                    <label className="flex items-center justify-between">
                      {t('build.gateStyle')}
                      <select
                        className="rounded border bg-background p-1"
                        value={
                          typeof fenceDefaults?.featureStyle === 'string'
                            ? fenceDefaults.featureStyle
                            : 'picket'
                        }
                        onChange={(event) =>
                          useEditor.getState().setToolDefaults('fence', {
                            ...fenceDefaults,
                            featureStyle: event.currentTarget.value,
                          })
                        }
                      >
                        <option value="picket">{t('build.stylePicket')}</option>
                        <option value="slat">{t('build.styleSlat')}</option>
                        <option value="horizontal">{t('build.styleHorizontal')}</option>
                        <option value="privacy">{t('build.stylePrivacy')}</option>
                        <option value="rail">{t('build.styleRail')}</option>
                      </select>
                    </label>
                  )}
                  <label className="flex items-center justify-between">
                    {t('build.openingWidth')}
                    <input
                      className="w-20 rounded border bg-background p-1"
                      type="number"
                      min={0.35}
                      max={12}
                      step={0.05}
                      value={
                        typeof fenceDefaults?.featureWidth === 'number'
                          ? fenceDefaults.featureWidth
                          : 1.1
                      }
                      onChange={(event) => {
                        const width = event.currentTarget.valueAsNumber
                        if (Number.isFinite(width) && width >= 0.35)
                          useEditor.getState().setToolDefaults('fence', {
                            ...fenceDefaults,
                            featureWidth: Math.min(12, width),
                          })
                      }}
                    />
                  </label>
                  {placingFenceFeature === 'gate' && (
                    <label className="flex items-center justify-between">
                      {t('build.leaves')}
                      <select
                        className="rounded border bg-background p-1"
                        value={fenceDefaults?.featureLeafType === 'double' ? 'double' : 'single'}
                        onChange={(event) =>
                          useEditor.getState().setToolDefaults('fence', {
                            ...fenceDefaults,
                            featureLeafType: event.target.value,
                          })
                        }
                      >
                        <option value="single">{t('build.singleGate')}</option>
                        <option value="double">{t('build.doubleGate')}</option>
                      </select>
                    </label>
                  )}
                </div>
              )}
              <p className="px-0.5 text-[11px] text-muted-foreground">{t('build.fenceHelp')}</p>
            </div>
          ) : isKitchenActive ? (
            <KitchenBrowser />
          ) : isMepActive ? (
            <div className="flex flex-col gap-2 border-border/60 border-t pt-3">
              <div className="px-0.5 pt-1 font-medium text-muted-foreground text-xs">
                {t('build.mep')}
              </div>
              <TooltipProvider delayDuration={0} disableHoverableContent>
                <div
                  className="grid gap-1.5 px-0.5"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}
                >
                  {MEP_ITEMS.map((item) => {
                    const active = isMepItemActive(item)
                    return (
                      <Tooltip key={item.id}>
                        <TooltipTrigger asChild>
                          <button
                            aria-pressed={active}
                            className={cn(
                              'group relative flex aspect-square items-center justify-center rounded-xl transition-all duration-200',
                              active
                                ? 'bg-primary/10 ring-1 ring-primary/50'
                                : 'bg-muted/40 opacity-70 grayscale hover:bg-muted hover:opacity-100 hover:grayscale-0',
                            )}
                            onClick={() => {
                              triggerSFX('sfx:menu-click')
                              activateBuildTool(item.kind)
                            }}
                            onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                            type="button"
                          >
                            <Image
                              alt={labelOf(MEP_ITEM_KEYS, item.id, item.label)}
                              className="size-full object-contain transition-transform duration-200 group-hover:scale-110"
                              height={48}
                              src={item.iconSrc}
                              width={48}
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="pointer-events-none" side="top">
                          {labelOf(MEP_ITEM_KEYS, item.id, item.label)}
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              </TooltipProvider>

              {(['duct-fitting', 'pipe-fitting'] as const)
                .filter((kind) => (kind === 'duct-fitting' ? ductContext : pipeContext))
                .map((kind) => (
                  <ToolOptionsPanel
                    active={activeTool === kind}
                    key={kind}
                    getChoiceThumbnail={(option, value) => {
                      if (option.id !== 'fittingType') return undefined
                      if (kind === 'duct-fitting' && value === 'elbow')
                        return '/icons/duct-fitting.webp'
                      return `/icons/fittings/${kind === 'duct-fitting' ? 'duct' : 'pipe'}-${value}.webp`
                    }}
                    kind={kind}
                    onSelect={(option, value) => {
                      if (activeTool !== kind) {
                        const defaults = useEditor.getState().toolDefaults[kind]
                        activateBuildTool(kind)
                        if (defaults) useEditor.getState().setToolDefaults(kind, defaults)
                      }
                      option.set(value)
                    }}
                  />
                ))}

              {liquidLineContext ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground text-xs">{t('build.liquidLine')}</span>
                  <button
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200',
                      follow
                        ? 'bg-primary/10 ring-1 ring-primary/50'
                        : 'bg-muted/40 hover:bg-muted',
                    )}
                    onClick={() => {
                      triggerSFX('sfx:menu-click')
                      toggleFollow()
                    }}
                    onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                    type="button"
                  >
                    <span>{t('build.followLineset')}</span>
                    <span className="text-muted-foreground text-xs">
                      {follow ? v('controls.on') : v('controls.off')}
                    </span>
                  </button>
                  <span className="px-1 text-[11px] text-muted-foreground">
                    {follow ? t('build.followOn') : t('build.followOff')}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
