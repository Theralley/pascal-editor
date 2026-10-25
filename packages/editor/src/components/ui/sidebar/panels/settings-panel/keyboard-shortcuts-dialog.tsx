import { Keyboard } from 'lucide-react'
import { Button } from './../../../../../components/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './../../../../../components/ui/primitives/dialog'
import { type MessageKey, useT } from './../../../../../i18n'
import { VIEW_SHORTCUT_KEYS } from './../../../../../lib/view-shortcuts'
import {
  ShortcutToken,
  shortcutDisplayValue,
} from './../../../../../components/ui/primitives/shortcut-token'
import { messages } from './messages'

type MessageId = MessageKey<typeof messages>

type Shortcut = {
  keys: string[]
  action: MessageId
  note?: MessageId
}

type ShortcutCategory = {
  title: MessageId
  shortcuts: Shortcut[]
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: 'shortcuts.navigation',
    shortcuts: [
      { keys: ['1'], action: 'shortcut.goSite' },
      { keys: ['2'], action: 'shortcut.goBuilding' },
      { keys: ['\\'], action: 'shortcut.splitView' },
      { keys: ['F'], action: 'shortcut.itemsCatalog' },
      { keys: ['Z'], action: 'shortcut.drawZone' },
      { keys: ['Cmd/Ctrl', 'Arrow Up'], action: 'shortcut.levelNext' },
      { keys: ['Cmd/Ctrl', 'Arrow Down'], action: 'shortcut.levelPrevious' },
      { keys: ['Cmd/Ctrl', 'B'], action: 'shortcut.toggleSidebar' },
    ],
  },
  {
    title: 'shortcuts.modes',
    shortcuts: [
      { keys: ['V'], action: 'shortcut.selectMode' },
      { keys: ['B'], action: 'shortcut.buildMode' },
      { keys: ['M'], action: 'shortcut.lastMeasurement' },
      { keys: ['X'], action: 'shortcut.deleteMode' },
      { keys: ['Esc'], action: 'shortcut.cancelTool', note: 'shortcut.cancelTool.note' },
      { keys: ['Delete / Backspace'], action: 'shortcut.deleteSelected' },
      { keys: ['Cmd/Ctrl', 'Z'], action: 'shortcut.undo' },
      { keys: ['Cmd/Ctrl', 'Shift', 'Z'], action: 'shortcut.redo' },
      { keys: ['Cmd/Ctrl', 'S'], action: 'shortcut.save' },
    ],
  },
  {
    title: 'shortcuts.selection',
    shortcuts: [
      { keys: ['Cmd/Ctrl', 'C'], action: 'shortcut.copy', note: 'shortcut.copy.note' },
      { keys: ['Cmd/Ctrl', 'X'], action: 'shortcut.cut', note: 'shortcut.cut.note' },
      { keys: ['Cmd/Ctrl', 'V'], action: 'shortcut.paste', note: 'shortcut.paste.note' },
      {
        keys: ['Cmd/Ctrl', 'Left click'],
        action: 'shortcut.multiToggle',
        note: 'shortcut.multiToggle.note',
      },
      {
        keys: ['Shift', 'Left click'],
        action: 'shortcut.canvasMultiToggle',
        note: 'shortcut.canvasMultiToggle.note',
      },
      { keys: ['Left click'], action: 'shortcut.moveMulti', note: 'shortcut.moveMulti.note' },
      { keys: ['R', 'T'], action: 'shortcut.rotateMulti', note: 'shortcut.rotateMulti.note' },
      { keys: ['Cmd/Ctrl', 'G'], action: 'shortcut.group', note: 'shortcut.group.note' },
      {
        keys: ['Cmd/Ctrl', 'Shift', 'G'],
        action: 'shortcut.ungroup',
        note: 'shortcut.ungroup.note',
      },
      { keys: ['Esc'], action: 'shortcut.clearSelection', note: 'shortcut.clearSelection.note' },
    ],
  },
  {
    title: 'shortcuts.directManipulation',
    shortcuts: [
      {
        keys: ['Cmd/Ctrl', 'Left click'],
        action: 'shortcut.moveUnderCursor',
        note: 'shortcut.moveUnderCursor.note',
      },
      {
        keys: ['Cmd/Ctrl', 'Right click'],
        action: 'shortcut.rotateUnderCursor',
        note: 'shortcut.rotateUnderCursor.note',
      },
      {
        keys: ['Cmd/Ctrl', 'Shift', 'Right click'],
        action: 'shortcut.rotateFreely',
        note: 'shortcut.rotateFreely.note',
      },
    ],
  },
  {
    title: 'shortcuts.drawing',
    shortcuts: [
      // Shift and Ctrl each mean one thing held and another tapped, and only
      // the hold was documented — which read as the taps not existing. Both
      // taps are listed first because they are the ones nobody discovers.
      { keys: ['Shift'], action: 'shortcut.cycleSnapping', note: 'shortcut.cycleSnapping.note' },
      { keys: ['Cmd/Ctrl'], action: 'shortcut.cycleGrid', note: 'shortcut.cycleGrid.note' },
      {
        keys: ['Shift'],
        action: 'shortcut.bypassSnapping',
        note: 'shortcut.bypassSnapping.note',
      },
      {
        keys: ['Shift'],
        action: 'shortcut.bypassRotationSnap',
        note: 'shortcut.bypassRotationSnap.note',
      },
    ],
  },
  {
    title: 'shortcuts.placement',
    shortcuts: [
      { keys: ['R', 'T'], action: 'shortcut.rotateItem' },
      { keys: ['E'], action: 'shortcut.operate' },
      {
        keys: ['Shift'],
        action: 'shortcut.bypassPlacement',
        note: 'shortcut.bypassPlacement.note',
      },
    ],
  },
  {
    title: 'shortcuts.view',
    shortcuts: [
      { keys: [VIEW_SHORTCUT_KEYS.wallsUp.toUpperCase()], action: 'shortcut.wallsUp' },
      { keys: [VIEW_SHORTCUT_KEYS.wallsDown.toUpperCase()], action: 'shortcut.wallsDown' },
      { keys: [VIEW_SHORTCUT_KEYS.roofs.toUpperCase()], action: 'shortcut.roofs' },
    ],
  },
  {
    title: 'shortcuts.camera',
    shortcuts: [
      { keys: ['W', 'A', 'S', 'D'], action: 'shortcut.pan', note: 'shortcut.pan.note' },
      { keys: ['Middle click'], action: 'shortcut.pan', note: 'shortcut.panMiddle.note' },
      { keys: ['Right click'], action: 'shortcut.orbit', note: 'shortcut.orbit.note' },
    ],
  },
]

