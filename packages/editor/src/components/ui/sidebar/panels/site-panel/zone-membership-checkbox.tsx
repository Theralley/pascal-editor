import { Checkbox } from './../../../primitives/checkbox'
import { messages } from './messages'
import { useT } from '../../../../../i18n'

/** Membership toggle shown on zone rows while a unit is focused. */
export function ZoneMembershipCheckbox({
  checked,
  onToggle,
  unitName,
}: {
  checked: boolean
  onToggle: () => void
  unitName: string
}) {
  const t = useT(messages)
  return (
    <Checkbox
      aria-label={t('unit.membership', { unit: unitName })}
      checked={checked}
      className="mr-2"
      onCheckedChange={onToggle}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  )
}
