// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// include Bun ambient types in its production declaration build.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import useViewer, {
  anyGroundVeiled,
  groundVeiled,
  siteGroundShown,
  WALL_CUT_HEIGHT_DEFAULT,
  WALL_CUT_HEIGHT_MAX,
  WALL_CUT_HEIGHT_MIN,
} from './use-viewer'

const resetMeasurementPreferences = () => {
  useViewer.setState({
    externalSelectedIds: [],
    pointedIds: [],
    projectId: null,
    projectPreferences: {},
    showMeasurements: true,
    wallMode: 'up',
    wallModeDefault: 'up',
    levelMode: 'stacked',
    levelModeDefault: 'stacked',
    showRoofs: true,
    showRoofsDefault: true,
    wallCutHeight: WALL_CUT_HEIGHT_DEFAULT,
    wallCutHeightDefault: WALL_CUT_HEIGHT_DEFAULT,
    projectPresentation: undefined,
    unit: 'metric',
    metricNotation: 'meters',
    unitSource: 'guess',
    unitDefault: 'metric',
    metricNotationDefault: 'meters',
    unitExplicit: false,
  })
}

beforeEach(resetMeasurementPreferences)
afterEach(resetMeasurementPreferences)

describe('measurement display preferences', () => {
  test('stores global visibility per project and defaults new projects to visible', () => {
    const viewer = useViewer.getState()
    viewer.setProjectId('project-a')
    viewer.setShowMeasurements(false)

    expect(useViewer.getState()).toMatchObject({
      projectId: 'project-a',
      showMeasurements: false,
      projectPreferences: {
        'project-a': { showMeasurements: false },
      },
    })

    useViewer.getState().setProjectId('project-b')
    expect(useViewer.getState().showMeasurements).toBe(true)

    useViewer.getState().setProjectId('project-a')
    expect(useViewer.getState().showMeasurements).toBe(false)
  })

  test('keeps per-project preferences separate between two scene ids', () => {
    const store = useViewer.getState()
    store.setProjectId('scene-1')
    store.setShowMeasurements(false)
    store.setEdges('strong')

    useViewer.getState().setProjectId('scene-2')
    expect(useViewer.getState()).toMatchObject({ showMeasurements: true, edges: 'soft' })

    useViewer.getState().setProjectId('scene-1')
    expect(useViewer.getState()).toMatchObject({ showMeasurements: false, edges: 'strong' })
  })

  test('changes display units without changing measurement visibility preferences', () => {
    const viewer = useViewer.getState()
    viewer.setProjectId('project-a')
    viewer.setShowMeasurements(false)

    useViewer.getState().setUnit('imperial')

    expect(useViewer.getState().unit).toBe('imperial')
    expect(useViewer.getState().projectPreferences['project-a']).toMatchObject({
      showMeasurements: false,
    })
    expect(useViewer.getState().showMeasurements).toBe(false)
  })

  test('selects millimeters as a metric display notation', () => {
    useViewer.getState().setUnit('imperial')
    useViewer.getState().setMetricNotation('millimeters')

    expect(useViewer.getState()).toMatchObject({
      unit: 'metric',
      metricNotation: 'millimeters',
      unitExplicit: true,
    })
  })
})

describe('view display preferences', () => {
  test('wall mode, level mode and roofs are saved per project over the browser-wide default', () => {
    const viewer = useViewer.getState()
    viewer.setProjectId('view-a')
    viewer.setWallMode('cutaway')
    viewer.setLevelMode('solo')
    viewer.setShowRoofs(false)

    expect(useViewer.getState().projectPreferences['view-a']).toMatchObject({
      wallMode: 'cutaway',
      levelMode: 'solo',
      showRoofs: false,
    })

    useViewer.getState().setProjectId('view-b')
    useViewer.getState().setWallMode('down')
    useViewer.getState().setProjectId('view-a')
    expect(useViewer.getState()).toMatchObject({
      wallMode: 'cutaway',
      levelMode: 'solo',
      showRoofs: false,
    })

    useViewer.getState().setProjectId('view-c')
    expect(useViewer.getState()).toMatchObject({
      wallMode: 'down',
      levelMode: 'solo',
      showRoofs: false,
    })
  })

  test('an override changes the view without touching what was saved or the default', () => {
    const viewer = useViewer.getState()
    viewer.setProjectId('view-a')
    viewer.setWallMode('cutaway')
    viewer.setShowRoofs(false)

    useViewer.getState().overrideView({ wallMode: 'up', levelMode: 'stacked', showRoofs: true })
    expect(useViewer.getState()).toMatchObject({
      wallMode: 'up',
      showRoofs: true,
      wallModeDefault: 'cutaway',
      showRoofsDefault: false,
    })
    expect(useViewer.getState().projectPreferences['view-a']).toEqual({
      wallMode: 'cutaway',
      showRoofs: false,
    })

    useViewer.getState().setProjectId('view-b')
    useViewer.getState().setProjectId('view-a')
    expect(useViewer.getState()).toMatchObject({ wallMode: 'cutaway', showRoofs: false })
  })
})

