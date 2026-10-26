import { defineMessages } from '@pascal-app/editor'

export const messages = defineMessages({
  en: {
    'plan.unavailable': 'Zone boundary unavailable',
    'plan.label': 'Top view with zone edge dimensions',

    'quantity.notProven': 'Not proven',
    'quantity.noSlab': 'No slab coverage proves this zone.',
    'quantity.noCeiling': 'No ceiling coverage proves this zone.',
    'quantity.slabsDiffer': 'Slabs covering this zone have different elevations.',
    'quantity.ceilingsDiffer': 'Ceilings covering this zone have different heights.',
    'quantity.openingRemoves': 'A surface opening removes this zone.',
    'quantity.openingCrosses': 'A surface opening crosses the zone boundary.',
    'quantity.enclosureOpen': 'The room enclosure is open.',
    'quantity.noWalls': 'No indoor-facing wall surface is proven within this zone.',
    'quantity.ceilingBelow': 'The matching ceiling is not above the slab surface.',
    'quantity.wallNote':
      'Gross indoor-facing wall surface within this zone, including both sides of interior partitions.',
    'quantity.floorNote': 'Zone floor surface proven by compatible slab coverage, after openings.',
    'quantity.volumeNote': 'Proven zone floor area multiplied by clear ceiling height.',

    'unit.heading': 'Unit',
    'unit.none': 'None',
    'unit.fallback': 'Unit',

    'quantities.room': 'Room quantities',
    'quantities.zone': 'Zone quantities',
    'quantities.enclosed': 'Enclosed room',
    'quantities.footprint': 'Footprint only',
    'quantities.showMetric': 'Show in m²',
    'quantities.showImperial': 'Show in ft²',
    'quantities.wallSurface': 'Wall surface',
    'quantities.floorSurface': 'Floor surface',
    'quantities.volume': 'Volume',
  },
  sv: {
    'plan.unavailable': 'Zonens gräns saknas',
    'plan.label': 'Ovanifrån med måtten på zonens kanter',

    'quantity.notProven': 'Ej styrkt',
    'quantity.noSlab': 'Inget bjälklag täcker den här zonen.',
    'quantity.noCeiling': 'Inget innertak täcker den här zonen.',
    'quantity.slabsDiffer': 'Bjälklagen som täcker den här zonen ligger på olika höjd.',
    'quantity.ceilingsDiffer': 'Innertaken som täcker den här zonen har olika höjd.',
    'quantity.openingRemoves': 'Ett hål i ytan tar bort hela zonen.',
    'quantity.openingCrosses': 'Ett hål i ytan korsar zonens gräns.',
    'quantity.enclosureOpen': 'Rummet är inte avgränsat av väggar.',
    'quantity.noWalls': 'Ingen väggyta mot insidan kan styrkas inom den här zonen.',
    'quantity.ceilingBelow': 'Innertaket ligger inte ovanför bjälklagets yta.',
    'quantity.wallNote':
      'Total väggyta mot insidan inom zonen, med båda sidorna av invändiga mellanväggar.',
    'quantity.floorNote': 'Zonens golvyta som styrks av bjälklag som passar ihop, efter hål.',
    'quantity.volumeNote': 'Styrkt golvyta i zonen multiplicerad med fri takhöjd.',

    'unit.heading': 'Enhet',
    'unit.none': 'Ingen',
    'unit.fallback': 'Enhet',

    'quantities.room': 'Rumsmängder',
    'quantities.zone': 'Zonmängder',
    'quantities.enclosed': 'Slutet rum',
    'quantities.footprint': 'Endast golvyta',
    'quantities.showMetric': 'Visa i m²',
    'quantities.showImperial': 'Visa i ft²',
    'quantities.wallSurface': 'Väggyta',
    'quantities.floorSurface': 'Golvyta',
    'quantities.volume': 'Volym',
  },
})
