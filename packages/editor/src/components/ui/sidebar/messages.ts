import { defineMessages } from '../../../i18n'

export const messages = defineMessages({
  en: {
    site: 'Site',
    settings: 'Settings',
    plugins: 'Plugins',
    loading: 'Loading…',
    'crashed.title': '"{label}" plugin crashed',
    'crashed.body':
      'This panel hit an error and was unloaded for this session. The rest of the editor is unaffected — reload to try again.',
  },
  sv: {
    site: 'Tomt',
    settings: 'Inställningar',
    plugins: 'Tillägg',
    loading: 'Laddar…',
    'crashed.title': 'Tillägget ”{label}” kraschade',
    'crashed.body':
      'Panelen stötte på ett fel och stängdes av för den här sessionen. Resten av editorn påverkas inte – ladda om sidan för att försöka igen.',
  },
})
