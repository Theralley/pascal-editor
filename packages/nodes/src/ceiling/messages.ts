import { defineMessages } from '@pascal-app/editor'

export const messages = defineMessages({
  en: {
    title: 'Ceiling',

    'height.heading': 'Height',
    'height.follows': 'Follows level',
    'height.custom': 'Custom height',
    'height.current': 'Currently {height}',
    'height.label': 'Height',
    'height.tooTall': 'Taller than this level ({height} available). Raise the level height first.',
    'height.limited':
      'Limited by the level to {height} — raise the level height for a taller ceiling.',
    'preset.low': 'Low ({size})',
    'preset.standard': 'Standard ({size})',
    'preset.high': 'High ({size})',
    'size.low': '2.4m',
    'size.standard': '2.5m',
    'size.high': '3.0m',

    'info.heading': 'Info',
    'info.area': 'Area',

    'holes.heading': 'Holes',
    'holes.hole': 'Hole {n}',
    'holes.editing': '(Editing)',
    'holes.points': '{n} pts',
    'holes.manual': 'Manual',
    'holes.autoElevator': 'Auto elevator cutout',
    'holes.autoStair': 'Auto stair cutout',
    'holes.done': 'Done',
    'holes.auto': 'Auto',
    'holes.none': 'No holes',
    'holes.cutOpening': 'Cut opening',
    'holes.add': 'Add Hole',

    move: 'Move',

    'role.paintedPart': 'Painted part',
  },
  sv: {
    title: 'Innertak',

    'height.heading': 'Höjd',
    'height.follows': 'Följer våningen',
    'height.custom': 'Egen höjd',
    'height.current': 'Just nu {height}',
    'height.label': 'Höjd',
    'height.tooTall':
      'Högre än den här våningen ({height} tillgängligt). Höj våningens höjd först.',
    'height.limited':
      'Begränsad av våningen till {height} — höj våningens höjd för ett högre innertak.',
    'preset.low': 'Lågt ({size})',
    'preset.standard': 'Standard ({size})',
    'preset.high': 'Högt ({size})',
    'size.low': '2,4 m',
    'size.standard': '2,5 m',
    'size.high': '3,0 m',

    'info.heading': 'Info',
    'info.area': 'Yta',

    'holes.heading': 'Hål',
    'holes.hole': 'Hål {n}',
    'holes.editing': '(redigeras)',
    'holes.points': '{n} punkter',
    'holes.manual': 'Manuellt',
    'holes.autoElevator': 'Automatiskt hål för hiss',
    'holes.autoStair': 'Automatiskt hål för trappa',
    'holes.done': 'Klart',
    'holes.auto': 'Auto',
    'holes.none': 'Inga hål',
    'holes.cutOpening': 'Skär ut öppning',
    'holes.add': 'Lägg till hål',

    move: 'Flytta',

    'role.paintedPart': 'Målad del',
  },
})
