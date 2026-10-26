'use client'

import type {
  AnyNode,
  AnyNodeId,
  CabinetModuleNode as CabinetModuleNodeType,
  CabinetNode as CabinetNodeType,
  SceneApi,
} from '@pascal-app/core'
import {
  cascadeDirty,
  createSceneApi,
  resolveLevelId,
  runAsSingleSceneHistoryStep,
  useScene,
} from '@pascal-app/core'
import {
  ActionButton,
  type MessageKey,
  type MessageVars,
  PanelSection,
  PanelWrapper,
  SegmentedControl,
  SliderControl,
  ToggleControl,
  usePlacementNotice,
  useT,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Copy, Equal as EqualIcon, Plus, Trash } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { cabinetDisplayName } from './display-name'
import { finishKitchenRun } from './finish-operation'
import { planCabinetHostedEdit } from './hosted-resize'
import { messages } from './messages'
import {
  metadataForSelectedWidth,
  metadataWithPresetWidthDebt,
  presetNominalWidth,
  presetWidthDebt,
  recordedPresetNominalWidth,
} from './preset-width-debt'
import {
  CABINET_DIMENSION_PROFILES,
  type CabinetDimensionProfileId,
  cabinetDimensionProfileById,
  cabinetDimensionProfileId,
} from './profiles'
import { MAX_CABINET_WIDTH } from './resize-limits'
import {
  CABINET_REVEAL_GAPS,
  type CabinetRevealGapId,
  cabinetRevealGapById,
  cabinetRevealGapId,
} from './reveals'
import { cabinetWallFillerPlan } from './run-finishing'
import { runWallConstraints } from './run-layout'
import {
  addCabinetModuleSide,
  backAlignZ,
  bumpCabinetRunLayoutRevision,
  cabinetMetadataRecord,
  cabinetRunArrayPlan,
  cabinetRunWidthEqualizationPlan,
  duplicateCabinetModuleAlongRun,
  equalizeCabinetRunWidths,
  nestedCornerRunPositionOverrides,
  resolveCabinetType,
  runModuleBaseY,
  syncCornerRunsFromRunSources,
  syncCornerStyleGroupFromRun,
  wallChildOf,
} from './run-ops'
import {
  backAnchoredModuleZ,
  minCabinetCarcassHeightForStack,
  reflowCabinetRunModules,
  stackForCabinet,
} from './stack'
import {
  CABINET_WALL_HEIGHT_PRESETS,
  type CabinetWallHeightPresetId,
  cabinetWallHeightPresetById,
  cabinetWallHeightPresetId,
} from './wall-height-presets'

type RunMessageKey = MessageKey<typeof messages>

export type CabinetEditableNode = CabinetNodeType | CabinetModuleNodeType

const RUN_POSITION_PATCH_KEYS = new Set<keyof CabinetNodeType>(['showPlinth', 'plinthHeight'])
const RUN_MODULE_SYNC_PATCH_KEYS = new Set<keyof CabinetNodeType>([
  'frontStyle',
  'frontOverlay',
  'handleStyle',
  'handlePosition',
  'frontGap',
])
const RUN_DEPTH_PATCH_KEY = 'depth'
const MIN_TRIMMED_CORNER_PRESET_WIDTH = 0.05

function selectCabinetRunPlanningNodes(
  nodes: Readonly<Record<AnyNodeId, AnyNode>>,
  runId: AnyNodeId,
): AnyNode[] {
  const run = nodes[runId]
  if (run?.type !== 'cabinet') return []

  const relevantIds = new Set<AnyNodeId>()
  const addWithAncestors = (node: AnyNode | undefined) => {
    let current = node
    const visited = new Set<AnyNodeId>()
    while (current && !visited.has(current.id as AnyNodeId)) {
      const currentId = current.id as AnyNodeId
      visited.add(currentId)
      relevantIds.add(currentId)
      current = current.parentId ? nodes[current.parentId as AnyNodeId] : undefined
    }
  }

  addWithAncestors(run)
  for (const childId of run.children ?? []) addWithAncestors(nodes[childId as AnyNodeId])

  const levelId = resolveLevelId(run, nodes as Record<string, AnyNode>)
  for (const candidate of Object.values(nodes)) {
    if (
      candidate?.type === 'wall' &&
      resolveLevelId(candidate, nodes as Record<string, AnyNode>) === levelId
    ) {
      addWithAncestors(candidate)
    }
  }

  return [...relevantIds].flatMap((id) => {
    const node = nodes[id]
    return node ? [node] : []
  })
}

const FRONT_STYLE_OPTIONS = [
  { value: 'slab', labelKey: 'slab' },
  { value: 'shaker', labelKey: 'shaker' },
  { value: 'raised-arch', labelKey: 'raisedArch' },
] as const satisfies readonly { value: string; labelKey: RunMessageKey }[]

const FRONT_OVERLAY_OPTIONS = [
  { value: 'full', labelKey: 'overlay' },
  { value: 'inset', labelKey: 'inset' },
] as const satisfies readonly { value: string; labelKey: RunMessageKey }[]

