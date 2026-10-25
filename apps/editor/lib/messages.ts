import { defineMessages } from '@pascal-app/editor'

export const messages = defineMessages({
  en: {
    'duplicate.conflict': 'This project changed since the page loaded. Reload and try again.',
    'duplicate.failed': 'Copy failed ({status})',
    'duplicate.unreachable': 'Could not reach the editor.',
  },
  sv: {
    'duplicate.conflict': 'Projektet har ändrats sedan sidan laddades. Ladda om och försök igen.',
    'duplicate.failed': 'Kopieringen misslyckades ({status})',
    'duplicate.unreachable': 'Det gick inte att nå editorn.',
  },
})
