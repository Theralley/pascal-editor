'use client'

import { emitter } from '@pascal-app/core'
import {
  CLAY_PALETTE,
  type EdgeMode,
  getSceneTheme,
  LEVEL_MODE_OPTIONS,
  type LevelMode,
  SCENE_THEMES,
  useViewer,
  WALL_MODE_OPTIONS,
  type WallMode,
} from '@pascal-app/viewer'
import {
  Box,
  Camera,
  Check,
  Contrast,
  Diamond,
  Eye,
  EyeOff,
  Footprints,
  House,
  Layers,
  Layers2,
  Palette,
  PenLine,
  SlidersHorizontal,
  Sparkles,
  Square,
  SwatchBook,
} from 'lucide-react'
import { type MessageKey, useT } from '../../i18n'
import { cn } from '../../lib/utils'
import { VIEW_SHORTCUT_KEYS } from '../../lib/view-shortcuts'
import { ActionButton } from '../ui/action-menu/action-button'
import { FollowPascalToggle } from '../ui/action-menu/follow-pascal-toggle'
import { CutHeightSlider } from '../ui/controls/cut-height-slider'
import { SegmentedControl } from '../ui/controls/segmented-control'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/primitives/dropdown-menu'
import { TooltipProvider } from '../ui/primitives/tooltip'
import { messages } from './messages'

const levelModeIcons = {
  stacked: Layers,
  exploded: Layers2,
  solo: Diamond,
}

const wallModeIcons = {
  up: '/icons/room.webp',
  cutaway: '/icons/wallcut.webp',
  low: '/icons/walllow.webp',
  down: '/icons/walllow.webp',
  translucent: '/icons/wall.webp',
}

const SEGMENTS = 'h-10 min-h-0 w-auto sm:h-11'

type Key = MessageKey<typeof messages>

const SHADING_OPTIONS = [
  { id: 'solid', nameKey: 'shading.solid', detailKey: 'shading.solidDetail', icon: Box },
  {
    id: 'rendered',
    nameKey: 'shading.rendered',
    detailKey: 'shading.renderedDetail',
    icon: Sparkles,
  },
] as const satisfies readonly { id: string; nameKey: Key; detailKey: Key; icon: unknown }[]

const EDGE_OPTIONS = [
  { id: 'off', nameKey: 'edges.off', detailKey: 'edges.offDetail' },
  { id: 'soft', nameKey: 'edges.soft', detailKey: 'edges.softDetail' },
  { id: 'strong', nameKey: 'edges.strong', detailKey: 'edges.strongDetail' },
] as const satisfies readonly { id: EdgeMode; nameKey: Key; detailKey: Key }[]

const WALL_MODE_KEYS = {
  up: 'wall.up',
  cutaway: 'wall.cutaway',
  low: 'wall.low',
  down: 'wall.down',
  translucent: 'wall.translucent',
} as const satisfies Record<WallMode, Key>

const LEVEL_MODE_KEYS = {
  stacked: 'level.stacked',
  exploded: 'level.exploded',
  solo: 'level.solo',
} as const satisfies Record<Exclude<LevelMode, 'manual'>, Key>