describe('the cut height of low walls', () => {
  test('is saved per project, clamped, over the browser-wide default', () => {
    useViewer.getState().setProjectId('cut-a')
    useViewer.getState().setWallCutHeight(0.6)
    useViewer.getState().setProjectId('cut-b')
    expect(useViewer.getState().wallCutHeight).toBe(0.6)
    useViewer.getState().setWallCutHeight(99)
    expect(useViewer.getState().wallCutHeight).toBe(WALL_CUT_HEIGHT_MAX)
    useViewer.getState().setWallCutHeight(0)
    expect(useViewer.getState().projectPreferences['cut-b']?.wallCutHeight).toBe(
      WALL_CUT_HEIGHT_MIN,
    )

    useViewer.getState().setProjectId('cut-a')
    expect(useViewer.getState().wallCutHeight).toBe(0.6)
  })

  test('a save for the project a gesture began on lands there after the project is gone', () => {
    useViewer.getState().setProjectId('cut-a')
    useViewer.getState().setProjectId(null)
    useViewer.getState().setWallCutHeight(0.7, 'cut-a')
    expect(useViewer.getState().projectPreferences['cut-a']?.wallCutHeight).toBe(0.7)
    expect(useViewer.getState().wallCutHeight).not.toBe(0.7)
    useViewer.getState().setProjectId('cut-a')
    expect(useViewer.getState().wallCutHeight).toBe(0.7)
  })

  test('a preview while dragging changes the live height only, and restoring gives the saved one back', () => {
    useViewer.getState().setProjectId('cut-a')
    useViewer.getState().setWallCutHeight(0.4)
    useViewer.getState().overrideView({ wallCutHeight: 0.9 })
    expect(useViewer.getState().wallCutHeight).toBe(0.9)
    expect(useViewer.getState().projectPreferences['cut-a']?.wallCutHeight).toBe(0.4)
    expect(useViewer.getState().wallCutHeightDefault).toBe(0.4)
    useViewer.getState().overrideView({ wallCutHeight: 50 })
    expect(useViewer.getState().wallCutHeight).toBe(WALL_CUT_HEIGHT_MAX)
    useViewer.getState().restoreView()
    expect(useViewer.getState().wallCutHeight).toBe(0.4)
  })
})

describe('restoring the view', () => {
  test("lifts every override back to the project's picks, else the browser-wide default", () => {
    const viewer = useViewer.getState()
    viewer.setProjectId('view-a')
    viewer.setWallMode('cutaway')
    useViewer.getState().setProjectId('view-b')
    useViewer.getState().setShowRoofs(false)
    useViewer.getState().overrideView({ wallMode: 'down', levelMode: 'solo', showRoofs: true })

    useViewer.getState().restoreView()
    expect(useViewer.getState()).toMatchObject({
      wallMode: 'cutaway',
      levelMode: 'stacked',
      showRoofs: false,
    })
    expect(useViewer.getState().projectPreferences['view-b']).toEqual({ showRoofs: false })
  })
})

describe('external selection highlights', () => {
  test('tracks host-owned highlights without changing the local selection', () => {
    const localSelection = useViewer.getState().selection

    useViewer.getState().setExternalSelectedIds(['wall_remote'])

    expect(useViewer.getState().externalSelectedIds).toEqual(['wall_remote'])
    expect(useViewer.getState().selection).toBe(localSelection)
  })
})

