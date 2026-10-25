import { defineMessages } from '@pascal-app/editor'

export const messages = defineMessages({
  en: {
    title: 'Sign in to this editor',
    description: 'Enter the admin password set for this instance.',
    password: 'Password',
    tooMany: 'Too many attempts. Try again in a minute.',
    wrong: 'That password is not right.',
    unreachable: 'Could not reach the editor.',
    signingIn: 'Signing in…',
    signIn: 'Sign in',
  },
  sv: {
    title: 'Logga in på den här editorn',
    description: 'Ange administratörslösenordet som är satt för den här installationen.',
    password: 'Lösenord',
    tooMany: 'För många försök. Försök igen om en minut.',
    wrong: 'Lösenordet stämmer inte.',
    unreachable: 'Det gick inte att nå editorn.',
    signingIn: 'Loggar in…',
    signIn: 'Logga in',
  },
})
