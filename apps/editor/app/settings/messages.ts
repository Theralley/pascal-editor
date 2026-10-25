import { defineMessages } from '@pascal-app/editor'

export const messages = defineMessages({
  en: {
    'back.allProjects': 'All projects',
    title: 'Settings',
    'instance.title': 'Instance',
    'instance.publicUrl': 'Public URL',
    'instance.version': 'Version',
    'instance.development': 'development',
    'instance.dataDirectory': 'Data directory',
    'agent.title': 'Connect an agent',
    'agent.sceneApi': 'Scene API',
    'agent.token': 'Agent token',
    'agent.configured': 'Configured',
    'agent.notConfigured': 'Not configured',
    'agent.hintConfigured':
      'Agents and scripts send the PASCAL_SCENE_API_TOKEN value in an Authorization: Bearer header.',
    'agent.hintNotConfigured':
      'Set PASCAL_SCENE_API_TOKEN on this instance, then send it in an Authorization: Bearer header from agents and scripts.',
    'account.title': 'Account',
    'account.signedIn': 'Signed in as the instance admin.',
    'account.signOut': 'Sign out',
    'preferences.title': 'Preferences',
    'about.title': 'About',
    'about.source': 'Source code',
    'about.documentation': 'Documentation',
  },
  sv: {
    'back.allProjects': 'Alla projekt',
    title: 'Inställningar',
    'instance.title': 'Instans',
    'instance.publicUrl': 'Offentlig URL',
    'instance.version': 'Version',
    'instance.development': 'utveckling',
    'instance.dataDirectory': 'Datakatalog',
    'agent.title': 'Anslut en agent',
    'agent.sceneApi': 'Scen-API',
    'agent.token': 'Agentnyckel',
    'agent.configured': 'Inställd',
    'agent.notConfigured': 'Inte inställd',
    'agent.hintConfigured':
      'Agenter och skript skickar värdet för PASCAL_SCENE_API_TOKEN i en Authorization: Bearer-header.',
    'agent.hintNotConfigured':
      'Ställ in PASCAL_SCENE_API_TOKEN på den här instansen och skicka den sedan i en Authorization: Bearer-header från agenter och skript.',
    'account.title': 'Konto',
    'account.signedIn': 'Inloggad som instansens administratör.',
    'account.signOut': 'Logga ut',
    'preferences.title': 'Inställningar',
    'about.title': 'Om',
    'about.source': 'Källkod',
    'about.documentation': 'Dokumentation',
  },
})
