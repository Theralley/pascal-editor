import {
  type AnyNode,
  type AnyNodeId,
  buildPortComponents,
  collectSystemPorts,
  distributionPointToWorld,
  getWallBaseElevationForNodes,
  getWallCurveFrameAt,
  getWallEffectiveHeightForNodes,
  getWallFaceOffsets,
  nodeRegistry,
  validateDwv,
} from '@pascal-app/core'
import { translate } from '@pascal-app/editor'
import { connectionCompatibility } from '@pascal-app/editor/distribution'
import { Box3, Ray, Vector3 } from 'three'
import { messages } from './messages'
import { planRunHangerSlots } from './run-hangers'

export type SystemFinding = {
  code: string
  message: string
  nodeIds: AnyNodeId[]
  severity: 'error' | 'warning'
}

// The drainage rules word their findings in English; this words the known ones in the locale.
const DRAINAGE_MESSAGES: {
  code: string
  pattern: RegExp
  key: 'finding.slopeFlat' | 'finding.slopeSteep' | 'finding.trapArm'
  vars: string[]
}[] = [
  {
    code: 'slope-too-flat',
    pattern: /^(.+) drain slopes (\S+) — IPC 704\.1 requires at least (\S+)\.$/,
    key: 'finding.slopeFlat',
    vars: ['size', 'slope', 'min'],
  },
  {
    code: 'slope-too-steep',
    pattern:
      /^(.+) drain slopes (\S+) — over one pipe-diameter per foot risks siphoning the traps\.$/,
    key: 'finding.slopeSteep',
    vars: ['size', 'slope'],
  },
  {
    code: 'trap-arm-too-long',
    pattern: /^(.+) trap arm runs (\d+)" to its vent — IPC 909\.1 caps it at (\d+)"\.$/,
    key: 'finding.trapArm',
    vars: ['size', 'length', 'max'],
  },
]

export function drainageMessage(finding: { code: string; message: string }): string {
  for (const entry of DRAINAGE_MESSAGES) {
    if (entry.code !== finding.code) continue
    const match = entry.pattern.exec(finding.message)
    if (!match) break
    return translate(
      messages,
      entry.key,
      Object.fromEntries(entry.vars.map((name, index) => [name, match[index + 1]!])),
    )
  }
  return finding.message
}

