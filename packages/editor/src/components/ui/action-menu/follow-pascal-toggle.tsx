'use client'

import { Video } from 'lucide-react'
import { cn } from '../../../lib/utils'
import useFollowPascal from '../../../store/use-follow-pascal'
import { ActionButton } from './action-button'

/** The toolbar's switch for Follow Pascal: the camera follows what the agent builds. */
export function FollowPascalToggle({
  className,
  tooltipClassName,
}: {
  className?: string
  tooltipClassName?: string
}) {
  const on = useFollowPascal((state) => state.on)
  const setOn = useFollowPascal((state) => state.setOn)
  return (
    <ActionButton
      aria-pressed={on}
      className={cn(
        on
          ? 'bg-selection-subtle text-selection-text'
          : 'hover:bg-control hover:text-selection-text',
        className,
      )}
      label={`Follow Pascal: ${on ? 'On' : 'Off'}`}
      onClick={() => setOn(!on)}
      size="icon"
      tooltipClassName={tooltipClassName}
      variant="ghost"
    >
      <Video className="h-6 w-6" />
    </ActionButton>
  )
}
