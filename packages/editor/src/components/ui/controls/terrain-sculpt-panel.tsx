'use client'

import {
  type AnyNodeId,
  RAISE_METRES_PER_STROKE,
  type SiteNode,
  type TerrainVerb,
  useScene,
} from '@pascal-app/core'
import { Mountain, Pipette } from 'lucide-react'
import { type MessageKey, useT } from '../../../i18n'
import { brushRadiusRange, flattenSite, resetSiteTerrain } from '../../../lib/terrain-sculpt'
import useEditor from '../../../store/use-editor'
import { Button } from '../primitives/button'
import { messages } from './messages'
import { SegmentedControl } from './segmented-control'
import { SliderControl } from './slider-control'

const VERB_OPTIONS: Array<{
  value: TerrainVerb
  iconSrc: string
  labelKey: MessageKey<typeof messages>
}> = [
  { value: 'raise', iconSrc: '/icons/terrain-raise.webp', labelKey: 'terrain.raise' },
  { value: 'lower', iconSrc: '/icons/terrain-lower.webp', labelKey: 'terrain.lower' },
  { value: 'flatten', iconSrc: '/icons/terrain-flatten.webp', labelKey: 'terrain.flatten' },
  { value: 'smooth', iconSrc: '/icons/terrain-smooth.webp', labelKey: 'terrain.smooth' },
]

const VERB_HINTS = {
  raise: 'terrain.raiseHint',
  lower: 'terrain.lowerHint',
  flatten: 'terrain.flattenHint',
  smooth: 'terrain.smoothHint',
} as const satisfies Record<TerrainVerb, MessageKey<typeof messages>>

/**
 * Sculpt controls for terrain mode — verb, brush, and the two lot-wide actions.
 *
 * A panel rather than a floating HUD because the brush settings are the sort of
 * thing a user adjusts between strokes and then leaves alone, and because
 * sculpting already owns the whole viewport pointer: putting controls over the
 * canvas would put them over the surface being sculpted.
 *
 * Embedders mount this wherever their sculpt controls belong (the community
 * editor puts it in the Build sidebar while sculpt mode is active), exactly like
 * `MaterialPaintPanel`.
 */
export function TerrainSculptPanel() {
  const t = useT(messages)
  const verb = useEditor((state) => state.terrainVerb)
  const setTerrainVerb = useEditor((state) => state.setTerrainVerb)
  const brush = useEditor((state) => state.terrainBrush)
  const setTerrainBrush = useEditor((state) => state.setTerrainBrush)
  const flattenTarget = useEditor((state) => state.terrainFlattenTarget)
  const setTerrainFlattenTarget = useEditor((state) => state.setTerrainFlattenTarget)
  const sampling = useEditor((state) => state.terrainSampling)
  const setTerrainSampling = useEditor((state) => state.setTerrainSampling)

  const nodes = useScene((state) => state.nodes)
  const rootNodeIds = useScene((state) => state.rootNodeIds)
  const siteId = rootNodeIds[0]
  const siteNode = siteId ? nodes[siteId as AnyNodeId] : undefined
  const site = siteNode?.type === 'site' ? (siteNode as SiteNode) : null
  const [minRadius, maxRadius] = brushRadiusRange(site)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <SegmentedControl
          className="h-14"
          onChange={(next) => setTerrainVerb(next)}
          options={VERB_OPTIONS.map(({ value, iconSrc, labelKey }) => ({
            value,
            label: (
              <span className="flex flex-col items-center gap-0.5">
                <img
                  alt=""
                  aria-hidden
                  className="size-7 object-contain"
                  draggable={false}
                  height={28}
                  src={iconSrc}
                  width={28}
                />
                <span className="text-[9px] leading-none">{t(labelKey)}</span>
              </span>
            ),
          }))}
          value={verb}
        />
        <p className="px-0.5 text-muted-foreground text-xs">{t(VERB_HINTS[verb], { metres: RAISE_METRES_PER_STROKE })}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        {/*
          Range from `brushRadiusRange`, shared with the `[`/`]` keys. The low end
          is not a preference: it tracks the field's sample spacing, and a brush
          under it lands between samples and paints nothing at all.
        */}
        <SliderControl
          label={t('terrain.size')}
          max={maxRadius}
          min={minRadius}
          onChange={(radius) => setTerrainBrush({ radius })}
          precision={1}
          step={0.5}
          unit="m"
          value={brush.radius}
        />
        <SliderControl
          label={t('terrain.strength')}
          max={1}
          min={0.05}
          onChange={(strength) => setTerrainBrush({ strength })}
          precision={2}
          step={0.05}
          value={brush.strength}
        />
        <SliderControl
          label={t('terrain.softness')}
          max={1}
          min={0}
          onChange={(falloff) => setTerrainBrush({ falloff })}
          precision={2}
          step={0.05}
          value={brush.falloff}
        />
        <SegmentedControl
          onChange={(shape) => setTerrainBrush({ shape })}
          options={[
            { value: 'round', label: t('terrain.round') },
            { value: 'square', label: t('terrain.square') },
          ]}
          value={brush.shape}
        />
      </div>

      {verb === 'flatten' && (
        <div className="flex flex-col gap-1.5 border-border/60 border-t pt-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <SliderControl
                label={t('terrain.target')}
                max={50}
                min={-50}
                onChange={setTerrainFlattenTarget}
                precision={2}
                step={0.1}
                unit="m"
                value={flattenTarget ?? 0}
              />
            </div>
            <Button
              aria-label={t('terrain.pickTarget')}
              aria-pressed={sampling}
              onClick={() => setTerrainSampling(!sampling)}
              size="icon-sm"
              type="button"
              variant={sampling ? 'default' : 'outline'}
            >
              <Pipette />
            </Button>
          </div>
          <p className="px-0.5 text-muted-foreground text-xs">
            {sampling
              ? t('terrain.sampling')
              : flattenTarget === null
                ? t('terrain.noTarget')
                : t('terrain.hasTarget')}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 border-border/60 border-t pt-3">
        <Button
          className="flex-1"
          disabled={!site}
          onClick={() => site && flattenSite(site, flattenTarget ?? 0)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Mountain />
          {t('terrain.levelLot')}
        </Button>
        <Button
          className="flex-1"
          disabled={!site?.terrain}
          onClick={() => site && resetSiteTerrain(site)}
          size="sm"
          type="button"
          variant="outline"
        >
          {t('terrain.clear')}
        </Button>
      </div>
    </div>
  )
}
