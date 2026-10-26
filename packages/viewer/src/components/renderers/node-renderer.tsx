'use client'

import {
  type AnyNode,
  isNodeKindEnabled,
  nodeRegistry,
  onRegistryChange,
  type RendererSource,
  useScene,
} from '@pascal-app/core'
import {
  type ComponentType,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from 'react'
import { ClippingGroup } from 'three/webgpu'
import { useRevealPending } from '../../systems/construction-reveal/construction-reveal'
import { ParametricNodeRenderer } from './parametric-node-renderer'

// Cache lazy components by their RendererSource so React.lazy isn't re-invoked
// on every render — that would create a new Suspense boundary each time.
const lazyCache = new WeakMap<RendererSource<AnyNode>, ComponentType<{ node: AnyNode }>>()

export function getRegistryRenderer(
  source: RendererSource<AnyNode>,
): ComponentType<{ node: AnyNode }> | null {
  const cached = lazyCache.get(source)
  if (cached) return cached
  // GLB / instanced-GLB sources lower onto built-in renderers landed in
  // Phase 5 — for now only parametric (lazy module) sources are honored.
  if (source.kind !== 'parametric') return null
  const Comp = lazy(source.module) as unknown as ComponentType<{ node: AnyNode }>
  lazyCache.set(source, Comp)
  return Comp
}

/**
 * Every node of a kind that follows the wall mode (`capabilities.followsWallMode`) is rendered inside a
 * `ClippingGroup` that stands at the identity and clips nothing until the Low cut passes through
 * the node (`WallModeFollowSystem` turns it on and sets its plane). It is always mounted, so the
 * wall mode, or a flag that turns following on or off (`appliesTo`), never remounts the node; a
 * node that does not follow keeps its clip disabled. Clipping leaves every material alone.
 */
function FollowerClip({ children }: { children: ReactNode }) {
  const clip = useMemo(() => {
    const group = new ClippingGroup()
    group.enabled = false
    group.name = 'follower-clip'
    group.userData.followerClip = true
    return group
  }, [])
  return <primitive object={clip}>{children}</primitive>
}

export const NodeRenderer = ({ nodeId }: { nodeId: AnyNode['id'] }) => {
  const node = useScene((state) => state.nodes[nodeId])
  const installedPlugins = useScene((state) => state.installedPlugins)
  // Plugins register after the first mount (async discovery). Subscribe to this
  // node's own kind only: a registration re-renders the nodes of that kind and
  // leaves every other mounted node alone.
  const kind = node?.type
  const readDefinition = useCallback(() => (kind ? nodeRegistry.get(kind) : undefined), [kind])
  const def = useSyncExternalStore(onRegistryChange, readDefinition, readDefinition)
  // A node an agent just built mounts on its construction-reveal turn.
  const revealPending = useRevealPending(nodeId)
  if (!node || revealPending) return null
  if (!isNodeKindEnabled(node.type, installedPlugins)) return null
  if (!def) return null
  // Two-checkbox dispatch (see wiki/architecture/node-definitions.md):
  //  1. Custom renderer — JSX-side composition for kinds that need GLB,
  //     drei, <Html>, instancing, shader materials.
  //  2. Else, if the kind ships `def.geometry`, the generic empty-group
  //     <ParametricNodeRenderer> is filled by <GeometrySystem> from the
  //     pure builder.
  const follows = def.capabilities?.followsWallMode
  const wrap = (content: ReactNode) => (follows ? <FollowerClip>{content}</FollowerClip> : content)
  if (def.renderer) {
    const Renderer = getRegistryRenderer(def.renderer as RendererSource<AnyNode>)
    if (!Renderer) return null
    return wrap(
      <Suspense fallback={null}>
        <Renderer node={node} />
      </Suspense>,
    )
  }
  if (def.geometry) {
    return wrap(<ParametricNodeRenderer node={node} />)
  }
  return null
}
