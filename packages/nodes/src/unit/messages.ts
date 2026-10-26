import { defineMessages } from '@pascal-app/editor'

export const messages = defineMessages({
  en: {
    title: 'Unit',
    'kind.apartment': 'Apartment',
    'kind.hotel-room': 'Hotel room',
    'kind.commercial': 'Commercial',
    'kind.common': 'Common',

    'unit.heading': 'Unit',
    'unit.name': 'Name',
    'unit.kind': 'Kind',
    'unit.color': 'Color',

    'members.heading': 'Members',
    'members.empty':
      "No rooms yet. Pick this unit from a room's panel, or draw zones while it is focused.",
    'members.room': 'Room',
    'members.zone': 'Zone',
    'members.zoneName': 'zone',
    'members.remove': 'Remove {name} from unit',
    'warning.nonAdjacent': 'Members sit on levels that are not adjacent.',
    'warning.noZones': 'No zones assigned yet.',

    'report.heading': 'Report',
    'report.members': 'Members',
    'report.levels': 'Levels',
    'report.grossArea': 'Gross area',

    'actions.heading': 'Actions',
    'actions.focus': 'Focus',
    'actions.delete': 'Delete',
  },
  sv: {
    title: 'Enhet',
    'kind.apartment': 'Lägenhet',
    'kind.hotel-room': 'Hotellrum',
    'kind.commercial': 'Lokal',
    'kind.common': 'Gemensam',

    'unit.heading': 'Enhet',
    'unit.name': 'Namn',
    'unit.kind': 'Typ',
    'unit.color': 'Färg',

    'members.heading': 'Medlemmar',
    'members.empty':
      'Inga rum ännu. Välj den här enheten i ett rums panel, eller rita zoner medan den är i fokus.',
    'members.room': 'Rum',
    'members.zone': 'Zon',
    'members.zoneName': 'zon',
    'members.remove': 'Ta bort {name} från enheten',
    'warning.nonAdjacent': 'Medlemmarna finns på våningar som inte ligger intill varandra.',
    'warning.noZones': 'Inga zoner har tilldelats ännu.',

    'report.heading': 'Rapport',
    'report.members': 'Medlemmar',
    'report.levels': 'Våningar',
    'report.grossArea': 'Bruttoarea',

    'actions.heading': 'Åtgärder',
    'actions.focus': 'Fokusera',
    'actions.delete': 'Ta bort',
  },
})
