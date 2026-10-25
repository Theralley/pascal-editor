import { type AnyNodeId, type GutterNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import Image from 'next/image'
import { memo, useCallback, useState } from 'react'
import { SnapTargetIcon } from '../../../snap-target-badge'
import { InlineRenameInput } from './inline-rename-input'
import { focusTreeNode, handleTreeSelection, TreeNodeWrapper } from './tree-node'
import { TreeNodeActions } from './tree-node-actions'
import { messages } from './messages'
import { useT } from '../../../../../i18n'

interface GutterTreeNodeProps {
  nodeId: AnyNodeId
  depth: number
  isLast?: boolean
}

export const GutterTreeNode = memo(function GutterTreeNode({
  nodeId,
  depth,
  isLast,
}: GutterTreeNodeProps) {
  const t = useT(messages)
  const [isEditing, setIsEditing] = useState(false)
  const isVisible = useScene((s) => s.nodes[nodeId]?.visible !== false)
  const node = useScene((s) => s.nodes[nodeId] as GutterNode | undefined)
  const isSelected = useViewer((state) => state.selection.selectedIds.includes(nodeId))
  const isHovered = useViewer((state) => state.hoveredId === nodeId)
  const setSelection = useViewer((state) => state.setSelection)
  const setHoveredId = useViewer((state) => state.setHoveredId)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      handleTreeSelection(
        e,
        nodeId,
        useViewer.getState().selection.selectedIds,
        setSelection,
      )
    },
    [nodeId, setSelection],
  )

  const defaultName = node?.name || t('node.gutter')

  return (
    <TreeNodeWrapper
      actions={<TreeNodeActions nodeId={nodeId} />}
      depth={depth}
      expanded={false}
      hasChildren={false}
      icon={
        <SnapTargetIcon target="roof">
          <Image
            alt=""
            className="object-contain opacity-60"
            height={14}
            src="/icons/roof.webp"
            width={14}
          />
        </SnapTargetIcon>
      }
      isHovered={isHovered}
      isLast={isLast}
      isSelected={isSelected}
      isVisible={isVisible}
      label={
        <InlineRenameInput
          defaultName={defaultName}
          isEditing={isEditing}
          nodeId={nodeId}
          onStartEditing={() => setIsEditing(true)}
          onStopEditing={() => setIsEditing(false)}
        />
      }
      nodeId={nodeId}
      onClick={handleClick}
      onDoubleClick={() => focusTreeNode(nodeId)}
      onMouseEnter={() => setHoveredId(nodeId)}
      onMouseLeave={() => setHoveredId(null)}
      onToggle={() => {}}
    />
  )
})
