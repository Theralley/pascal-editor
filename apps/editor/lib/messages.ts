import { defineMessages } from '@pascal-app/editor'

export const messages = defineMessages({
  en: {
    'duplicate.conflict': 'This project changed since the page loaded. Reload and try again.',
    'duplicate.failed': 'Copy failed ({status})',
    'duplicate.unreachable': 'Could not reach the editor.',
    'importSrc.missing': 'Missing `src` parameter.',
    'importSrc.notAbsolute': 'The `src` parameter is not an absolute URL.',
    'importSrc.credentials': 'Credentials in the `src` URL are not allowed.',
    'importSrc.httpsOnly': 'Only https URLs can be imported.',
  },
  sv: {
    'duplicate.conflict': 'Projektet har ändrats sedan sidan laddades. Ladda om och försök igen.',
    'duplicate.failed': 'Kopieringen misslyckades ({status})',
    'duplicate.unreachable': 'Det gick inte att nå editorn.',
    'importSrc.missing': 'Parametern `src` saknas.',
    'importSrc.notAbsolute': 'Parametern `src` är inte en absolut URL.',
    'importSrc.credentials': 'Inloggningsuppgifter i `src`-adressen är inte tillåtna.',
    'importSrc.httpsOnly': 'Bara https-adresser kan importeras.',
  },
})
