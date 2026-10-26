import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '../../../../../components/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../../../components/ui/primitives/dialog'
import { Slider } from '../../../../../components/ui/slider'
import { useLocale, useT } from '../../../../../i18n'
import { formatPercent } from '../../../../../lib/measurements'
import useAudio from '../../../../../store/use-audio'
import { messages } from './messages'

export function AudioSettingsDialog() {
  const t = useT(messages)
  const locale = useLocale()
  const {
    masterVolume,
    sfxVolume,
    radioVolume,
    muted,
    setMasterVolume,
    setSfxVolume,
    setRadioVolume,
    toggleMute,
  } = useAudio()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full justify-start gap-2" variant="outline">
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          {t('audio.title')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('audio.title')}</DialogTitle>
          <DialogDescription>{t('audio.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Master Volume */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-medium text-sm">{t('audio.master')}</label>
              <span className="text-muted-foreground text-sm">{formatPercent(masterVolume, locale)}</span>
            </div>
            <Slider
              max={100}
              onValueChange={(value) => value[0] !== undefined && setMasterVolume(value[0])}
              step={1}
              value={[masterVolume]}
            />
          </div>

          {/* Radio Volume */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-medium text-sm">{t('audio.radio')}</label>
              <span className="text-muted-foreground text-sm">{formatPercent(radioVolume, locale)}</span>
            </div>
            <Slider
              max={100}
              onValueChange={(value) => value[0] !== undefined && setRadioVolume(value[0])}
              step={1}
              value={[radioVolume]}
            />
          </div>

          {/* SFX Volume */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-medium text-sm">{t('audio.effects')}</label>
              <span className="text-muted-foreground text-sm">{formatPercent(sfxVolume, locale)}</span>
            </div>
            <Slider
              max={100}
              onValueChange={(value) => value[0] !== undefined && setSfxVolume(value[0])}
              step={1}
              value={[sfxVolume]}
            />
          </div>

          {/* Mute Toggle */}
          <div className="border-t pt-4">
            <Button
              className="w-full justify-start gap-2"
              onClick={toggleMute}
              variant={muted ? 'default' : 'outline'}
            >
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              {muted ? t('audio.unmute') : t('audio.mute')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
