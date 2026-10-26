'use client'

import { Icon as IconifyIcon } from '@iconify/react'
import {
  CutHeightSlider,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  type MessageKey,
  SegmentedControl,
  useCanChooseLevelMode,
  useEditor,
  useFloorplanAnnotationVisibility,
  useFloorplanMode,
  useSidebarStore,
  useT,
  VIEW_SHORTCUT_KEYS,
  viewerMessages,
  visibleScene,
} from '@pascal-app/editor'
import {
  CLAY_PALETTE,
  type EdgeMode,
  getSceneTheme,
  LEVEL_MODE_OPTIONS,
  type LevelMode,
  OPENING_DISPLAY_OPTIONS,
  type OpeningDisplay,
  SCENE_THEMES,
  useViewer,
  WALL_MODE_OPTIONS,
  type WallMode,
} from '@pascal-app/viewer'
import {
  Box,
  Check,
  ChevronsLeft,
  ChevronsRight,
  Contrast,
  DoorOpen,
  Eye,
  EyeOff,
  Footprints,
  Grid2X2,
  House,
  Layers3,
  Magnet,
  PenLine,
  Ruler,
  ScanLine,
  SlidersHorizontal,
  Sparkles,
  SquareUserRound,
  SwatchBook,
  Tag,
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { cn } from '@/lib/utils'
import { messages } from './messages'
import { Tooltip, TooltipContent, TooltipTrigger } from './toolbar-tooltip'

const TOOLBAR_CONTAINER =
  'inline-flex h-8 items-stretch overflow-hidden rounded-xl border border-border bg-background/90 shadow-2xl backdrop-blur-md'

const TOOLBAR_BTN =
  'flex w-8 items-center justify-center text-muted-foreground/80 transition-colors hover:bg-white/8 hover:text-foreground/90'

function requestWalkthroughPointerLock() {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-pascal-viewer-3d] canvas')
  if (!canvas) return

  if (!canvas.hasAttribute('tabindex')) {
    canvas.tabIndex = -1
  }
  canvas.focus({ preventScroll: true })

  if (document.pointerLockElement === canvas) return

  try {
    canvas.requestPointerLock?.()
  } catch {
    return
  }
}

function ToolbarTooltip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

type Key = MessageKey<typeof messages>
type ViewerKey = MessageKey<typeof viewerMessages>

const SHADING_OPTIONS = [
  { id: 'solid', nameKey: 'shading.solid', detailKey: 'shading.solidDetail', icon: Box },
  {
    id: 'rendered',
    nameKey: 'shading.rendered',
    detailKey: 'shading.renderedDetail',
    icon: Sparkles,
  },
] as const satisfies readonly {
  id: string
  nameKey: ViewerKey
  detailKey: ViewerKey
  icon: unknown
}[]

const FLOORPLAN_ANNOTATION_OPTIONS = [
  { id: 'automaticDimensions', nameKey: 'tb.annAutoDims', icon: Ruler },
  { id: 'manualDimensions', nameKey: 'tb.annManualDims', icon: Ruler },
  { id: 'measurements', nameKey: 'tb.annMeasurements', icon: ScanLine },
  { id: 'openingMarks', nameKey: 'tb.annOpeningMarks', icon: Tag },
  { id: 'structuralGrids', nameKey: 'tb.annGrids', icon: Grid2X2 },
  { id: 'roomLabels', nameKey: 'tb.annRoomLabels', icon: SquareUserRound },
  { id: 'stairAnnotations', nameKey: 'tb.annStair', icon: Footprints },
] as const satisfies readonly { id: string; nameKey: Key; icon: unknown }[]

const FLOORPLAN_MODE_OPTIONS = [
  { id: 'default', nameKey: 'tb.modeDefault', detailKey: 'tb.modeDefaultDetail' },
  { id: 'expert', nameKey: 'tb.modeExpert', detailKey: 'tb.modeExpertDetail' },
] as const satisfies readonly { id: string; nameKey: Key; detailKey: Key }[]