function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {keys.map((key, index) => (
        <div className="flex items-center gap-1" key={`${key}-${index}`}>
          {index > 0 ? <span className="text-[10px] text-muted-foreground">+</span> : null}
          <ShortcutToken displayValue={shortcutDisplayValue(key)} value={key} />
        </div>
      ))}
    </div>
  )
}

export function KeyboardShortcutsDialog() {
  const t = useT(messages)
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full justify-start gap-2" variant="outline">
          <Keyboard className="size-4" />
          {t('shortcuts.title')}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{t('shortcuts.title')}</DialogTitle>
          <DialogDescription>{t('shortcuts.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {SHORTCUT_CATEGORIES.map((category) => (
            <section className="space-y-2" key={category.title}>
              <h3 className="font-medium text-sm">{t(category.title)}</h3>
              <div className="overflow-hidden rounded-md border border-border/80">
                {category.shortcuts.map((shortcut, index) => (
                  <div
                    className="grid grid-cols-[minmax(130px,220px)_1fr] gap-3 px-3 py-2"
                    key={`${category.title}-${index}`}
                  >
                    <ShortcutKeys keys={shortcut.keys} />
                    <div>
                      <p className="text-sm">{t(shortcut.action)}</p>
                      {shortcut.note ? (
                        <p className="text-muted-foreground text-xs">{t(shortcut.note)}</p>
                      ) : null}
                    </div>
                    {index < category.shortcuts.length - 1 ? (
                      <div className="col-span-2 border-border/60 border-b" />
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
