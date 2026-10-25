import { defineMessages } from '../../../i18n'

export const messages = defineMessages({
  en: {
    'run.lengthLabel': 'Length:',
    'run.lengthPlaceholder': 'type a length',
    'run.tabDirection': 'Tab: direction',
    'run.enterPositive': 'Enter a positive length',
    'run.tooShort': 'Run must be at least {length} m',
    'run.clearanceTooSmall': 'Fitting clearance is too small for this connection',

    'compat.differentSystems': 'Different systems: {source} / {target}',
    'compat.transition': 'Transition needed: {source} / {target}',
    'compat.sizeUnavailable': 'Connection size unavailable',
    'compat.reducer': 'Reducer needed: {source}″ / {target}″',
    'compat.systemUnspecified': 'Size matches; system unspecified',
    'compat.match': 'Matching system and size: {system}',
  },
  sv: {
    'run.lengthLabel': 'Längd:',
    'run.lengthPlaceholder': 'skriv en längd',
    'run.tabDirection': 'Tab: riktning',
    'run.enterPositive': 'Ange en positiv längd',
    'run.tooShort': 'Dragningen måste vara minst {length} m',
    'run.clearanceTooSmall': 'Fritt utrymme för kopplingen är för litet för den här anslutningen',

    'compat.differentSystems': 'Olika system: {source} / {target}',
    'compat.transition': 'Övergång behövs: {source} / {target}',
    'compat.sizeUnavailable': 'Anslutningens storlek saknas',
    'compat.reducer': 'Reducering behövs: {source}″ / {target}″',
    'compat.systemUnspecified': 'Storleken stämmer; systemet är ospecificerat',
    'compat.match': 'Matchande system och storlek: {system}',
  },
})