// A theme the catalog does not know yet keeps the name it ships with.
const SCENE_THEME_KEYS: Readonly<Record<string, Key>> = {
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

// Keep the dropdown open when flipping an in-place toggle row.
const keepOpen = (event: Event, fn: () => void) => {
  event.preventDefault()
  fn()
}

// Scans + guides folded into one control. A baked GLB carries none of its own,
// but the GLB viewer re-adds them from scene data when the privacy flags allow,
// so the toggle shows for whichever exist.
function VisibilityMenu({
  canShowScans,
  canShowGuides,
}: {
  canShowScans: boolean
  canShowGuides: boolean
}) {
  const t = useT(messages)
  const showScans = useViewer((s) => s.showScans)
  const showGuides = useViewer((s) => s.showGuides)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ActionButton
          className="hover:bg-white/5 hover:text-foreground"
          label={t('controls.visibility')}
          size="icon"
          tooltipClassName="dark"
          tooltipSide="top"
          variant="ghost"
        >
          <Eye className="h-5 w-5" />
        </ActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="dark min-w-44" side="top">
        {canShowScans && (
          <DropdownMenuItem
            onSelect={(e) => keepOpen(e, () => useViewer.getState().setShowScans(!showScans))}
          >
            <img alt="" className="h-4 w-4 object-contain" src="/icons/mesh.webp" />
            <span>{t('controls.scans')}</span>
            {showScans ? (
              <Eye className="ml-auto h-4 w-4 text-foreground" />
            ) : (
              <EyeOff className="ml-auto h-4 w-4 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        )}
        {canShowGuides && (
          <DropdownMenuItem
            onSelect={(e) => keepOpen(e, () => useViewer.getState().setShowGuides(!showGuides))}
          >
            <img alt="" className="h-4 w-4 object-contain" src="/icons/floorplan.webp" />
            <span>{t('controls.guides')}</span>
            {showGuides ? (
              <Eye className="ml-auto h-4 w-4 text-foreground" />
            ) : (
              <EyeOff className="ml-auto h-4 w-4 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// One "Display" button gathering shadows, camera projection, colors, render
// mode, scene theme and edges.
function DisplayMenu() {
  const t = useT(messages)
  const cameraMode = useViewer((s) => s.cameraMode)
  const shading = useViewer((s) => s.shading)
  const textures = useViewer((s) => s.textures)
  const shadows = useViewer((s) => s.shadows)
  const sceneTheme = useViewer((s) => s.sceneTheme)
  const edges = useViewer((s) => s.edges)
  const activeShading = SHADING_OPTIONS.find((o) => o.id === shading) ?? SHADING_OPTIONS[0]
  const activeTheme = getSceneTheme(sceneTheme)
  const activeEdges = EDGE_OPTIONS.find((o) => o.id === edges) ?? EDGE_OPTIONS[0]
  const sceneThemeName = (theme: { id: string; name: string }) => {
    const key = SCENE_THEME_KEYS[theme.id]
    return key ? t(key) : theme.name
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ActionButton
          className="hover:bg-white/5 hover:text-foreground"
          label={t('controls.display')}
          size="icon"
          tooltipClassName="dark"
          tooltipSide="top"
          variant="ghost"
        >
          <SlidersHorizontal className="h-5 w-5" />
        </ActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="dark min-w-56" side="top">
        <CutHeightSlider />
        <DropdownMenuItem
          onSelect={(e) => keepOpen(e, () => useViewer.getState().setShadows(!shadows))}
        >
          <Contrast className="h-4 w-4" />
          <span>{t('controls.shadows')}</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {shadows ? t('controls.on') : t('controls.off')}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) =>
            keepOpen(e, () =>
              useViewer
                .getState()
                .setCameraMode(cameraMode === 'perspective' ? 'orthographic' : 'perspective'),
            )
          }
        >
          <Camera className="h-4 w-4" />
          <span>{t('controls.camera')}</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {cameraMode === 'perspective' ? t('controls.perspective') : t('controls.orthographic')}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => keepOpen(e, () => useViewer.getState().setTextures(!textures))}
        >
          {textures ? <Palette className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          <span>{t('controls.colors')}</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {textures ? t('controls.colored') : t('controls.monochrome')}
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <activeShading.icon className="h-4 w-4" />
            <span>{t('controls.render')}</span>
            <span className="ml-auto text-muted-foreground text-xs">
              {t(activeShading.nameKey)}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="dark min-w-56">
            {SHADING_OPTIONS.map((option) => {
              const OptionIcon = option.icon
              return (
                <DropdownMenuItem
                  key={option.id}
                  onSelect={() => useViewer.getState().setShading(option.id)}
                >
                  <OptionIcon className="h-4 w-4" />
                  <div className="flex flex-col">
                    <span className="text-foreground">{t(option.nameKey)}</span>
                    <span className="text-muted-foreground text-xs">{t(option.detailKey)}</span>
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
            <SwatchBook className="h-4 w-4" />
            <span>{t('controls.sceneTheme')}</span>
            <span className="ml-auto truncate text-muted-foreground text-xs">
              {sceneThemeName(activeTheme)}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="dark min-w-48">
            {SCENE_THEMES.map((theme) => {
              const swatches = (['wall', 'roof', 'floor', 'glazing'] as const).map(
                (role) => theme.clayTints?.[role] ?? CLAY_PALETTE[role],
              )
              return (
                <DropdownMenuItem
                  className="gap-2"
                  key={theme.id}
                  onSelect={() => useViewer.getState().setSceneTheme(theme.id)}
                >
                  <span
                    className="grid h-5 w-5 shrink-0 grid-cols-2 overflow-hidden rounded-sm border border-black/10"
                    style={{ backgroundColor: theme.background }}
                  >
                    {swatches.map((color, index) => (
                      <span key={`${theme.id}-${index}`} style={{ backgroundColor: color }} />
                    ))}
                  </span>
                  <span>{sceneThemeName(theme)}</span>
                  {sceneTheme === theme.id ? <Check className="ml-auto h-4 w-4" /> : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <PenLine className="h-4 w-4" />
            <span>{t('controls.edges')}</span>
            <span className="ml-auto text-muted-foreground text-xs">{t(activeEdges.nameKey)}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="dark min-w-56">
            {EDGE_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.id}
                onSelect={() => useViewer.getState().setEdges(option.id)}
              >
                <div className="flex flex-col">
                  <span className="text-foreground">{t(option.nameKey)}</span>
                  <span className="text-muted-foreground text-xs">{t(option.detailKey)}</span>
                </div>
                {edges === option.id ? <Check className="ml-auto h-4 w-4 text-foreground" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type ViewerControlsBarProps = {
  canShowScans?: boolean
  canShowGuides?: boolean
  /** A baked GLB is the active artifact: hide controls it can't honor (wall
   *  modes aren't baked into the GLB). */
  glbActive?: boolean
  /** In GLB mode, whether scans/guides were re-added from scene data — so the
   *  visibility control surfaces the matching toggle even though the artifact
   *  itself carries none. */
  glbHasScans?: boolean
  glbHasGuides?: boolean
  walkthroughActive?: boolean
  onWalkthroughToggle: () => void
  className?: string
}

export const ViewerControlsBar = ({
  canShowScans = true,
  canShowGuides = true,
  glbActive = false,
  glbHasScans = false,
  glbHasGuides = false,
  walkthroughActive = false,
  onWalkthroughToggle,
  className,
}: ViewerControlsBarProps) => {
  const t = useT(messages)
  const levelMode = useViewer((s) => s.levelMode)
  const wallMode = useViewer((s) => s.wallMode)
  const showRoofs = useViewer((s) => s.showRoofs)

  return (
    <div
      className={cn(
        'dark absolute bottom-4 left-1/2 z-20 -translate-x-1/2 text-foreground sm:bottom-6',
        className,
      )}
    >
      <TooltipProvider delayDuration={0}>
        <div className="corner-smooth pointer-events-auto flex h-12 max-w-[calc(100vw-1rem)] flex-row items-center justify-center gap-0.5 overflow-hidden rounded-2xl border border-border/40 bg-background/95 p-1 shadow-elevation-4 backdrop-blur-xl transition-colors duration-200 ease-out sm:h-14 sm:gap-1.5 sm:p-1.5">
          {((canShowScans && (!glbActive || glbHasScans)) ||
            (canShowGuides && (!glbActive || glbHasGuides))) && (
            <>
              <VisibilityMenu
                canShowGuides={canShowGuides && (!glbActive || glbHasGuides)}
                canShowScans={canShowScans && (!glbActive || glbHasScans)}
              />
              <div className="mx-1 h-5 w-px bg-border/40" />
            </>
          )}

          {/* Level mode */}
          <SegmentedControl
            aria-label={t('controls.levels')}
            className={SEGMENTS}
            mixed={levelMode === 'manual'}
            onChange={(mode) => useViewer.getState().setLevelMode(mode)}
            options={LEVEL_MODE_OPTIONS.map(({ value }) => {
              const Icon = levelModeIcons[value]
              return {
                value,
                label: (
                  <>
                    <Icon className="h-5 w-5" />
                    <span className="sr-only">{t(LEVEL_MODE_KEYS[value])}</span>
                  </>
                ),
              }
            })}
            radio
            value={levelMode}
          />

          {/* Wall mode — parametric only; baked GLB walls are fixed-height. */}
          {!glbActive && (
            <SegmentedControl
              aria-label={t('controls.walls')}
              className={SEGMENTS}
              onChange={(mode) => useViewer.getState().setWallMode(mode)}
              options={WALL_MODE_OPTIONS.map(({ value }) => ({
                value,
                label: (
                  <>
                    <img alt="" className="h-6 w-6 object-contain" src={wallModeIcons[value]} />
                    <span className="sr-only">{t(WALL_MODE_KEYS[value])}</span>
                  </>
                ),
              }))}
              radio
              value={wallMode}
            />
          )}

          <ActionButton
            aria-label={t('controls.roofs')}
            aria-pressed={showRoofs}
            className={showRoofs ? 'hover:bg-white/5' : 'bg-white/10'}
            label={t('controls.roofsState', {
              state: showRoofs ? t('controls.on') : t('controls.off'),
              key: VIEW_SHORTCUT_KEYS.roofs.toUpperCase(),
            })}
            onClick={() => useViewer.getState().setShowRoofs(!showRoofs)}
            size="icon"
            tooltipClassName="dark"
            tooltipSide="top"
            variant="ghost"
          >
            <House className="h-6 w-6" />
          </ActionButton>

          <div className="mx-1 h-5 w-px bg-border/40" />

          <DisplayMenu />

          <div className="mx-1 h-5 w-px bg-border/40" />

          {/* Walkthrough */}
          <ActionButton
            aria-label={t('controls.walkthrough')}
            aria-pressed={walkthroughActive}
            className={
              walkthroughActive
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'hover:bg-white/5 hover:text-emerald-400'
            }
            label={t('controls.walkthroughState', {
              state: walkthroughActive ? t('controls.on') : t('controls.off'),
            })}
            onClick={onWalkthroughToggle}
            size="icon"
            tooltipClassName="dark"
            tooltipSide="top"
            variant="ghost"
          >
            <Footprints className="h-6 w-6" />
          </ActionButton>

          <div className="mx-1 h-5 w-px bg-border/40" />

          {/* Follow Pascal */}
          <FollowPascalToggle className="hidden sm:inline-flex" tooltipClassName="dark" />

          {/* Camera actions */}
          <ActionButton
            className="group hidden hover:bg-white/5 sm:inline-flex"
            label={t('controls.orbitLeft')}
            onClick={() => emitter.emit('camera-controls:orbit-ccw')}
            size="icon"
            tooltipClassName="dark"
            tooltipSide="top"
            variant="ghost"
          >
            <img
              alt={t('controls.orbitLeft')}
              className="h-[28px] w-[28px] -scale-x-100 object-contain opacity-70 transition-opacity group-hover:opacity-100"
              src="/icons/rotate.webp"
            />
          </ActionButton>

          <ActionButton
            className="group hidden hover:bg-white/5 sm:inline-flex"
            label={t('controls.orbitRight')}
            onClick={() => emitter.emit('camera-controls:orbit-cw')}
            size="icon"
            tooltipClassName="dark"
            tooltipSide="top"
            variant="ghost"
          >
            <img
              alt={t('controls.orbitRight')}
              className="h-[28px] w-[28px] object-contain opacity-70 transition-opacity group-hover:opacity-100"
              src="/icons/rotate.webp"
            />
          </ActionButton>

          <ActionButton
            className="group hover:bg-white/5"
            label={t('controls.topView')}
            onClick={() => emitter.emit('camera-controls:top-view')}
            size="icon"
            tooltipClassName="dark"
            tooltipSide="top"
            variant="ghost"
          >
            <img
              alt={t('controls.topView')}
              className="h-[28px] w-[28px] object-contain opacity-70 transition-opacity group-hover:opacity-100"
              src="/icons/topview.webp"
            />
          </ActionButton>
        </div>
      </TooltipProvider>
    </div>
  )
}
