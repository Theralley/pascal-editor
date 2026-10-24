'use client'

import { type KeyboardEvent, useRef } from 'react'
import { cn } from '../../../lib/utils'

type SegmentedOption<T extends string> = {
  label: React.ReactNode
  value: T
  disabled?: boolean
}

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  /**
   * `disabled` greys one option and ignores its click; it stays hoverable, so a tooltip in its
   * `label` can say why.
   */
  options: SegmentedOption<T>[]
  className?: string
  disabled?: boolean
  mixed?: boolean
  /**
   * Makes the control a radio group: its options become radios and the arrow keys move between
   * them. Without it the options stay toggle buttons.
   */
  radio?: boolean
  'aria-label'?: string
}

const ARROW_STEP: Record<string, 1 | -1> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
}

/** The option an arrow key moves to from `from`: the next enabled one in that direction, wrapping. */
export function arrowTarget<T extends string>(
  options: readonly SegmentedOption<T>[],
  from: number,
  key: string,
): number | null {
  const step = ARROW_STEP[key]
  if (!step) return null
  for (let offset = 1; offset <= options.length; offset++) {
    const index = (from + step * offset + options.length * offset) % options.length
    if (!options[index]?.disabled) return index
  }
  return null
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  disabled = false,
  mixed = false,
  radio = false,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const radios = radio
  // Only one radio sits in the tab order: the selected one, else the first that can be chosen.
  const selectedIndex = mixed ? -1 : options.findIndex((option) => option.value === value)
  const tabIndex = selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled)

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!radios || disabled) return
    const target = arrowTarget(options, index, event.key)
    if (target === null || target === index) return
    event.preventDefault()
    buttons.current[target]?.focus()
    const option = options[target]
    if (option) onChange(option.value)
  }

  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        'flex min-h-9 w-full items-stretch rounded-lg border border-border/50 bg-black/4 dark:bg-[#2C2C2E] p-[3px]',
        disabled && 'opacity-60',
        className,
      )}
      role={radios ? 'radiogroup' : ariaLabel ? 'group' : undefined}
    >
      {options.map((option, index) => {
        const isSelected = !mixed && value === option.value
        const isDisabled = disabled || option.disabled === true
        return (
          <button
            aria-checked={radios ? isSelected : undefined}
            aria-disabled={option.disabled || undefined}
            aria-pressed={radios ? undefined : isSelected}
            className={cn(
              'relative flex min-h-7 min-w-0 flex-1 items-center justify-center rounded-md px-1.5 py-1 font-medium text-xs leading-4 transition-colors duration-200',
              isSelected
                ? 'bg-white dark:bg-[#3e3e3e] text-foreground shadow-sm ring-1 ring-border/50'
                : 'text-muted-foreground hover:bg-black/4 dark:hover:bg-white/5 hover:text-foreground',
              isDisabled &&
                'cursor-not-allowed hover:bg-transparent hover:text-muted-foreground dark:hover:bg-transparent',
              option.disabled && 'opacity-40',
            )}
            disabled={disabled}
            key={option.value}
            onClick={() => {
              if (!option.disabled) onChange(option.value)
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            ref={(element) => {
              buttons.current[index] = element
            }}
            role={radios ? 'radio' : undefined}
            tabIndex={radios ? (index === tabIndex ? 0 : -1) : undefined}
            type="button"
          >
            <span className="relative z-10 flex min-w-0 items-center justify-center gap-1.5 whitespace-normal text-center [&>svg]:shrink-0">
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
