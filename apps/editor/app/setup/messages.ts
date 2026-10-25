import { defineMessages } from '@pascal-app/editor'

export const messages = defineMessages({
  en: {
    title: 'This editor is reachable but not protected yet',
    description:
      'Set an admin password in the environment and restart. Until then, nothing is served from this address.',
    password: 'The password that unlocks this editor. Required on a network host.',
    publicUrl: 'The address people use to reach it, for example https://pascal.example.com.',
    token: 'Optional. A bearer token for agents and scripts calling the scene API.',
    proxy: 'Alternative to a password when a reverse proxy already authenticates every request.',
  },
  sv: {
    title: 'Editorn går att nå men är inte skyddad ännu',
    description:
      'Ange ett administratörslösenord i miljön och starta om. Tills dess levereras ingenting från den här adressen.',
    password: 'Lösenordet som låser upp editorn. Krävs på en värd i nätverk.',
    publicUrl:
      'Adressen som folk använder för att nå den, till exempel https://pascal.example.com.',
    token: 'Valfritt. En bearer-token för agenter och skript som anropar scen-API:t.',
    proxy: 'Ett alternativ till lösenord när en omvänd proxy redan autentiserar varje anrop.',
  },
})