const HANDLE_STYLE_OPTIONS = [
  { value: 'bar', labelKey: 'bar' },
  { value: 'knob', labelKey: 'knob' },
  { value: 'cutout', labelKey: 'cutout' },
  { value: 'hole', labelKey: 'hole' },
  { value: 'none', labelKey: 'none' },
] as const satisfies readonly { value: string; labelKey: RunMessageKey }[]

const HANDLE_POSITION_OPTIONS = [
  { value: 'auto', labelKey: 'auto' },
  { value: 'top', labelKey: 'top' },
  { value: 'center', labelKey: 'center' },
] as const satisfies readonly { value: string; labelKey: RunMessageKey }[]

function moduleSummary(
  module: CabinetModuleNodeType,
  t: (key: RunMessageKey, vars?: MessageVars) => string,
) {
  if ((module.cabinetType ?? 'base') === 'tall') return t('tallCabinetSummary')
  const stack = stackForCabinet(module)
  if (stack.length === 0) return t('empty')
  if (stack.length === 1) return t(`compartment.${stack[0]!.type}`)
  return t('compartmentCount', { count: stack.length })
}

export function bumpRunLayoutRevisionViaStore(
  scene: ReturnType<typeof useScene.getState>,
  run: CabinetNodeType,
) {
  bumpCabinetRunLayoutRevision(createSceneApi(useScene), run)
  scene.markDirty(run.id as AnyNodeId)
}

function canDonatePresetWidth(module: CabinetModuleNodeType, run: CabinetNodeType): boolean {
  return (
    resolveCabinetType(module, run) === 'base' &&
    stackForCabinet(module).every(
      (compartment) =>
        compartment.type === 'door' ||
        compartment.type === 'drawer' ||
        compartment.type === 'shelf',
    )
  )
}

function hasLinkedCornerRun(module: CabinetModuleNodeType): boolean {
  const value = cabinetMetadataRecord(module.metadata).cabinetCornerSourceLink
  return (
    Boolean(value && typeof value === 'object' && !Array.isArray(value)) &&
    Array.isArray((value as { linkedRunIds?: unknown }).linkedRunIds) &&
    (value as { linkedRunIds: unknown[] }).linkedRunIds.length > 0
  )
}

export function planCabinetPresetReflow({
  modules,
  parentRun,
  patch,
  scene,
  selected,
}: {
  modules: CabinetModuleNodeType[]
  parentRun: CabinetNodeType
  patch: Partial<CabinetModuleNodeType>
  scene: ReturnType<typeof useScene.getState>
  selected: CabinetModuleNodeType
}) {
  const wallConstraints = runWallConstraints(
    parentRun,
    modules,
    scene.nodes as Record<AnyNodeId, AnyNode>,
    { widthGrowth: Math.max(0, (patch.width ?? selected.width) - selected.width) },
  )
  const sortedModules = [...modules].sort((a, b) => a.position[0] - b.position[0])
  const leftCornerAnchored = Boolean(sortedModules[0] && hasLinkedCornerRun(sortedModules[0]))
  const rightCornerAnchored = Boolean(
    sortedModules.at(-1) && hasLinkedCornerRun(sortedModules.at(-1)!),
  )
  const effectiveWallConstraints = {
    left:
      leftCornerAnchored && wallConstraints.left.constrained
        ? { constrained: true, slack: 0 }
        : wallConstraints.left,
    right:
      rightCornerAnchored && wallConstraints.right.constrained
        ? { constrained: true, slack: 0 }
        : wallConstraints.right,
  }
  const eligibleDonorIds = new Set(
    modules.filter((module) => canDonatePresetWidth(module, parentRun)).map((module) => module.id),
  )
  const preserveExtent =
    effectiveWallConstraints.left.constrained && effectiveWallConstraints.right.constrained
  const selectedWillShrink = (patch.width ?? selected.width) < selected.width - 1e-4
  const nominalWidthById = new Map(
    modules.map((module) => [module.id, recordedPresetNominalWidth(module)]),
  )
  const maximumWidthById = new Map(modules.map((module) => [module.id, presetNominalWidth(module)]))
  const originalDonorIds = new Set(
    modules
      .filter(
        (module) => eligibleDonorIds.has(module.id) && presetWidthDebt(module, selected.id) > 1e-4,
      )
      .map((module) => module.id),
  )
  if (preserveExtent && selectedWillShrink) {
    const sorted = [...modules].sort((a, b) => a.position[0] - b.position[0])
    const selectedIndex = sorted.findIndex((module) => module.id === selected.id)
    const fallbackCandidates = sorted
      .map((module, index) => ({ index, module }))
      .filter(({ module }) => module.id !== selected.id && eligibleDonorIds.has(module.id))
      .sort((a, b) => {
        const distance = Math.abs(a.index - selectedIndex) - Math.abs(b.index - selectedIndex)
        return distance !== 0 ? distance : b.index - a.index
      })
    const freedWidth = selected.width - (patch.width ?? selected.width)
    const ordinaryCapacity = fallbackCandidates.reduce((total, { module }) => {
      const maximumWidth = maximumWidthById.get(module.id) ?? MAX_CABINET_WIDTH
      return total + Math.max(0, maximumWidth - module.width)
    }, 0)
    let extraCapacity = Math.max(0, freedWidth - ordinaryCapacity)
    const extensionCandidates = [...fallbackCandidates].sort((a, b) => {
      const donorOrder =
        Number(originalDonorIds.has(a.module.id)) - Number(originalDonorIds.has(b.module.id))
      return donorOrder !== 0 ? donorOrder : 0
    })
    for (const { module } of extensionCandidates) {
      if (extraCapacity <= 1e-4) break
      const nominalWidth = maximumWidthById.get(module.id) ?? MAX_CABINET_WIDTH
      const addedCapacity = Math.min(extraCapacity, MAX_CABINET_WIDTH - nominalWidth)
      maximumWidthById.set(module.id, nominalWidth + addedCapacity)
      extraCapacity -= addedCapacity
    }
  }
  const reflowed = reflowCabinetRunModules(modules, selected.id, patch.width ?? selected.width, {
    wallConstraints: effectiveWallConstraints,
    eligibleDonorIds,
    minimumWidthById: new Map(
      modules
        .filter(hasLinkedCornerRun)
        .map((module) => [module.id, MIN_TRIMMED_CORNER_PRESET_WIDTH]),
    ),
    maximumWidth: MAX_CABINET_WIDTH,
    maximumWidthById,
    nominalWidthById,
    restorableWidthById: new Map(
      modules.map((module) => [module.id, presetWidthDebt(module, selected.id)]),
    ),
  })
  return reflowed
}