const FLOORPLAN_WALL_DIMENSION_REFERENCE_OPTIONS = [
  { id: 'finished-faces', nameKey: 'tb.refFinished', detailKey: 'tb.refFinishedDetail' },
  { id: 'centerline', nameKey: 'tb.refCenter', detailKey: 'tb.refCenterDetail' },
  { id: 'stud-faces', nameKey: 'tb.refStud', detailKey: 'tb.refStudDetail' },
] as const satisfies readonly { id: string; nameKey: Key; detailKey: Key }[]

const WALL_MODE_KEYS = {
  up: 'wall.up',
  cutaway: 'wall.cutaway',
  low: 'wall.low',
  down: 'wall.down',
  translucent: 'wall.translucent',
} as const satisfies Record<WallMode, ViewerKey>

const LEVEL_MODE_KEYS = {
  stacked: 'level.stacked',
  exploded: 'level.exploded',
  solo: 'level.solo',
} as const satisfies Record<Exclude<LevelMode, 'manual'>, ViewerKey>

const OPENING_DISPLAY_KEYS = {
  marks: { nameKey: 'tb.openingMarks', detailKey: 'tb.openingMarksDetail' },
  hidden: { nameKey: 'tb.openingHidden', detailKey: 'tb.openingHiddenDetail' },
  full: { nameKey: 'tb.openingFull', detailKey: 'tb.openingFullDetail' },
} as const satisfies Record<OpeningDisplay, { nameKey: Key; detailKey: Key }>

// A theme the catalog does not know yet keeps the name it ships with.
const SCENE_THEME_KEYS: Readonly<Record<string, ViewerKey>> = {
  studio: 'theme.studio',
  paper: 'theme.paper',
  sunset: 'theme.sunset',
  overcast: 'theme.overcast',
  blueprint: 'theme.blueprint',
  mediterranean: 'theme.mediterranean',
  twilight: 'theme.twilight',
  night: 'theme.night',
  verdant: 'theme.verdant',
}

function CollapseSidebarButton() {
  const t = useT(messages)
  const isCollapsed = useSidebarStore((state) => state.isCollapsed)
  const setIsCollapsed = useSidebarStore((state) => state.setIsCollapsed)

  const toggle = useCallback(() => {
    setIsCollapsed(!isCollapsed)
  }, [isCollapsed, setIsCollapsed])

  return (
    <div className={TOOLBAR_CONTAINER}>
      <ToolbarTooltip label={isCollapsed ? t('tb.expand') : t('tb.collapse')}>
        <button
          aria-label={isCollapsed ? t('tb.expand') : t('tb.collapse')}
          className={TOOLBAR_BTN}
          onClick={toggle}
          type="button"
        >
          {isCollapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <ChevronsLeft className="h-4 w-4" />
          )}
        </button>
      </ToolbarTooltip>
    </div>
  )
}

const SEGMENTS = 'h-8 min-h-0 w-auto rounded-none border-0 bg-transparent p-1 [&>button]:min-h-0'
// Five wall modes: each segment is as wide as its word, with room around it, and the row scrolls
// before it overflows the toolbar.
const WALL_SEGMENTS = `${SEGMENTS} max-w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>button]:flex-none [&>button]:px-2.5 [&>button]:whitespace-nowrap [&>button>span]:whitespace-nowrap`

function LevelModeToggle() {
  const t = useT(messages)
  const v = useT(viewerMessages)
  const levelMode = useViewer((state) => state.levelMode)
  const setLevelMode = useViewer((state) => state.setLevelMode)
  if (!useCanChooseLevelMode()) return null

  return (
    <SegmentedControl
      aria-label={v('controls.levels')}
      className={SEGMENTS}
      mixed={levelMode === 'manual'}
      onChange={setLevelMode}
      options={LEVEL_MODE_OPTIONS.map(({ value }) => ({ value, label: v(LEVEL_MODE_KEYS[value]) }))}
      radio
      value={levelMode}
    />
  )
}

