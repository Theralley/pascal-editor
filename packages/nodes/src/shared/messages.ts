import { defineMessages } from '@pascal-app/editor'

export const messages = defineMessages({
  en: {
    'hangers.heading': 'Individual hangers',
    'hangers.note':
      'Positions are measured along each path segment. Changing spacing regenerates the numbered slots.',
    'hangers.hanger': 'Hanger {n} · segment {segment}',
    'hangers.skip': 'Skip',
    'hangers.noSupport': 'No support within reach. Move the hanger or choose another host.',
    'hangers.position': 'Position (m)',
    'hangers.positionLabel': 'Hanger {n} position in metres',
    'hangers.supportLabel': 'Hanger {n} support',
    'hangers.automatic': 'Automatic support',
    'hangers.missing': 'Missing support',
    'hangers.reveal': 'Reveal support',

    'checks.heading': 'System checks',
    'checks.all': 'All findings',
    'checks.openEnd': 'Open ends',
    'checks.connectionMismatch': 'Connections',
    'checks.disconnectedBranch': 'Separate branches',
    'checks.possibleIntersection': 'Intersections',
    'checks.drainage': 'Drainage',
    'checks.unsupportedHanger': 'Hangers',
    'checks.allSystems': 'All systems',
    'checks.selectedTitle': 'Selected connected system',
    'checks.selected': {
      one: 'Selected: {count} run · {length} m',
      other: 'Selected: {count} runs · {length} m',
    },
    'checks.errors': 'Errors',
    'checks.warnings': 'Warnings',
    'checks.filter': 'Filter system checks',
    'checks.findings': 'System findings',
    'checks.finding': 'System finding',
    'checks.error': 'Error',
    'checks.warning': 'Warning',
    'checks.locate': 'Locate {name} ({id})',
    'checks.item': 'item',
    'checks.missingItem': 'Missing item',
    'checks.noneInCategory': 'No findings in this category',
    'checks.none': 'No findings',
    'checks.showAll': 'Show all findings',
    'checks.about': 'About these checks',
    'checks.aboutNote':
      'Open ends and separate branches may be intentional. Intersection checks use bounding boxes; inspect openings and clearances.',

    'finding.openConnection': 'Open connection: {port}',
    'finding.separateBranch':
      'Separate branch: no connection to the other branches of this system. Review whether this is intentional.',
    'finding.runIntersection': 'Possible run intersection. Inspect the highlighted runs.',
    'finding.wallIntersection':
      'Possible wall intersection. Check the wall opening and run clearance.',
    'finding.unsupportedHangers': {
      one: '{count} hanger without a support.',
      other: '{count} hangers without a support.',
    },

    'light.off': 'Turn light off',
    'light.on': 'Turn light on',

    'fitting.useMaterial': 'Use {material} for this fitting',
    'fitting.pvc': 'pvc',
    'fitting.abs': 'abs',
    'fitting.cast-iron': 'cast iron',
  },
  sv: {
    'hangers.heading': 'Enskilda upphängningar',
    'hangers.note':
      'Lägena mäts längs varje delsträcka. När avståndet ändras skapas de numrerade platserna om.',
    'hangers.hanger': 'Upphängning {n} · delsträcka {segment}',
    'hangers.skip': 'Hoppa över',
    'hangers.noSupport':
      'Inget stöd inom räckhåll. Flytta upphängningen eller välj en annan hållare.',
    'hangers.position': 'Läge (m)',
    'hangers.positionLabel': 'Läge för upphängning {n} i meter',
    'hangers.supportLabel': 'Stöd för upphängning {n}',
    'hangers.automatic': 'Automatiskt stöd',
    'hangers.missing': 'Stöd saknas',
    'hangers.reveal': 'Visa stödet',

    'checks.heading': 'Systemkontroller',
    'checks.all': 'Alla fynd',
    'checks.openEnd': 'Öppna ändar',
    'checks.connectionMismatch': 'Anslutningar',
    'checks.disconnectedBranch': 'Separata grenar',
    'checks.possibleIntersection': 'Korsningar',
    'checks.drainage': 'Avlopp',
    'checks.unsupportedHanger': 'Upphängningar',
    'checks.allSystems': 'Alla system',
    'checks.selectedTitle': 'Markerat sammankopplat system',
    'checks.selected': {
      one: 'Markerat: {count} sträcka · {length} m',
      other: 'Markerat: {count} sträckor · {length} m',
    },
    'checks.errors': 'Fel',
    'checks.warnings': 'Varningar',
    'checks.filter': 'Filtrera systemkontroller',
    'checks.findings': 'Systemfynd',
    'checks.finding': 'Systemfynd',
    'checks.error': 'Fel',
    'checks.warning': 'Varning',
    'checks.locate': 'Hitta {name} ({id})',
    'checks.item': 'objekt',
    'checks.missingItem': 'Objekt saknas',
    'checks.noneInCategory': 'Inga fynd i den här kategorin',
    'checks.none': 'Inga fynd',
    'checks.showAll': 'Visa alla fynd',
    'checks.about': 'Om kontrollerna',
    'checks.aboutNote':
      'Öppna ändar och separata grenar kan vara avsiktliga. Korsningskontrollerna använder omslutande lådor, så granska öppningar och fria avstånd själv.',

    'finding.openConnection': 'Öppen anslutning: {port}',
    'finding.separateBranch':
      'Separat gren: ingen anslutning till systemets andra grenar. Kontrollera om det är avsiktligt.',
    'finding.runIntersection': 'Möjlig korsning mellan sträckor. Granska de markerade sträckorna.',
    'finding.wallIntersection':
      'Möjlig korsning med en vägg. Kontrollera väggöppningen och det fria avståndet.',
    'finding.unsupportedHangers': {
      one: '{count} upphängning utan stöd.',
      other: '{count} upphängningar utan stöd.',
    },

    'light.off': 'Släck lampan',
    'light.on': 'Tänd lampan',

    'fitting.useMaterial': 'Använd {material} för den här rördelen',
    'fitting.pvc': 'PVC',
    'fitting.abs': 'ABS',
    'fitting.cast-iron': 'gjutjärn',
  },
})