// Point and ask: a chat context chip hovered lights the elements it names. The slot is its own, so
// writing it never clobbers a teammate's highlight in `externalSelectedIds` nor the local selection.
describe('pointed highlights', () => {
  test('tracks the pointed elements without touching the external or local selection', () => {
    const localSelection = useViewer.getState().selection
    useViewer.getState().setExternalSelectedIds(['wall_remote'])

    useViewer.getState().setPointedIds(['zone_kitchen', 'wall_north'])

    expect(useViewer.getState().pointedIds).toEqual(['zone_kitchen', 'wall_north'])
    expect(useViewer.getState().externalSelectedIds).toEqual(['wall_remote'])
    expect(useViewer.getState().selection).toBe(localSelection)
  })

  test('the same ids again change nothing, so nothing re-renders', () => {
    useViewer.getState().setPointedIds(['zone_kitchen'])
    const before = useViewer.getState().pointedIds

    useViewer.getState().setPointedIds(['zone_kitchen'])

    expect(useViewer.getState().pointedIds).toBe(before)
  })

  test('null clears it, and clearing what is already clear changes nothing', () => {
    useViewer.getState().setPointedIds(['zone_kitchen'])
    useViewer.getState().setPointedIds(null)
    expect(useViewer.getState().pointedIds).toEqual([])

    const empty = useViewer.getState().pointedIds
    useViewer.getState().setPointedIds(null)
    useViewer.getState().setPointedIds([])
    expect(useViewer.getState().pointedIds).toBe(empty)
  })
})

describe('unit focus', () => {
  afterEach(() => useViewer.getState().setFocusedUnit(null))

  test('focuses one unit at a time and clears without touching the selection', () => {
    const selection = useViewer.getState().selection

    useViewer.getState().setFocusedUnit('unit_a' as never)
    expect(useViewer.getState().focusedUnitId).toBe('unit_a')

    useViewer.getState().setFocusedUnit('unit_b' as never)
    expect(useViewer.getState().focusedUnitId).toBe('unit_b')

    useViewer.getState().setFocusedUnit(null)
    expect(useViewer.getState().focusedUnitId).toBeNull()
    expect(useViewer.getState().selection).toBe(selection)
  })
})

describe('scene theme', () => {
  afterEach(() => useViewer.getState().setSceneTheme('studio'))

  test('a shown theme renders without replacing the saved one', () => {
    useViewer.getState().setSceneTheme('paper')
    useViewer.getState().showSceneTheme('night')

    expect(useViewer.getState().sceneTheme).toBe('night')
    expect(useViewer.getState().savedSceneTheme).toBe('paper')

    useViewer.getState().showSceneTheme(null)
    expect(useViewer.getState().sceneTheme).toBe('paper')
  })

  test('picking a theme while another is shown saves the pick', () => {
    useViewer.getState().showSceneTheme('night')
    useViewer.getState().setSceneTheme('sunset')
    useViewer.getState().showSceneTheme(null)

    expect(useViewer.getState().sceneTheme).toBe('sunset')
    expect(useViewer.getState().savedSceneTheme).toBe('sunset')
  })
})

describe('the wall cut height', () => {
  afterEach(() => useViewer.getState().setWallCutHeight(WALL_CUT_HEIGHT_DEFAULT))

  test.each([
    [0.4, 0.4],
    [0, WALL_CUT_HEIGHT_MIN],
    [-3, WALL_CUT_HEIGHT_MIN],
    [9, WALL_CUT_HEIGHT_MAX],
    [Number.NaN, WALL_CUT_HEIGHT_DEFAULT],
  ])('%p is kept as %p', (height, kept) => {
    useViewer.getState().setWallCutHeight(height)
    expect(useViewer.getState().wallCutHeight).toBe(kept)
  })
})

describe('the ground over a level below grade', () => {
  const below = { belowGrade: true, groundMode: 'auto', gradeStanding: 'below-grade' } as const

  test('is veiled wholesale on Auto, not on Solid, not over a part-buried level', () => {
    expect(groundVeiled(below)).toBe(true)
    expect(groundVeiled({ ...below, groundMode: 'solid' })).toBe(false)
    expect(groundVeiled({ ...below, gradeStanding: 'partly-below-grade' })).toBe(false)
  })

  test('is solid in the walkthrough, whatever level the overview had shown', () => {
    expect(groundVeiled({ ...below, walkthroughMode: true })).toBe(false)
    expect(anyGroundVeiled({ ...below, groundWindowVeiled: true, walkthroughMode: true })).toBe(
      false,
    )
    expect(anyGroundVeiled({ ...below, groundWindowVeiled: true, walkthroughMode: false })).toBe(
      true,
    )
  })
})

