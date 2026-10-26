'use client'
import { type AnyNodeId, type StairNode, useScene } from '@pascal-app/core'
import { MetricControl, SegmentedControl, ToggleControl, useT } from '@pascal-app/editor'
import { messages } from './messages'

const MODES = [
  { labelKey: 'none', value: 'none' },
  { labelKey: 'left', value: 'left' },
  { labelKey: 'right', value: 'right' },
  { labelKey: 'both', value: 'both' },
] as const
export function StairRailingControls({
  node,
  onChange,
}: {
  node: StairNode
  onChange: (patch: Partial<StairNode>) => void
}) {
  const t = useT(messages)
  const config = node.handrail
  return (
    <div className="space-y-3">
      <SegmentedControl
        value={
          node.railingStyle === 'glass' || node.railingStyle === 'metal'
            ? 'continuous'
            : (node.railingPath ?? 'original')
        }
        options={[
          { label: t('originalLayout'), value: 'original' },
          { label: t('continuous'), value: 'continuous' },
        ]}
        onChange={(value) =>
          onChange({
            railingPath: value as StairNode['railingPath'],
            ...(value === 'original' &&
            (node.railingStyle === 'glass' || node.railingStyle === 'metal')
              ? { railingStyle: 'balusters' }
              : {}),
          })
        }
      />
      <ToggleControl
        label={t('separateHandrail')}
        checked={!!config}
        onChange={(checked) =>
          onChange({
            handrail: checked
              ? { mode: 'both', height: 0.9, diameter: 0.045, offset: 0.06 }
              : undefined,
          })
        }
      />
      {config ? (
        <>
          <SegmentedControl
            value={config.mode}
            options={MODES.map(({ labelKey, value }) => ({ label: t(labelKey), value }))}
            onChange={(value) =>
              onChange({ handrail: { ...config, mode: value as StairNode['railingMode'] } })
            }
          />
          {(['height', 'diameter', 'offset'] as const) // i18n-ignore: property keys
            .map((key) => (
              <MetricControl
                key={key}
                label={
                  key === 'height'
                    ? t('handrailHeight')
                    : key === 'diameter'
                      ? t('handrailDiameter')
                      : t('handrailInset')
                }
                value={config[key]}
                min={key === 'offset' ? 0 : 0.001}
                step={0.005}
                precision={3}
                unit="m"
                onChange={(value) => onChange({ handrail: { ...config, [key]: value } })}
              />
            ))}
          {(['bottom', 'top'] as const) // i18n-ignore: property keys
            .map((end) => {
              const detail = config[end] ?? {
                extension: 0,
                return: 'none' as const,
                returnLength: 0.1,
              }
              const update = (patch: Partial<typeof detail>) =>
                onChange({ handrail: { ...config, [end]: { ...detail, ...patch } } })
              return (
                <div key={end} className="space-y-2">
                  <MetricControl
                    label={t(end === 'bottom' ? 'bottomSlopedExtension' : 'topHorizontalExtension')}
                    value={detail.extension}
                    min={0}
                    step={0.05}
                    precision={3}
                    unit="m"
                    onChange={(extension) => update({ extension })}
                  />
                  <SegmentedControl
                    value={detail.return}
                    options={[
                      { label: t('noReturn'), value: 'none' },
                      { label: t('wallFacing'), value: 'wall' },
                      { label: t('postFacing'), value: 'post' },
                      { label: t('floor'), value: 'floor' },
                    ]}
                    onChange={(value) => update({ return: value as typeof detail.return })}
                  />
                  {detail.return === 'wall' || detail.return === 'post' ? (
                    <>
                      <MetricControl
                        label={t('returnLength')}
                        value={detail.returnLength}
                        min={0}
                        step={0.01}
                        precision={3}
                        unit="m"
                        onChange={(returnLength) => update({ returnLength })}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('setTheLengthToReachTheWallOrPost')}
                      </p>
                    </>
                  ) : null}
                </div>
              )
            })}
        </>
      ) : null}
    </div>
  )
}
export function StairRailingField({ node }: { node: StairNode }) {
  return (
    <StairRailingControls
      node={node}
      onChange={(patch) => useScene.getState().updateNode(node.id as AnyNodeId, patch)}
    />
  )
}