export function reflowRunModules({
  modules,
  parentRun,
  patch,
  scene,
  selected,
}: {
  modules: CabinetModuleNodeType[]
  parentRun: CabinetNodeType
  patch: Partial<CabinetModuleNodeType>
  scene: ReturnType<typeof useScene.getState>
  selected: CabinetModuleNodeType
}): boolean {
  const reflowed = planCabinetPresetReflow({ modules, parentRun, patch, scene, selected })
  if (reflowed.length === 0) return false

  const reflowById = new Map(reflowed.map((entry) => [entry.id, entry]))
  for (const module of [...modules].sort((a, b) => a.position[0] - b.position[0])) {
    const reflow = reflowById.get(module.id)
    if (!reflow) continue
    const isSelected = module.id === selected.id
    const nextPatch: Partial<CabinetModuleNodeType> = isSelected
      ? { ...patch, width: reflow.width }
      : { width: reflow.width }
    const widthDelta = reflow.width - module.width
    if (isSelected && Math.abs(widthDelta) > 1e-4) {
      nextPatch.metadata = metadataForSelectedWidth(module, reflow.width, nextPatch.metadata)
    }
    if (!isSelected && Math.abs(widthDelta) > 1e-4) {
      nextPatch.metadata = metadataWithPresetWidthDebt(module, selected.id, widthDelta)
    }
    const nextPosition: CabinetModuleNodeType['position'] = [
      reflow.position[0],
      isSelected && patch.position ? patch.position[1] : reflow.position[1],
      isSelected && typeof patch.depth === 'number'
        ? backAnchoredModuleZ(module.position[2], module.depth, patch.depth)
        : reflow.position[2],
    ]

    if (isSelected) {
      const cabinetType = patch.cabinetType ?? module.cabinetType
      const convertsToBase =
        cabinetType === 'base' && resolveCabinetType(module, parentRun) !== 'base'
      if (convertsToBase) {
        nextPatch.depth = patch.depth ?? parentRun.depth
        nextPatch.carcassHeight = patch.carcassHeight ?? parentRun.carcassHeight
        nextPatch.plinthHeight = patch.plinthHeight ?? parentRun.plinthHeight
        nextPatch.toeKickDepth = patch.toeKickDepth ?? parentRun.toeKickDepth
        nextPatch.countertopThickness = patch.countertopThickness ?? parentRun.countertopThickness
        nextPatch.countertopOverhang = patch.countertopOverhang ?? parentRun.countertopOverhang
      }
    }

    nextPatch.position = nextPosition
    const nestedCornerOverrides = nestedCornerRunPositionOverrides(
      module,
      nextPosition,
      scene.nodes as Readonly<Partial<Record<AnyNodeId, AnyNode>>>,
    )
    scene.updateNode(module.id as AnyNodeId, nextPatch)
    for (const [id, override] of nestedCornerOverrides) {
      scene.updateNode(id, override)
    }

    const wallChild = wallChildOf(
      module,
      scene.nodes as Record<string, CabinetEditableNode | undefined>,
    )
    if (wallChild) {
      scene.updateNode(wallChild.id as AnyNodeId, {
        position: [
          0,
          wallChild.position[1],
          backAlignZ(nextPatch.depth ?? module.depth, wallChild.depth),
        ],
        width: reflow.width,
      })
      scene.markDirty(module.id as AnyNodeId)
    }
  }

  syncCornerRunsFromRunSources({
    baseLayout: 'width-only',
    previousModules: modules,
    run: (useScene.getState().nodes[parentRun.id] as CabinetNodeType | undefined) ?? parentRun,
    sceneApi: createSceneApi(useScene),
  })
  bumpRunLayoutRevisionViaStore(scene, parentRun)
  return true
}