describe('project rendering defaults', () => {
  const original = useViewer.getState()
  beforeEach(() => useViewer.setState(original, true))
  afterEach(() => useViewer.setState(original, true))
  const authored = {
    theme: 'studio',
    exposure: 0.94,
    shading: 'rendered' as const,
    edges: 'off' as const,
    lighting: {
      background: '#dce4e5',
      backgroundSky: null,
      ambient: { color: '#ffffff', intensity: 0 },
    },
    postprocessing: { ambientOcclusion: false, colorGrading: false },
  }

  test('project defaults survive context changes without becoming global user preferences', () => {
    const store = useViewer.getState()
    store.setSceneTheme('paper')
    store.setEdges('strong')
    store.setProjectId('look-a')
    store.setProjectPresentation(authored)
    store.setRenderContext('editor', 'solid')
    expect(useViewer.getState()).toMatchObject({
      sceneTheme: 'studio',
      shading: 'rendered',
      edges: 'off',
    })
    expect(useViewer.getState().sceneAppearance).toMatchObject({
      background: '#dce4e5',
      backgroundSky: null,
      toneMappingExposure: 0.94,
    })
    expect(useViewer.getState().lookDefaults).toMatchObject({ theme: 'paper', edges: 'strong' })
    expect(useViewer.getState().projectPreferences['look-a']?.look).toBeUndefined()
    store.setProjectId('look-b')
    expect(useViewer.getState()).toMatchObject({
      sceneTheme: 'paper',
      edges: 'strong',
      shading: 'solid',
    })
  })

  test('local choices override only their project and survive switching away and back', () => {
    const store = useViewer.getState()
    store.setProjectId('look-a')
    store.setProjectPresentation(authored)
    store.setSceneTheme('night')
    store.setEdges('soft')
    store.setShading('solid')
    expect(useViewer.getState().sceneAppearance.background).not.toBe('#dce4e5')
    store.setProjectId('look-b')
    store.setProjectPresentation(authored)
    expect(useViewer.getState()).toMatchObject({
      sceneTheme: 'studio',
      edges: 'off',
      shading: 'rendered',
    })
    store.setProjectId('look-a')
    store.setProjectPresentation(authored)
    expect(useViewer.getState()).toMatchObject({
      sceneTheme: 'night',
      edges: 'soft',
      shading: 'solid',
    })
    store.resetProjectLook()
    expect(useViewer.getState()).toMatchObject({
      sceneTheme: 'studio',
      edges: 'off',
      shading: 'rendered',
    })
    expect(useViewer.getState().sceneAppearance.toneMappingExposure).toBe(0.94)
  })

  test('an explicit temporary theme bypasses custom lighting even with the same theme id', () => {
    const store = useViewer.getState()
    store.setProjectId('look-a')
    store.setProjectPresentation(authored)
    store.showSceneTheme('studio')
    expect(useViewer.getState().sceneAppearance.background).not.toBe('#dce4e5')
    store.showSceneTheme(null)
    expect(useViewer.getState().sceneAppearance.background).toBe('#dce4e5')
    expect(useViewer.getState().projectPreferences['look-a']?.look).toBeUndefined()
    store.setProjectPresentation(undefined)
    expect(useViewer.getState().sceneAppearance.background).not.toBe('#dce4e5')
  })

  test('an embed without a project id can override and restore its authored look', () => {
    const store = useViewer.getState()
    store.setProjectPresentation({ ...authored, shadows: true })
    store.setSceneTheme('night')
    store.setEdges('strong')
    store.setShadows(false)
    store.setShading('solid')
    expect(useViewer.getState()).toMatchObject({
      sceneTheme: 'night',
      edges: 'strong',
      shadows: false,
      shading: 'solid',
    })
    store.resetProjectLook()
    expect(useViewer.getState()).toMatchObject({
      sceneTheme: 'studio',
      edges: 'off',
      shadows: true,
      shading: 'rendered',
    })
    store.setProjectId('look-next')
    expect(useViewer.getState().projectPreferences['']).toBeUndefined()
    store.setProjectPresentation(authored)
    expect(useViewer.getState().sceneAppearance.background).toBe('#dce4e5')
  })
})

