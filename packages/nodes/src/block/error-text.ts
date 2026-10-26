import { type MessageKey, translate } from '@pascal-app/editor'
import { messages } from './messages'

// The edit commands report their English sentences; the toolbar shows them in the person's language.
const ERROR_KEYS: Record<string, MessageKey<typeof messages>> = {
  'Select an edge to bevel': 'cmd.selectEdgeBevel',
  'Select an edge to dissolve': 'cmd.selectEdgeDissolve',
  'Select a face to inset': 'cmd.selectFaceInset',
  'Select a face to extrude': 'cmd.selectFaceExtrude',
  'Select at least two faces to dissolve': 'cmd.selectTwoFaces',
  'Select a component to delete': 'cmd.selectDelete',
  'Select a component to move': 'cmd.selectMove',
  'Select a component to transform': 'cmd.selectTransform',
  'Select at least two vertices to merge': 'cmd.selectTwoVertices',
  'Extrude distance must be a non-zero finite number': 'cmd.extrudeDistance',
  'Inset amount must be greater than 0 and less than 1': 'cmd.insetAmount',
  'Bevel width overlaps adjacent edges; enable Clamp': 'cmd.bevelOverlap',
  'Bevel requires an edge shared by exactly two faces': 'cmd.bevelTwoFaces',
  'Bevel currently requires three-face corner endpoints': 'cmd.bevelCorner',
  'Dissolve requires an edge shared by exactly two faces': 'cmd.dissolveTwoFaces',
  'Dissolving this edge would create a repeated face vertex': 'cmd.dissolveRepeated',
  'The selected vertices would create a repeated face vertex': 'cmd.mergeRepeated',
  'Selected faces do not share a dissolvable boundary': 'cmd.dissolveBoundary',
  'Extrude Region requires connected faces': 'cmd.extrudeConnected',
  'Selected face normals cancel each other out': 'cmd.normalsCancel',
  'Loop cut requires 1–32 cuts and a factor between 0 and 1': 'cmd.loopRange',
  'Bevel width must be positive': 'cmd.bevelWidth',
  'Scale requires finite, non-zero factors and a finite pivot': 'cmd.scaleFactors',
  'Loop cut requires a connected ring of quad faces': 'error.loopRing',
}

export function blockErrorText(error: string): string {
  const key = ERROR_KEYS[error]
  return key ? translate(messages, key) : error
}