export function checkDistributionSystems(nodes: Record<AnyNodeId, AnyNode>): SystemFinding[] {
  const findings: SystemFinding[] = validateDwv(nodes).map((finding) => ({
    ...finding,
    message: drainageMessage(finding),
  }))
  const ports = collectSystemPorts(nodes)
  const joined = new Set<number>()
  const connectedPairs = new Set<string>()
  for (let i = 0; i < ports.length; i++) {
    const a = ports[i]!
    for (let j = i + 1; j < ports.length; j++) {
      const b = ports[j]!
      if (a.nodeId === b.nodeId || Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 0.05) continue
      joined.add(i)
      joined.add(j)
      connectedPairs.add([a.nodeId, b.nodeId].sort().join('|'))
      const profile = (entry: typeof a) => {
        const node = nodes[entry.nodeId]
        return node?.type === 'duct-segment'
          ? { ...entry.port, shape: node.shape, width: node.width, height: node.height }
          : entry.port
      }
      const compatibility = connectionCompatibility(profile(a), profile(b))
      if (compatibility.status !== 'match')
        findings.push({
          code: 'connection-mismatch',
          message: compatibility.label,
          nodeIds: [a.nodeId, b.nodeId],
          severity: compatibility.status === 'incompatible' ? 'error' : 'warning',
        })
    }
  }
  ports.forEach((entry, index) => {
    if (!joined.has(index))
      findings.push({
        code: 'open-end',
        message: translate(messages, 'finding.openConnection', { port: entry.port.id }),
        nodeIds: [entry.nodeId],
        severity: 'warning',
      })
  })
  const components = buildPortComponents(nodes)
  for (const component of components) {
    const hasEquipment = component.some(
      (id) => nodeRegistry.get(nodes[id]!.type)?.distributionRole === 'equipment',
    )
    const systems = new Set(
      ports.filter((port) => component.includes(port.nodeId)).map((port) => port.system),
    )
    const hasSeparatePeer = components.some(
      (other) =>
        other !== component &&
        ports.some((port) => other.includes(port.nodeId) && systems.has(port.system)),
    )
    if (!hasEquipment && hasSeparatePeer)
      findings.push({
        code: 'disconnected-branch',
        message: translate(messages, 'finding.separateBranch'),
        nodeIds: component,
        severity: 'warning',
      })
  }
  const runs = Object.values(nodes).filter(
    (node) => node.type === 'duct-segment' || node.type === 'pipe-segment',
  )
  const world = (node: AnyNode, point: readonly [number, number, number]) =>
    new Vector3(...distributionPointToWorld(node, point, nodes))
  const segments = runs.flatMap((run) => {
    const radius =
      ((run.type === 'duct-segment' && run.shape !== 'round'
        ? Math.hypot(run.width, run.height)
        : run.diameter) *
        0.0254) /
      2
    return run.path.slice(1).map((point, index) => ({
      run,
      a: world(run, run.path[index]!),
      b: world(run, point),
      radius,
    }))
  })
  const clashes = new Set<string>()
  const addClash = (a: AnyNodeId, b: AnyNodeId, message: string) => {
    const key = [a, b].sort().join('|')
    if (clashes.has(key)) return
    clashes.add(key)
    findings.push({ code: 'possible-intersection', message, nodeIds: [a, b], severity: 'warning' })
  }
  for (let i = 0; i < segments.length; i++) {
    const a = segments[i]!
    for (let j = i + 1; j < segments.length; j++) {
      const b = segments[j]!
      if (a.run.id === b.run.id || connectedPairs.has([a.run.id, b.run.id].sort().join('|')))
        continue
      const box = new Box3().setFromPoints([b.a, b.b]).expandByScalar(a.radius + b.radius)
      if (segmentHitsBox(a.a, a.b, box))
        addClash(a.run.id, b.run.id, translate(messages, 'finding.runIntersection'))
    }
  }
  for (const wall of Object.values(nodes)) {
    if (wall.type !== 'wall') continue
    const base = getWallBaseElevationForNodes(wall, nodes)
    const top = base + getWallEffectiveHeightForNodes(wall, nodes)
    const points: Vector3[] = []
    for (let i = 0; i <= 16; i++) {
      const frame = getWallCurveFrameAt(wall, i / 16)
      points.push(
        world(wall, [frame.point.x, base, frame.point.y]),
        world(wall, [frame.point.x, top, frame.point.y]),
      )
    }
    const box = new Box3()
      .setFromPoints(points)
      .expandByScalar(Math.max(getWallFaceOffsets(wall).a, -getWallFaceOffsets(wall).b))
    for (const segment of segments) {
      if (segment.run.wallAttachment?.wallId === wall.id) continue
      if (segmentHitsBox(segment.a, segment.b, box.clone().expandByScalar(segment.radius)))
        addClash(segment.run.id, wall.id, translate(messages, 'finding.wallIntersection'))
    }
  }
  for (const run of runs) {
    const missing = planRunHangerSlots(run, nodes).filter((slot) => !(slot.skipped || slot.hanger))
    if (missing.length)
      findings.push({
        code: 'unsupported-hanger',
        message: translate(messages, 'finding.unsupportedHangers', { count: missing.length }),
        nodeIds: [run.id],
        severity: 'warning',
      })
  }
  return findings.sort((a, b) => Number(a.severity !== 'error') - Number(b.severity !== 'error'))
}

function segmentHitsBox(start: Vector3, end: Vector3, box: Box3): boolean {
  if (box.containsPoint(start)) return true
  const delta = end.clone().sub(start)
  const length = delta.length()
  if (length < 1e-9) return false
  const hit = new Ray(start, delta.divideScalar(length)).intersectBox(box, new Vector3())
  return !!hit && hit.distanceTo(start) <= length
}
