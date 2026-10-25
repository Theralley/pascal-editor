import type { NodePort } from '@pascal-app/core'
import { translate } from '../../../i18n'
import { messages } from './messages'

export type ConnectionProfile = Pick<NodePort, 'system' | 'diameter' | 'shape' | 'width' | 'height'>
export type ConnectionCompatibility = {
  status: 'match' | 'adapter' | 'incompatible' | 'unknown'
  label: string
}

export function connectionCompatibility(
  source: ConnectionProfile,
  target: ConnectionProfile,
): ConnectionCompatibility {
  if (source.system && target.system && source.system !== target.system) {
    return {
      status: 'incompatible',
      label: translate(messages, 'compat.differentSystems', {
        source: source.system,
        target: target.system,
      }),
    }
  }
  const sourceShape = source.shape ?? 'round'
  const targetShape = target.shape ?? 'round'
  if (sourceShape !== targetShape) {
    return {
      status: 'adapter',
      label: translate(messages, 'compat.transition', { source: sourceShape, target: targetShape }),
    }
  }
  const sourceSize = sourceShape === 'round' ? [source.diameter] : [source.width, source.height]
  const targetSize = targetShape === 'round' ? [target.diameter] : [target.width, target.height]
  if (
    [...sourceSize, ...targetSize].some(
      (value) => value === undefined || !Number.isFinite(value) || value <= 0,
    )
  ) {
    return { status: 'unknown', label: translate(messages, 'compat.sizeUnavailable') }
  }
  if (sourceSize.some((value, index) => Math.abs(value! - targetSize[index]!) > 0.001)) {
    return {
      status: 'adapter',
      label: translate(messages, 'compat.reducer', {
        source: sourceSize.join(' × '),
        target: targetSize.join(' × '),
      }),
    }
  }
  if (!source.system || !target.system) {
    return { status: 'unknown', label: translate(messages, 'compat.systemUnspecified') }
  }
  return { status: 'match', label: translate(messages, 'compat.match', { system: target.system }) }
}