export function updateCabinetRun(args: {
  modules: CabinetModuleNodeType[]
  node: CabinetNodeType
  patch: Partial<CabinetNodeType>
}) {
  const sceneApi = createSceneApi(useScene)
  const updates = planCabinetHostedEdit(sceneApi, (staged) => writeCabinetRun(args, staged))
  if (!updates) return
  useScene.getState().updateNodes(updates.map(([id, data]) => ({ id, data })))
  for (const id of cascadeDirty(args.node.id, { scene: sceneApi }))
    useScene.getState().markDirty(id)
}

function writeCabinetRun(
  {
    modules,
    node,
    patch,
  }: {
    modules: CabinetModuleNodeType[]
    node: CabinetNodeType
    patch: Partial<CabinetNodeType>
  },
  sceneApi: SceneApi,
) {
  const nodes = sceneApi.nodes()
  const nextPatch = { ...patch }
  if (typeof nextPatch.carcassHeight === 'number') {
    const minModuleHeight = Math.max(
      0.4,
      ...modules.map((module) => minCabinetCarcassHeightForStack(module)),
    )
    nextPatch.carcassHeight = Math.max(nextPatch.carcassHeight, minModuleHeight)
  }
  const nextNode = { ...node, ...nextPatch }
  sceneApi.update(node.id, nextPatch)

  const shouldSyncDepth = RUN_DEPTH_PATCH_KEY in nextPatch
  const shouldSyncHeight = 'carcassHeight' in nextPatch
  const shouldSyncPosition = Object.keys(nextPatch).some((key) =>
    RUN_POSITION_PATCH_KEYS.has(key as keyof CabinetNodeType),
  )
  const shouldSyncModules = Object.keys(nextPatch).some((key) =>
    RUN_MODULE_SYNC_PATCH_KEYS.has(key as keyof CabinetNodeType),
  )
  if (!shouldSyncDepth && !shouldSyncHeight && !shouldSyncPosition && !shouldSyncModules) return

  const stylePatch: Partial<CabinetNodeType> = {}
  if ('frontStyle' in nextPatch) stylePatch.frontStyle = nextNode.frontStyle
  if ('frontOverlay' in nextPatch) stylePatch.frontOverlay = nextNode.frontOverlay
  if ('handleStyle' in nextPatch) stylePatch.handleStyle = nextNode.handleStyle
  if ('handlePosition' in nextPatch) stylePatch.handlePosition = nextNode.handlePosition
  if ('frontGap' in nextPatch) stylePatch.frontGap = nextNode.frontGap

  for (const module of modules) {
    const modulePatch: Partial<CabinetModuleNodeType> = {}
    if (shouldSyncDepth) {
      modulePatch.depth = nextNode.depth
    }
    if (shouldSyncHeight) {
      modulePatch.carcassHeight = Math.max(
        nextNode.carcassHeight,
        minCabinetCarcassHeightForStack(module),
      )
    }
    if (shouldSyncPosition) {
      modulePatch.position = [module.position[0], runModuleBaseY(nextNode), module.position[2]]
    }
    if (shouldSyncModules) {
      if ('frontStyle' in nextPatch) modulePatch.frontStyle = nextNode.frontStyle
      if ('frontOverlay' in nextPatch) modulePatch.frontOverlay = nextNode.frontOverlay
      if ('handleStyle' in nextPatch) modulePatch.handleStyle = nextNode.handleStyle
      if ('handlePosition' in nextPatch) modulePatch.handlePosition = nextNode.handlePosition
      if ('frontGap' in nextPatch) modulePatch.frontGap = nextNode.frontGap
    }
    sceneApi.update(module.id, modulePatch)

    if (shouldSyncModules) {
      const wallChild = wallChildOf(
        module,
        nodes as Record<string, CabinetEditableNode | undefined>,
      )
      if (wallChild) {
        sceneApi.update(wallChild.id, {
          frontStyle: nextNode.frontStyle,
          frontOverlay: nextNode.frontOverlay,
          handleStyle: nextNode.handleStyle,
          handlePosition: nextNode.handlePosition,
          ...('frontGap' in nextPatch ? { frontGap: nextNode.frontGap } : {}),
        })
      }
    }
  }

  if (shouldSyncModules) {
    syncCornerStyleGroupFromRun({
      run: nextNode,
      patch: stylePatch,
      sceneApi,
    })
  } else {
    syncCornerRunsFromRunSources({ run: nextNode, sceneApi })
  }
}

