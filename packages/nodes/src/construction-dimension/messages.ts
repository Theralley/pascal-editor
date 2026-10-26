import { defineMessages } from '@pascal-app/editor'

export const messages = defineMessages({
  en: {
    title: 'Construction Dimension',

    'mode.linear': 'Linear',
    'mode.radius': 'Radius',
    'mode.diameter': 'Diameter',
    'mode.center-mark': 'Center mark',
    'mode.chord': 'Chord',
    'mode.arc-length': 'Arc length',
    'mode.angular': 'Angular',
    'mode.coordinate': 'Coordinate',

    'datum.centerline': 'Centerline',
    'datum.wall-face': 'Wall face',
    'datum.structural-face': 'Structural face',
    'datum.finish-face': 'Finish face',

    'terminator.architectural-tick': 'Architectural tick',
    'terminator.filled-arrow': 'Filled arrow',
    'terminator.open-arrow': 'Open arrow',
    'terminator.dot': 'Dot',

    'textPosition.above': 'Above line',
    'textPosition.centered': 'Centered on line',

    'precision.1': 'Nearest inch',
    'precision.1/2': 'Nearest 1/2 inch',
    'precision.1/4': 'Nearest 1/4 inch',
    'precision.1/8': 'Nearest 1/8 inch',
    'precision.1/16': 'Nearest 1/16 inch',

    'notation.meters': 'Meters',
    'notation.millimeters': 'Millimeters',

    'drawing.floor-plan': 'Floor plan',
    'drawing.foundation-plan': 'Foundation plan',
    'drawing.reflected-ceiling-plan': 'Reflected ceiling plan',
    'drawing.roof-plan': 'Roof plan',
    'drawing.site-plan': 'Site plan',

    'dimension.heading': 'Dimension',
    'dimension.mode': 'Mode',
    'dimension.featureCount': 'Feature count',
    'dimension.centerMark': 'Center mark',

    'coordination.heading': 'Drawing coordination',
    'coordination.primary': 'Primary drawing',
    'coordination.presentation': '{drawing} presentation',
    'coordination.shown': 'Shown',
    'coordination.omitted': 'Omitted',
    'coordination.controlled': 'Controlled by foundation',
    'coordination.linked':
      "Linked dimensions reuse the controller's associative anchors and update with it.",
    'coordination.suppressed': '{drawing} suppressed segments',
    'coordination.suppressedPlaceholder': 'e.g. 2, 4',
    'coordination.segmentNote':
      'Segment numbers are one-based and apply only in this drawing view.',
    'coordination.controller': 'Foundation controller',
    'coordination.controllerFallback': 'Foundation dimension',
    'coordination.noControllers': 'No foundation dimensions',

    'notation.heading': 'Notation',
    'notation.prefix': 'Prefix',
    'notation.suffix': 'Suffix',
    'notation.override': 'Text override',
    'notation.overridePlaceholder': 'Use measured value',

    'standards.heading': 'Standards',
    'standards.datum': 'Datum policy',
    'standards.terminator': 'Terminator',
    'standards.textPosition': 'Text position',
    'standards.imperial': 'Imperial precision',
    'standards.metric': 'Metric notation',
    'standards.gap': 'Extension gap',
    'standards.overshoot': 'Extension overshoot',

    'actions.heading': 'Actions',
    'actions.delete': 'Delete',
  },
  sv: {
    title: 'Konstruktionsmått',

    'mode.linear': 'Rakt',
    'mode.radius': 'Radie',
    'mode.diameter': 'Diameter',
    'mode.center-mark': 'Centrummarkering',
    'mode.chord': 'Korda',
    'mode.arc-length': 'Båglängd',
    'mode.angular': 'Vinkel',
    'mode.coordinate': 'Koordinat',

    'datum.centerline': 'Centrumlinje',
    'datum.wall-face': 'Väggyta',
    'datum.structural-face': 'Stomyta',
    'datum.finish-face': 'Ytskikt',

    'terminator.architectural-tick': 'Arkitektstreck',
    'terminator.filled-arrow': 'Fylld pil',
    'terminator.open-arrow': 'Öppen pil',
    'terminator.dot': 'Punkt',

    'textPosition.above': 'Ovanför linjen',
    'textPosition.centered': 'Centrerad på linjen',

    'precision.1': 'Närmaste tum',
    'precision.1/2': 'Närmaste 1/2 tum',
    'precision.1/4': 'Närmaste 1/4 tum',
    'precision.1/8': 'Närmaste 1/8 tum',
    'precision.1/16': 'Närmaste 1/16 tum',

    'notation.meters': 'Meter',
    'notation.millimeters': 'Millimeter',

    'drawing.floor-plan': 'Planritning',
    'drawing.foundation-plan': 'Grundplan',
    'drawing.reflected-ceiling-plan': 'Innertaksplan',
    'drawing.roof-plan': 'Takplan',
    'drawing.site-plan': 'Situationsplan',

    'dimension.heading': 'Mått',
    'dimension.mode': 'Läge',
    'dimension.featureCount': 'Antal delar',
    'dimension.centerMark': 'Centrummarkering',

    'coordination.heading': 'Ritningssamordning',
    'coordination.primary': 'Huvudritning',
    'coordination.presentation': 'Visning i {drawing}',
    'coordination.shown': 'Visas',
    'coordination.omitted': 'Utelämnas',
    'coordination.controlled': 'Styrs av grunden',
    'coordination.linked':
      'Länkade mått använder styrmåttets kopplade ankarpunkter och uppdateras med det.',
    'coordination.suppressed': 'Dolda delsträckor i {drawing}',
    'coordination.suppressedPlaceholder': 't.ex. 2, 4',
    'coordination.segmentNote':
      'Delsträckorna numreras från 1 och gäller bara i den här ritningsvyn.',
    'coordination.controller': 'Styrande grundmått',
    'coordination.controllerFallback': 'Grundmått',
    'coordination.noControllers': 'Inga grundmått',

    'notation.heading': 'Notation',
    'notation.prefix': 'Prefix',
    'notation.suffix': 'Suffix',
    'notation.override': 'Egen text',
    'notation.overridePlaceholder': 'Använd uppmätt värde',

    'standards.heading': 'Standarder',
    'standards.datum': 'Utgångsyta',
    'standards.terminator': 'Måttavslutning',
    'standards.textPosition': 'Textplacering',
    'standards.imperial': 'Noggrannhet i tum',
    'standards.metric': 'Metrisk notation',
    'standards.gap': 'Avstånd till hjälplinje',
    'standards.overshoot': 'Hjälplinjens överskott',

    'actions.heading': 'Åtgärder',
    'actions.delete': 'Ta bort',
  },
})