describe('project display units', () => {
  const original = useViewer.getState()
  beforeEach(() => useViewer.setState(original, true))
  afterEach(() => useViewer.setState(original, true))

  test('resolve as local choice > project > personal pick > locale guess', () => {
    const store = useViewer.getState()
    store.setProjectId('units-a')
    expect(useViewer.getState().unitSource).toBe('guess')

    store.setProjectPresentation({ units: { system: 'imperial' } })
    expect(useViewer.getState()).toMatchObject({ unit: 'imperial', unitSource: 'project' })

    useViewer.getState().setUnit('metric')
    useViewer.getState().setMetricNotation('millimeters')
    expect(useViewer.getState()).toMatchObject({
      unit: 'metric',
      metricNotation: 'millimeters',
      unitSource: 'local',
    })
    expect(useViewer.getState()).toMatchObject({
      unitExplicit: false,
      unitDefault: original.unitDefault,
    })

    useViewer.getState().resetProjectUnits()
    expect(useViewer.getState()).toMatchObject({
      unit: 'imperial',
      metricNotation: 'meters',
      unitSource: 'project',
    })

    useViewer.getState().setProjectPresentation(undefined)
    expect(useViewer.getState().unitSource).toBe('guess')
  })

  test('a local choice stays with its project while another project follows its own default', () => {
    const store = useViewer.getState()
    store.setProjectId('units-a')
    store.setProjectPresentation({ units: { system: 'imperial' } })
    useViewer.getState().setUnit('metric')

    useViewer.getState().setProjectId('units-b')
    useViewer.getState().setProjectPresentation({ units: { system: 'imperial' } })
    expect(useViewer.getState()).toMatchObject({ unit: 'imperial', unitSource: 'project' })

    useViewer.getState().setProjectId('units-a')
    useViewer.getState().setProjectPresentation({ units: { system: 'imperial' } })
    expect(useViewer.getState()).toMatchObject({ unit: 'metric', unitSource: 'local' })
  })

  test('the personal pick applies where the project sets nothing and never leaks a project default', () => {
    useViewer.getState().setUnit('imperial')
    expect(useViewer.getState()).toMatchObject({
      unit: 'imperial',
      unitDefault: 'imperial',
      unitSource: 'personal',
    })

    useViewer.getState().setProjectId('units-a')
    useViewer.getState().setProjectPresentation({ units: { system: 'metric' } })
    expect(useViewer.getState()).toMatchObject({ unit: 'metric', unitSource: 'project' })
    expect(useViewer.getState().unitDefault).toBe('imperial')

    useViewer.getState().setProjectId('units-b')
    expect(useViewer.getState()).toMatchObject({ unit: 'imperial', unitSource: 'personal' })
  })
})

describe('choosing a unit', () => {
  const original = useViewer.getState()
  beforeEach(() => useViewer.setState(original, true))
  afterEach(() => useViewer.setState(original, true))

  test('on a project that sets no units is the personal default, shown in every other project', () => {
    useViewer.getState().setProjectId('scene-a')
    useViewer.getState().setProjectPresentation(undefined)
    useViewer.getState().setUnit('imperial')
    expect(useViewer.getState()).toMatchObject({
      unit: 'imperial',
      unitDefault: 'imperial',
      unitExplicit: true,
      unitSource: 'personal',
    })
    expect(useViewer.getState().projectPreferences['scene-a']?.units).toBeUndefined()

    useViewer.getState().setProjectId('scene-b')
    expect(useViewer.getState()).toMatchObject({ unit: 'imperial', unitSource: 'personal' })
  })

  test('the notation choice is personal too, and drops a stale local override', () => {
    useViewer.getState().setProjectId('scene-a')
    useViewer.getState().setProjectPresentation({ units: { system: 'imperial' } })
    useViewer.getState().setUnit('metric')
    useViewer.getState().setProjectPresentation(undefined)
    useViewer.getState().setMetricNotation('millimeters')
    expect(useViewer.getState()).toMatchObject({
      unit: 'metric',
      metricNotation: 'millimeters',
      metricNotationDefault: 'millimeters',
    })
    expect(useViewer.getState().projectPreferences['scene-a']?.units).toBeUndefined()
  })

  test('a project that sets units keeps the choice local to it', () => {
    useViewer.getState().setProjectId('scene-a')
    useViewer.getState().setProjectPresentation({ units: { system: 'imperial' } })
    useViewer.getState().setUnit('metric')
    expect(useViewer.getState()).toMatchObject({ unit: 'metric', unitSource: 'local' })
    expect(useViewer.getState().unitExplicit).toBe(false)

    useViewer.getState().setProjectId('scene-b')
    useViewer.getState().setProjectPresentation(undefined)
    expect(useViewer.getState().unitSource).toBe('guess')
  })
})

describe('the site ground with showGround off', () => {
  test('stands in while a level below grade is shown, and leaves showGround to the author otherwise', () => {
    // An authored landscape supplies the ground (showGround false): the level display hides it
    // with the storeys above a basement, so the site's ground draws then.
    expect(siteGroundShown({ showGround: false }, { belowGrade: true })).toBe(true)
    expect(siteGroundShown({ showGround: false }, { belowGrade: false })).toBe(false)
  })

  test('is the site’s own ground whatever the display says when showGround is on or absent', () => {
    for (const showGround of [undefined, true]) {
      expect(siteGroundShown({ showGround }, { belowGrade: false })).toBe(true)
      expect(siteGroundShown({ showGround }, { belowGrade: true })).toBe(true)
    }
  })
})