export function CabinetRunPanel({
  node,
  modules,
  onClose,
}: {
  node: CabinetNodeType
  modules: CabinetModuleNodeType[]
  onClose: () => void
}) {
  const t = useT(messages)
  const setSelection = useViewer((s) => s.setSelection)
  const planningNodeList = useScene(
    useShallow((state) =>
      selectCabinetRunPlanningNodes(
        state.nodes as Record<AnyNodeId, AnyNode>,
        node.id as AnyNodeId,
      ),
    ),
  )
  const planningNodes = useMemo(
    () =>
      Object.fromEntries(planningNodeList.map((planningNode) => [planningNode.id, planningNode])),
    [planningNodeList],
  ) as Record<AnyNodeId, AnyNode>
  const planningNode = (planningNodes[node.id as AnyNodeId] as CabinetNodeType | undefined) ?? node
  const sortedModules = useMemo(
    () => [...modules].sort((a, b) => a.position[0] - b.position[0]),
    [modules],
  )
  const [arraySourceId, setArraySourceId] = useState<AnyNodeId | null>(null)
  const [arrayCopyCount, setArrayCopyCount] = useState(2)
  const [arraySpacing, setArraySpacing] = useState(0)
  const [arrayDirection, setArrayDirection] = useState<'left' | 'right'>('right')
  const widthEqualization = useMemo(
    () => cabinetRunWidthEqualizationPlan(planningNode, planningNodes),
    [planningNode, planningNodes],
  )
  const arraySource = useMemo(
    () =>
      sortedModules.find(
        (module) => module.id === arraySourceId && module.moduleKind === 'standard',
      ) ?? sortedModules.find((module) => module.moduleKind === 'standard'),
    [arraySourceId, sortedModules],
  )
  const arrayPlan = useMemo(
    () =>
      cabinetRunArrayPlan(planningNode, planningNodes, {
        copyCount: arrayCopyCount,
        direction: arrayDirection,
        sourceModuleId: arraySource?.id ?? null,
        spacing: arraySpacing,
      }),
    [arrayCopyCount, arrayDirection, arraySource?.id, arraySpacing, planningNode, planningNodes],
  )

  const placementNotice = usePlacementNotice(node.id)
  const [finishMessage, setFinishMessage] = useState<string | null>(null)
  const fillerPlan = cabinetWallFillerPlan(planningNode, sortedModules, planningNodes)

  const finishRun = (action: 'align' | 'fill') => {
    setFinishMessage(null)
    try {
      const outcome = finishKitchenRun(
        useScene.getState().nodes,
        { runId: node.id, action },
        { activeLevelId: null },
      )
      if (outcome.changes)
        runAsSingleSceneHistoryStep(useScene, () =>
          useScene
            .getState()
            .applyNodeChanges(
              outcome.changes as Parameters<
                ReturnType<typeof useScene.getState>['applyNodeChanges']
              >[0],
            ),
        )
    } catch (error) {
      setFinishMessage(error instanceof Error ? error.message : t('unableToFinishThisKitchenRun'))
    }
  }

  const updateRun = useCallback(
    (patch: Partial<CabinetNodeType>) => updateCabinetRun({ modules, node, patch }),
    [modules, node],
  )

  const addModule = useCallback(
    (side: 'left' | 'right') => {
      const id = addCabinetModuleSide({
        anchorModule: null,
        run: node,
        sceneApi: createSceneApi(useScene),
        side,
      })
      if (id) setSelection({ selectedIds: [id] })
    },
    [node, setSelection],
  )

  const equalizeWidths = useCallback(() => {
    equalizeCabinetRunWidths({ run: node, sceneApi: createSceneApi(useScene) })
  }, [node])

  const equalizeWidthsTitle = !widthEqualization.ok
    ? widthEqualization.reason === 'not-enough-modules'
      ? t('equalizeNeedTwo')
      : t('equalizeNoRoom')
    : widthEqualization.changed
      ? t('equalizeAll')
      : t('equalizeAlready')

  const duplicateAlongRun = useCallback(() => {
    if (!arraySource) return
    const copiedIds = duplicateCabinetModuleAlongRun({
      copyCount: arrayCopyCount,
      direction: arrayDirection,
      run: node,
      sceneApi: createSceneApi(useScene),
      sourceModuleId: arraySource.id as AnyNodeId,
      spacing: arraySpacing,
    })
    if (copiedIds?.length) setSelection({ selectedIds: [node.id as AnyNodeId] })
  }, [arrayCopyCount, arrayDirection, arraySpacing, arraySource, node, setSelection])

  const duplicateAlongRunTitle = !arrayPlan.ok
    ? arrayPlan.reason === 'no-source'
      ? t('arrayNoSource')
      : arrayPlan.reason === 'invalid-options'
        ? t('arrayInvalid')
        : t('arrayNoRoom')
    : t('createCopies', {
        count: arrayCopyCount,
        name: arraySource?.name ? cabinetDisplayName(arraySource.name) : t('module'),
      })

  const dimensionProfile = cabinetDimensionProfileId(node)
  const wallHeightPreset = cabinetWallHeightPresetId(node)
  const applyWallHeightPreset = useCallback(
    (presetId: CabinetWallHeightPresetId) => {
      updateRun({ carcassHeight: cabinetWallHeightPresetById(presetId).value })
    },
    [updateRun],
  )
  const applyDimensionProfile = useCallback(
    (profileId: CabinetDimensionProfileId) => {
      const profile = cabinetDimensionProfileById(profileId)
      updateRun({
        carcassHeight: profile.carcassHeight,
        countertopThickness: profile.countertopThickness,
        depth: profile.depth,
        plinthHeight: profile.plinthHeight,
      })
    },
    [updateRun],
  )

  const deleteModule = useCallback(
    (module: CabinetModuleNodeType) => {
      useScene.getState().deleteNode(module.id as AnyNodeId)
      // Deleting the last module cascades the empty run away too — only
      // keep it selected/dirty if it survived.
      if (useScene.getState().nodes[node.id as AnyNodeId]) {
        useScene.getState().markDirty(node.id as AnyNodeId)
        setSelection({ selectedIds: [node.id] })
      } else {
        setSelection({ selectedIds: [] })
      }
    },
    [node.id, setSelection],
  )

  return (
    <PanelWrapper
      icon="/icons/item.webp"
      onClose={onClose}
      title={cabinetDisplayName(node.name || 'Kitchen run')}
      width={320}
    >
      {placementNotice && (
        <p role="status" className="px-3 py-2 text-xs text-amber-600">
          {placementNotice.line}
        </p>
      )}
      <PanelSection title={t('finishAlign')}>
        <div className="flex flex-col gap-2 px-1 pb-2">
          <ActionButton label={t('alignCabinetsHandles')} onClick={() => finishRun('align')} />
          {finishMessage && (
            <p role="status" className="text-xs text-amber-600">
              {finishMessage}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t('matchRunNote')}</p>
          <ToggleControl
            label={t('finishedExposedEnds')}
            checked={node.withFinishedEnds}
            onChange={(checked) => updateRun({ withFinishedEnds: checked })}
          />
          <ActionButton
            label={t('fitWallFillers')}
            disabled={fillerPlan.length === 0}
            onClick={() => finishRun('fill')}
          />
          <p className="text-xs text-muted-foreground">
            {fillerPlan.length
              ? fillerPlan
                  .map(({ side, width }) =>
                    t('sideWidth', {
                      side: t(side === 'left' ? 'left' : 'right'),
                      mm: Math.round(width * 1000),
                    }),
                  )
                  .join(' · ')
              : t('fits50150MmGapsAtRunEndsBesidePerpendicu')}
          </p>
        </div>
      </PanelSection>
      <PanelSection title={t('modules')}>
        <div className="flex flex-col gap-2 px-1 pb-2">
          {sortedModules.map((module, index) => (
            <div
              className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-black/3 dark:bg-[#252527] px-2 py-2"
              key={module.id}
            >
              <button
                className="min-h-8 min-w-0 flex-1 py-1 text-left"
                onClick={() => setSelection({ selectedIds: [module.id] })}
                type="button"
              >
                <div className="truncate text-xs font-medium text-foreground">
                  {module.name ? cabinetDisplayName(module.name) : t('moduleN', { n: index + 1 })}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {moduleSummary(module, t)}
                </div>
              </button>
              <button
                aria-label={t('useAsArraySource', {
                  name: module.name
                    ? cabinetDisplayName(module.name)
                    : t('moduleN', { n: index + 1 }),
                })}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/8 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                disabled={module.moduleKind === 'corner-filler'}
                onClick={() => setArraySourceId(module.id as AnyNodeId)}
                title={
                  module.moduleKind === 'corner-filler'
                    ? t('cornerFillersCannotBeUsedAsArraySources')
                    : t('useThisModuleAsTheArraySource')
                }
                type="button"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-500/20 bg-red-500/8 text-red-700 dark:text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-700 dark:hover:text-red-200 disabled:opacity-30"
                disabled={modules.length <= 1}
                onClick={() => deleteModule(module)}
                type="button"
              >
                <Trash className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="px-1 pb-1">
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              icon={<Plus className="h-4 w-4" />}
              label={t('addLeft')}
              onClick={() => addModule('left')}
            />
            <ActionButton
              icon={<Plus className="h-4 w-4" />}
              label={t('addRight')}
              onClick={() => addModule('right')}
            />
          </div>
          <ActionButton
            className="mt-2 w-full"
            disabled={!widthEqualization.ok || !widthEqualization.changed}
            icon={<EqualIcon className="h-4 w-4" />}
            label={t('equalizeWidths')}
            onClick={equalizeWidths}
            title={equalizeWidthsTitle}
          />
          <p className="px-1 pt-1 text-[10px] leading-4 text-muted-foreground">
            {t('balancesStandardBaseCabinetsWhileKeeping')}
          </p>
        </div>
      </PanelSection>

      <PanelSection title={t('duplicateAlongRun')}>
        <div className="space-y-2 px-1 pb-2">
          <div className="rounded-lg border border-border/40 bg-black/3 dark:bg-[#252527] px-2 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('sourceModule')}
            </div>
            <div className="truncate pt-1 text-xs font-medium text-foreground">
              {arraySource?.name
                ? cabinetDisplayName(arraySource.name)
                : arraySource
                  ? moduleSummary(arraySource, t)
                  : t('noEligibleModule')}
            </div>
          </div>
          <SliderControl
            label={t('copies')}
            max={20}
            min={1}
            onChange={(value) => setArrayCopyCount(Math.round(value))}
            precision={0}
            step={1}
            value={arrayCopyCount}
          />
          <SliderControl
            label={t('spacing')}
            max={2}
            min={0}
            onChange={setArraySpacing}
            precision={2}
            step={0.01}
            unit="m"
            value={arraySpacing}
          />
          <div>
            <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('direction')}
            </div>
            <SegmentedControl
              onChange={(value) => setArrayDirection(value as 'left' | 'right')}
              options={[
                { value: 'left', label: t('left') },
                { value: 'right', label: t('right') },
              ]}
              value={arrayDirection}
            />
          </div>
          <ActionButton
            className="w-full"
            disabled={!arrayPlan.ok}
            icon={<Copy className="h-4 w-4" />}
            label={t('createArray')}
            onClick={duplicateAlongRun}
            title={duplicateAlongRunTitle}
          />
          <p className="px-1 pt-1 text-[10px] leading-4 text-muted-foreground">{t('arrayNote')}</p>
        </div>
      </PanelSection>

      <PanelSection title={t('sharedPlinthCountertop')}>
        <div className="space-y-2 px-1 pb-2">
          {node.runTier === 'base' && (
            <div>
              <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('standardDimensions')}
              </div>
              <SegmentedControl
                mixed={dimensionProfile === 'custom'}
                onChange={(value) => applyDimensionProfile(value as CabinetDimensionProfileId)}
                options={CABINET_DIMENSION_PROFILES.map((profile) => ({
                  label: t(`profile.${profile.id}`),
                  value: profile.id,
                }))}
                value={dimensionProfile === 'us-base' ? 'us-base' : 'metric-base'}
              />
              <p className="px-1 pt-1 text-[10px] leading-4 text-muted-foreground">
                {t('appliesDepthCarcassPlinthAndCountertopTh')}
              </p>
            </div>
          )}
          {node.runTier === 'wall' && (
            <div>
              <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('heightPreset')}
              </div>
              <SegmentedControl
                mixed={wallHeightPreset === 'custom'}
                onChange={(value) => applyWallHeightPreset(value as CabinetWallHeightPresetId)}
                options={CABINET_WALL_HEIGHT_PRESETS.map((preset) => ({
                  label: (
                    <span className="flex flex-col items-center leading-3">
                      <span>{preset.label}</span>
                      <span className="text-[9px] text-muted-foreground">{preset.metricLabel}</span>
                    </span>
                  ),
                  value: preset.id,
                }))}
                value={wallHeightPreset === 'custom' ? '18' : wallHeightPreset}
              />
              <p className="px-1 pt-1 text-[10px] leading-4 text-muted-foreground">
                {t('commonWallCabinetHeightsUseTheSliderBelo')}
              </p>
            </div>
          )}
          <SliderControl
            label={t('depth')}
            max={1.2}
            min={0.3}
            onChange={(value) => updateRun({ depth: value })}
            precision={2}
            step={0.01}
            unit="m"
            value={node.depth}
          />
          <SliderControl
            label={t('carcassHeight')}
            max={node.runTier === 'tall' ? 2.4 : 1.4}
            min={Math.max(0.4, ...modules.map((module) => minCabinetCarcassHeightForStack(module)))}
            onChange={(value) => updateRun({ carcassHeight: value })}
            precision={2}
            step={0.01}
            unit="m"
            value={node.carcassHeight}
          />
          <ToggleControl
            checked={node.showPlinth}
            label={t('showPlinth')}
            onChange={(checked) => updateRun({ showPlinth: checked })}
          />
          {node.showPlinth && (
            <SliderControl
              label={t('plinthHeight')}
              max={0.3}
              min={0.02}
              onChange={(value) => updateRun({ plinthHeight: value })}
              precision={2}
              step={0.01}
              unit="m"
              value={node.plinthHeight}
            />
          )}
          <ToggleControl
            checked={node.withCountertop}
            label={t('showCountertop')}
            onChange={(checked) => updateRun({ withCountertop: checked })}
          />
          {node.withCountertop && (
            <>
              <SliderControl
                label={t('countertopHeight')}
                max={0.08}
                min={0.005}
                onChange={(value) => updateRun({ countertopThickness: value })}
                precision={3}
                step={0.005}
                unit="m"
                value={node.countertopThickness}
              />
              <SliderControl
                label={t('countertopDepth')}
                max={0.12}
                min={0}
                onChange={(value) => updateRun({ countertopOverhang: value })}
                precision={2}
                step={0.005}
                unit="m"
                value={node.countertopOverhang}
              />
            </>
          )}
        </div>
      </PanelSection>

      <PanelSection title={t('islandBar')}>
        <div className="space-y-2 px-1 pb-2">
          {node.withCountertop && node.barLedge?.edge !== 'back' && (
            <SliderControl
              label={t('seatingOverhang')}
              max={0.45}
              min={0}
              onChange={(value) => updateRun({ countertopBackOverhang: value })}
              precision={2}
              step={0.05}
              unit="m"
              value={node.countertopBackOverhang}
            />
          )}
          <ToggleControl
            checked={node.withFinishedBack}
            label={t('finishedBack')}
            onChange={(checked) => updateRun({ withFinishedBack: checked })}
          />

          {node.withCountertop && (
            <ToggleControl
              checked={node.withWaterfall}
              label={t('waterfallEnds')}
              onChange={(checked) => updateRun({ withWaterfall: checked })}
            />
          )}
          <ToggleControl
            checked={Boolean(node.barLedge)}
            label={t('barCounter')}
            onChange={(checked) =>
              updateRun({
                barLedge: checked ? { edge: 'back', height: 1.06, depth: 0.35 } : undefined,
              })
            }
          />
          {node.barLedge && (
            <>
              <SegmentedControl
                onChange={(value) =>
                  updateRun({
                    barLedge: { ...node.barLedge!, edge: value as 'back' | 'left' | 'right' },
                  })
                }
                options={[
                  { value: 'back', label: t('back') },
                  { value: 'left', label: t('left') },
                  { value: 'right', label: t('right') },
                ]}
                value={node.barLedge.edge}
              />
              <SliderControl
                label={t('barHeight')}
                max={1.3}
                min={0.9}
                onChange={(value) => updateRun({ barLedge: { ...node.barLedge!, height: value } })}
                precision={2}
                step={0.01}
                unit="m"
                value={node.barLedge.height}
              />
              <SliderControl
                label={t('barDepth')}
                max={0.5}
                min={0.15}
                onChange={(value) => updateRun({ barLedge: { ...node.barLedge!, depth: value } })}
                precision={2}
                step={0.01}
                unit="m"
                value={node.barLedge.depth}
              />
            </>
          )}
        </div>
      </PanelSection>

      <PanelSection title={t('fronts')}>
        <div className="space-y-2 px-1 pb-2">
          <div>
            <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('style')}
            </div>
            <SegmentedControl
              onChange={(value) =>
                updateRun({ frontStyle: value as CabinetNodeType['frontStyle'] })
              }
              options={FRONT_STYLE_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
              value={node.frontStyle ?? 'slab'}
            />
          </div>
          <div>
            <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('mounting')}
            </div>
            <SegmentedControl
              onChange={(value) =>
                updateRun({ frontOverlay: value as CabinetNodeType['frontOverlay'] })
              }
              options={FRONT_OVERLAY_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
              value={node.frontOverlay ?? 'full'}
            />
          </div>
          <div>
            <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('revealGap')}
            </div>
            <SegmentedControl
              mixed={cabinetRevealGapId(node.frontGap) === 'custom'}
              onChange={(value) =>
                updateRun({
                  frontGap: cabinetRevealGapById(value as CabinetRevealGapId).value,
                })
              }
              options={CABINET_REVEAL_GAPS.map((gap) => ({
                value: gap.id,
                label: gap.label,
              }))}
              value={
                cabinetRevealGapId(node.frontGap) === 'custom'
                  ? '3'
                  : cabinetRevealGapId(node.frontGap)
              }
            />
          </div>
        </div>
      </PanelSection>

      <PanelSection title={t('handles')}>
        <div className="space-y-2 px-1 pb-2">
          <div>
            <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('style')}
            </div>
            <SegmentedControl
              onChange={(value) =>
                updateRun({ handleStyle: value as CabinetNodeType['handleStyle'] })
              }
              options={HANDLE_STYLE_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
              value={node.handleStyle}
            />
          </div>
          {(node.handleStyle === 'bar' || node.handleStyle === 'knob') && (
            <div>
              <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('position')}
              </div>
              <SegmentedControl
                onChange={(value) =>
                  updateRun({ handlePosition: value as CabinetNodeType['handlePosition'] })
                }
                options={HANDLE_POSITION_OPTIONS.map((option) => ({
                  value: option.value,
                  label: t(option.labelKey),
                }))}
                value={node.handlePosition ?? 'auto'}
              />
            </div>
          )}
        </div>
      </PanelSection>
    </PanelWrapper>
  )
}