function WallModeToggle() {
  const v = useT(viewerMessages)
  const wallMode = useViewer((state) => state.wallMode)
  const setWallMode = useViewer((state) => state.setWallMode)

  // A step with U or J can land on a segment the row has scrolled away from.
  useEffect(() => {
    document
      .querySelector<HTMLElement>(
        `[role="radiogroup"][aria-label="${CSS.escape(v('controls.walls'))}"] [aria-checked="true"]`,
      )
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [wallMode, v])

  return (
    <SegmentedControl
      aria-label={v('controls.walls')}
      className={WALL_SEGMENTS}
      onChange={setWallMode}
      options={WALL_MODE_OPTIONS.map(({ value }) => ({ value, label: v(WALL_MODE_KEYS[value]) }))}
      radio
      value={wallMode}
    />
  )
}

function RoofToggle() {
  const t = useT(messages)
  const v = useT(viewerMessages)
  const showRoofs = useViewer((state) => state.showRoofs)
  const setShowRoofs = useViewer((state) => state.setShowRoofs)

  return (
    <ToolbarTooltip
      label={t(showRoofs ? 'tb.roofsHide' : 'tb.roofsShow', {
        key: VIEW_SHORTCUT_KEYS.roofs.toUpperCase(),
      })}
    >
      <button
        aria-label={v('controls.roofs')}
        aria-pressed={showRoofs}
        className={cn(TOOLBAR_BTN, !showRoofs && 'bg-white/10 text-foreground/90')}
        onClick={() => setShowRoofs(!showRoofs)}
        type="button"
      >
        <House className="h-4 w-4" />
      </button>
    </ToolbarTooltip>
  )
}

// One dropdown that gathers every "how the scene looks" control: grid, shadows,
// camera projection, units, render mode, edges and scene theme.

const EDGE_OPTIONS = [
  { id: 'off', nameKey: 'edges.off', detailKey: 'edges.offDetail' },
  { id: 'soft', nameKey: 'edges.soft', detailKey: 'edges.softDetail' },
  { id: 'strong', nameKey: 'edges.strong', detailKey: 'edges.strongDetail' },
] as const satisfies readonly { id: EdgeMode; nameKey: ViewerKey; detailKey: ViewerKey }[]

const SUBMENU_CONTENT_CLASS = 'min-w-56 rounded-xl border-border/45 bg-popover/95 backdrop-blur-xl'

function DisplayMenu() {
  const t = useT(messages)
  const v = useT(viewerMessages)
  const scene = useEditor(visibleScene)
  const showGrid = useViewer((state) => state.showGrid)
  const setShowGrid = useViewer((state) => state.setShowGrid)
  const showMeasurements = useViewer((state) => state.showMeasurements)
  const setShowMeasurements = useViewer((state) => state.setShowMeasurements)
  const unit = useViewer((state) => state.unit)
  const setUnit = useViewer((state) => state.setUnit)
  const metricNotation = useViewer((state) => state.metricNotation)
  const setMetricNotation = useViewer((state) => state.setMetricNotation)
  const unitSource = useViewer((state) => state.unitSource)
  const resetProjectUnits = useViewer((state) => state.resetProjectUnits)
  const cameraMode = useViewer((state) => state.cameraMode)
  const setCameraMode = useViewer((state) => state.setCameraMode)
  const shading = useViewer((state) => state.shading)
  const setShading = useViewer((state) => state.setShading)
  const sceneTheme = useViewer((state) => state.sceneTheme)
  const setSceneTheme = useViewer((state) => state.setSceneTheme)
  const edges = useViewer((state) => state.edges)
  const setEdges = useViewer((state) => state.setEdges)
  const wallMode = useViewer((state) => state.wallMode)
  const openingDisplay = useViewer((state) => state.openingDisplay)
  const setOpeningDisplay = useViewer((state) => state.setOpeningDisplay)
  const shadows = useViewer((state) => state.shadows)
  const setShadows = useViewer((state) => state.setShadows)
  const magneticSnap = useEditor((state) => state.magneticSnap)
  const setMagneticSnap = useEditor((state) => state.setMagneticSnap)
  const annotationVisibility = useFloorplanAnnotationVisibility((state) => state.visibility)
  const setAnnotationCategory = useFloorplanAnnotationVisibility((state) => state.setCategory)
  const wallDimensionReference = useFloorplanAnnotationVisibility(
    (state) => state.wallDimensionReference,
  )
  const setWallDimensionReference = useFloorplanAnnotationVisibility(
    (state) => state.setWallDimensionReference,
  )
  const floorplanMode = useFloorplanMode((state) => state.mode)
  const setFloorplanMode = useFloorplanMode((state) => state.setMode)

  const activeShading =
    SHADING_OPTIONS.find((option) => option.id === shading) ?? SHADING_OPTIONS[0]
  const activeEdges = EDGE_OPTIONS.find((option) => option.id === edges) ?? EDGE_OPTIONS[0]
  const activeTheme = getSceneTheme(sceneTheme)
  const sceneThemeName = (theme: { id: string; name: string }) => {
    const key = SCENE_THEME_KEYS[theme.id]
    return key ? v(key) : theme.name
  }
  const activeOpenings =
    OPENING_DISPLAY_OPTIONS.find((option) => option.value === openingDisplay) ??
    OPENING_DISPLAY_OPTIONS[0]

  // Keep the menu open when flipping a toggle.
  const keepOpen = (event: Event, fn: () => void) => {
    event.preventDefault()
    fn()
  }

  return (
    <DropdownMenu>
      <ToolbarTooltip label={v('controls.display')}>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={v('controls.display')}
            className={cn(TOOLBAR_BTN, 'w-auto gap-1.5 px-2.5 text-foreground/90')}
            type="button"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium text-xs">{t('tb.display')}</span>
          </button>
        </DropdownMenuTrigger>
      </ToolbarTooltip>
      <DropdownMenuContent
        align="end"
        className="w-60 rounded-xl border-border/45 bg-popover/95 backdrop-blur-xl"
        side="bottom"
        sideOffset={8}
      >
        <CutHeightSlider />
        {wallMode === 'low' ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <DoorOpen className="h-4 w-4" />
              <span>{t('tb.openings')}</span>
              <span className="ml-auto text-muted-foreground text-xs">
                {activeOpenings ? t(OPENING_DISPLAY_KEYS[activeOpenings.value].nameKey) : null}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className={SUBMENU_CONTENT_CLASS}>
              {OPENING_DISPLAY_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onSelect={() => setOpeningDisplay(option.value)}
                >
                  <div className="flex flex-col">
                    <span className="text-foreground">
                      {t(OPENING_DISPLAY_KEYS[option.value].nameKey)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {t(OPENING_DISPLAY_KEYS[option.value].detailKey)}
                    </span>
                  </div>
                  {openingDisplay === option.value ? (
                    <Check className="ml-auto h-4 w-4 text-foreground" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        <DropdownMenuItem onSelect={(e) => keepOpen(e, () => setShowGrid(!showGrid))}>
          <Grid2X2 className="h-4 w-4" />
          <span>{t('tb.grid')}</span>
          {showGrid ? (
            <Eye className="ml-auto h-4 w-4 text-foreground" />
          ) : (
            <EyeOff className="ml-auto h-4 w-4 text-muted-foreground" />
          )}
        </DropdownMenuItem>
        {scene === '3d' || scene === 'split' ? (
          <DropdownMenuItem
            onSelect={(e) => keepOpen(e, () => setShowMeasurements(!showMeasurements))}
          >
            <Ruler className="h-4 w-4" />
            <span>{scene === 'split' ? t('tb.measurements3d') : t('tb.measurements')}</span>
            {showMeasurements ? (
              <Eye className="ml-auto h-4 w-4 text-foreground" />
            ) : (
              <EyeOff className="ml-auto h-4 w-4 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        ) : null}
        {scene === '2d' || scene === 'split' ? (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Layers3 className="h-4 w-4" />
                <span>{t('tb.planMode')}</span>
                <span className="ml-auto text-muted-foreground text-xs">
                  {floorplanMode === 'default' ? t('tb.modeDefault') : t('tb.modeExpert')}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className={SUBMENU_CONTENT_CLASS}>
                {FLOORPLAN_MODE_OPTIONS.map((option) => (
                  <DropdownMenuItem key={option.id} onSelect={() => setFloorplanMode(option.id)}>
                    <div className="flex flex-col">
                      <span className="text-foreground">{t(option.nameKey)}</span>
                      <span className="text-muted-foreground text-xs">{t(option.detailKey)}</span>
                    </div>
                    {floorplanMode === option.id ? (
                      <Check className="ml-auto h-4 w-4 text-foreground" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {floorplanMode === 'expert' ? (
              <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Layers3 className="h-4 w-4" />
                    <span>{t('tb.planAnnotations')}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className={SUBMENU_CONTENT_CLASS}>
                    {FLOORPLAN_ANNOTATION_OPTIONS.map((option) => {
                      const OptionIcon = option.icon
                      const visible = annotationVisibility[option.id]
                      return (
                        <DropdownMenuItem
                          key={option.id}
                          onSelect={(e) =>
                            keepOpen(e, () => setAnnotationCategory(option.id, !visible))
                          }
                        >
                          <OptionIcon className="h-4 w-4" />
                          <span>{t(option.nameKey)}</span>
                          {visible ? (
                            <Eye className="ml-auto h-4 w-4 text-foreground" />
                          ) : (
                            <EyeOff className="ml-auto h-4 w-4 text-muted-foreground" />
                          )}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Ruler className="h-4 w-4" />
                    <span>{t('tb.wallDimensions')}</span>
                    <span className="ml-auto text-muted-foreground text-xs">
                      {(() => {
                        const reference = FLOORPLAN_WALL_DIMENSION_REFERENCE_OPTIONS.find(
                          (option) => option.id === wallDimensionReference,
                        )
                        return reference ? t(reference.nameKey) : null
                      })()}
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className={SUBMENU_CONTENT_CLASS}>
                    {FLOORPLAN_WALL_DIMENSION_REFERENCE_OPTIONS.map((option) => (
                      <DropdownMenuItem
                        key={option.id}
                        onSelect={(event) =>
                          keepOpen(event, () => setWallDimensionReference(option.id))
                        }
                      >
                        <div className="flex flex-col">
                          <span className="text-foreground">{t(option.nameKey)}</span>
                          <span className="text-muted-foreground text-xs">
                            {t(option.detailKey)}
                          </span>
                        </div>
                        {wallDimensionReference === option.id ? (
                          <Check className="ml-auto h-4 w-4 text-foreground" />
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            ) : null}
          </>
        ) : null}
        <DropdownMenuItem onSelect={(e) => keepOpen(e, () => setMagneticSnap(!magneticSnap))}>
          <Magnet className="h-4 w-4" />
          <span>{t('tb.magneticSnap')}</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {magneticSnap ? v('controls.on') : v('controls.off')}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => keepOpen(e, () => setShadows(!shadows))}>
          <Contrast className="h-4 w-4" />
          <span>{v('controls.shadows')}</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {shadows ? v('controls.on') : v('controls.off')}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) =>
            keepOpen(e, () =>
              setCameraMode(cameraMode === 'perspective' ? 'orthographic' : 'perspective'),
            )
          }
        >
          <IconifyIcon
            height={16}
            icon={cameraMode === 'perspective' ? 'icon-park-outline:perspective' : 'vaadin:grid'}
            width={16}
          />
          <span>{v('controls.camera')}</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {cameraMode === 'perspective' ? v('controls.perspective') : v('controls.orthographic')}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="flex h-4 w-4 items-center justify-center font-semibold text-[10px]">
              {unit === 'imperial' ? 'ft' : metricNotation === 'millimeters' ? 'mm' : 'm'}
            </span>
            <span>{t('tb.units')}</span>
            <span className="ml-auto text-muted-foreground text-xs">
              {(() => {
                const name =
                  unit === 'imperial'
                    ? t('tb.feetInches')
                    : metricNotation === 'millimeters'
                      ? t('tb.millimeters')
                      : t('tb.meters')
                return unitSource === 'project'
                  ? t('tb.unitsProject', { unit: name })
                  : unitSource === 'local'
                    ? t('tb.unitsLocal', { unit: name })
                    : name
              })()}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={SUBMENU_CONTENT_CLASS}>
            <DropdownMenuItem onSelect={() => setMetricNotation('meters')}>
              <span className="flex h-4 w-4 items-center justify-center font-semibold text-[10px]">
                m
              </span>
              <span>{t('tb.meters')}</span>
              {unit === 'metric' && metricNotation === 'meters' ? (
                <Check className="ml-auto h-4 w-4 text-foreground" />
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMetricNotation('millimeters')}>
              <span className="flex h-4 w-4 items-center justify-center font-semibold text-[10px]">
                mm
              </span>
              <span>{t('tb.millimeters')}</span>
              {unit === 'metric' && metricNotation === 'millimeters' ? (
                <Check className="ml-auto h-4 w-4 text-foreground" />
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setUnit('imperial')}>
              <span className="flex h-4 w-4 items-center justify-center font-semibold text-[10px]">
                ft
              </span>
              <span>{t('tb.feetInches')}</span>
              {unit === 'imperial' ? <Check className="ml-auto h-4 w-4 text-foreground" /> : null}
            </DropdownMenuItem>
            {unitSource === 'local' ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={resetProjectUnits}>
                  <span>{t('tb.useProjectUnits')}</span>
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <activeShading.icon className="h-4 w-4" />
            <span>{v('controls.render')}</span>
            <span className="ml-auto text-muted-foreground text-xs">
              {v(activeShading.nameKey)}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={SUBMENU_CONTENT_CLASS}>
            {SHADING_OPTIONS.map((option) => {
              const OptionIcon = option.icon
              return (
                <DropdownMenuItem key={option.id} onSelect={() => setShading(option.id)}>
                  <OptionIcon className="h-4 w-4" />
                  <div className="flex flex-col">
                    <span className="text-foreground">{v(option.nameKey)}</span>
                    <span className="text-muted-foreground text-xs">{v(option.detailKey)}</span>
                  </div>
                  {shading === option.id ? (
                    <Check className="ml-auto h-4 w-4 text-foreground" />
                  ) : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <PenLine className="h-4 w-4" />
            <span>{v('controls.edges')}</span>
            <span className="ml-auto text-muted-foreground text-xs">{v(activeEdges.nameKey)}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={SUBMENU_CONTENT_CLASS}>
            {EDGE_OPTIONS.map((option) => (
              <DropdownMenuItem key={option.id} onSelect={() => setEdges(option.id)}>
                <div className="flex flex-col">
                  <span className="text-foreground">{v(option.nameKey)}</span>
                  <span className="text-muted-foreground text-xs">{v(option.detailKey)}</span>
                </div>
                {edges === option.id ? <Check className="ml-auto h-4 w-4 text-foreground" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SwatchBook className="h-4 w-4" />
            <span>{v('controls.sceneTheme')}</span>
            <span className="ml-auto truncate text-muted-foreground text-xs">
              {sceneThemeName(activeTheme)}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-48 rounded-xl border-border/45 bg-popover/95 backdrop-blur-xl">
            {SCENE_THEMES.map((theme) => {
              const swatches = (['wall', 'roof', 'floor', 'glazing'] as const).map(
                (role) => theme.clayTints?.[role] ?? CLAY_PALETTE[role],
              )
              return (
                <DropdownMenuItem key={theme.id} onSelect={() => setSceneTheme(theme.id)}>
                  <span
                    className="grid h-5 w-5 shrink-0 grid-cols-2 overflow-hidden rounded-sm border border-black/10"
                    style={{ backgroundColor: theme.background }}
                  >
                    {swatches.map((color, index) => (
                      <span key={`${theme.id}-${index}`} style={{ backgroundColor: color }} />
                    ))}
                  </span>
                  <span className="text-foreground">{sceneThemeName(theme)}</span>
                  {sceneTheme === theme.id ? (
                    <Check className="ml-auto h-4 w-4 text-foreground" />
                  ) : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function WalkthroughButton() {
  const v = useT(viewerMessages)
  const isFirstPersonMode = useEditor((state) => state.isFirstPersonMode)
  const setFirstPersonMode = useEditor((state) => state.setFirstPersonMode)
  const handleClick = useCallback(() => {
    if (isFirstPersonMode) {
      setFirstPersonMode(false)
      return
    }

    flushSync(() => setFirstPersonMode(true))
    requestWalkthroughPointerLock()
  }, [isFirstPersonMode, setFirstPersonMode])

  return (
    <ToolbarTooltip label={v('controls.walkthrough')}>
      <button
        aria-label={v('controls.walkthrough')}
        aria-pressed={isFirstPersonMode}
        className={cn(
          TOOLBAR_BTN,
          isFirstPersonMode && 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20',
        )}
        onClick={handleClick}
        type="button"
      >
        <Footprints className="h-4 w-4" />
      </button>
    </ToolbarTooltip>
  )
}

function PreviewButton() {
  const t = useT(messages)
  return (
    <ToolbarTooltip label={t('tb.previewMode')}>
      <button
        className="flex items-center gap-1.5 px-2.5 font-medium text-muted-foreground/80 text-xs transition-colors hover:bg-white/8 hover:text-foreground/90"
        onClick={() => useEditor.getState().setPreviewMode(true)}
        type="button"
      >
        <Eye className="h-3.5 w-3.5 shrink-0" />
        <span>Preview</span>
      </button>
    </ToolbarTooltip>
  )
}

function VRButton({
  active,
  disabled,
  label,
  onToggle,
}: {
  active: boolean
  disabled: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <ToolbarTooltip label={label}>
      <button
        aria-label={label}
        aria-pressed={active}
        className={cn(TOOLBAR_BTN, active && 'bg-sky-500/15 text-sky-400 hover:bg-sky-500/20')}
        disabled={disabled}
        onClick={onToggle}
        type="button"
      >
        <IconifyIcon
          className={cn('h-4 w-4', disabled && 'animate-pulse opacity-45')}
          icon="mdi:virtual-reality"
        />
      </button>
    </ToolbarTooltip>
  )
}

export function EditorViewerToolbarLeft() {
  return (
    <>
      <CollapseSidebarButton />
    </>
  )
}

export function EditorViewerToolbarRight({
  onVRToggle,
  vrButton,
  vrActive = false,
  vrDisabled = false,
  vrLabel,
}: {
  onVRToggle?: () => void
  vrButton?: ReactNode
  vrActive?: boolean
  vrDisabled?: boolean
  vrLabel?: string
}) {
  const t = useT(messages)
  return (
    <div className={TOOLBAR_CONTAINER}>
      <LevelModeToggle />
      <WallModeToggle />
      <RoofToggle />
      <div className="my-1.5 w-px bg-border/50" />
      <DisplayMenu />
      <div className="my-1.5 w-px bg-border/50" />
      <WalkthroughButton />
      {onVRToggle || vrButton
        ? (vrButton ??
          (onVRToggle ? (
            <VRButton
              active={vrActive}
              disabled={vrDisabled}
              label={vrLabel ?? (vrActive ? t('tb.exitVr') : t('tb.enterVr'))}
              onToggle={onVRToggle}
            />
          ) : null))
        : null}
      <PreviewButton />
    </div>
  )
}
