'use client'

import { Plus } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './../../../components/ui/primitives/tooltip'
import { useT } from '../../../i18n'
import { cn } from './../../../lib/utils'
import { messages } from './messages'

export type PanelId = string

export type ExtraPanel = {
  id: string
  icon: ReactNode
  label: string
  component: ComponentType
  pluginId?: string
  /** Rail entry that drives the stage (see `SidebarTab.noPanel`); `component` serves the v1 sidebar. */
  noPanel?: boolean
  onSelect?: () => void
  stageActive?: boolean
  onDeselect?: () => void
}

interface IconRailProps {
  activePanel: PanelId
  onPanelChange: (panel: PanelId) => void
  appMenuButton?: ReactNode
  extraPanels?: ExtraPanel[]
  className?: string
}

type RailPanel = { id: PanelId; iconSrc: string; labelKey: 'site' | 'settings' }

const sitePanel: RailPanel = { id: 'site', iconSrc: '/icons/level.webp', labelKey: 'site' }

const settingsPanel: RailPanel = {
  id: 'settings',
  iconSrc: '/icons/settings.webp',
  labelKey: 'settings',
}

const panels: RailPanel[] = [sitePanel, settingsPanel]

export function IconRail({
  activePanel,
  onPanelChange,
  appMenuButton,
  extraPanels,
  className,
}: IconRailProps) {
  const t = useT(messages)
  const regularExtraPanels = extraPanels?.filter((panel) => !panel.pluginId && panel.id !== 'plugins')
  const pluginPanels = extraPanels?.filter((panel) => panel.pluginId)
  const pluginsPanel = extraPanels?.find((panel) => panel.id === 'plugins')

  const renderExtraPanel = (panel: ExtraPanel) => {
    const isActive = activePanel === panel.id
    return (
      <Tooltip key={panel.id}>
        <TooltipTrigger asChild>
          <button
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg transition-all',
              isActive ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent',
            )}
            onClick={() => onPanelChange(panel.id)}
            type="button"
          >
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center transition-all',
                !isActive && 'opacity-50',
              )}
            >
              {panel.id === 'plugins' ? <Plus className="h-5 w-5" /> : panel.icon}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{panel.label}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div
      className={cn(
        'flex h-full w-11 flex-col items-center gap-1 border-border/50 border-r py-2',
        className,
      )}
    >
      {/* App menu slot */}
      {appMenuButton}

      {/* Divider */}
      <div className="mb-1 h-px w-8 bg-border/50" />

      {/* Site panel */}
      {[sitePanel].map((panel) => {
        const isActive = activePanel === panel.id
        return (
          <Tooltip key={panel.id}>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg transition-all',
                  isActive ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent',
                )}
                onClick={() => onPanelChange(panel.id)}
                type="button"
              >
                <img
                  alt={t(panel.labelKey)}
                  className={cn(
                    'h-6 w-6 object-contain transition-all',
                    !isActive && 'opacity-50 saturate-0',
                  )}
                  src={panel.iconSrc}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t(panel.labelKey)}</TooltipContent>
          </Tooltip>
        )
      })}

      {regularExtraPanels?.map(renderExtraPanel)}

      {/* Settings panel */}
      {[settingsPanel].map((panel) => {
        const isActive = activePanel === panel.id
        return (
          <Tooltip key={panel.id}>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg transition-all',
                  isActive ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent',
                )}
                onClick={() => onPanelChange(panel.id)}
                type="button"
              >
                <img
                  alt={t(panel.labelKey)}
                  className={cn(
                    'h-6 w-6 object-contain transition-all',
                    !isActive && 'opacity-50 saturate-0',
                  )}
                  src={panel.iconSrc}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t(panel.labelKey)}</TooltipContent>
          </Tooltip>
        )
      })}

      {(pluginPanels?.length || pluginsPanel) && (
        <div className="mt-1 flex w-9 flex-col items-center gap-1 border-border/70 border-t pt-2">
          {pluginPanels?.map(renderExtraPanel)}
          {pluginsPanel && renderExtraPanel(pluginsPanel)}
        </div>
      )}
    </div>
  )
}

export { panels }
