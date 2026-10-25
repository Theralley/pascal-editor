import { defineMessages } from '../../../i18n'

export const messages = defineMessages({
  en: {
    advanced: 'Advanced',
    rooms: 'Rooms',
    roomsHint: 'walls · floor · ceiling',
    idleCaption: 'Pick a shape to start. Every room brings its own walls, floor and ceiling.',
    'rectangle.label': 'Rectangle',
    'rectangle.title': 'Rectangle room',
    'rectangle.caption':
      '<lead>Click two corners</lead> on the grid. Walls, floor and ceiling are created together.',
    'polygon.label': 'Polygon',
    'polygon.title': 'Polygon room',
    'polygon.caption':
      '<lead>Click each corner,</lead> then the first one again to close. For L-shapes and angled rooms.',
    'walls.label': 'Walls',
    'walls.title': 'Walls',
    'walls.caption':
      '<lead>Draw one wall at a time.</lead> Close a loop and it becomes a room; leave it open for partitions.',
  },
  sv: {
    advanced: 'Avancerat',
    rooms: 'Rum',
    roomsHint: 'väggar · golv · innertak',
    idleCaption: 'Välj en form för att börja. Varje rum får egna väggar, golv och innertak.',
    'rectangle.label': 'Rektangel',
    'rectangle.title': 'Rektangulärt rum',
    'rectangle.caption':
      '<lead>Klicka på två hörn</lead> på rutnätet. Väggar, golv och innertak skapas tillsammans.',
    'polygon.label': 'Polygon',
    'polygon.title': 'Polygonrum',
    'polygon.caption':
      '<lead>Klicka på varje hörn</lead> och sedan på det första igen för att sluta rummet. För L-former och snedvinklade rum.',
    'walls.label': 'Väggar',
    'walls.title': 'Väggar',
    'walls.caption':
      '<lead>Rita en vägg i taget.</lead> Sluter du en ring blir den ett rum. Lämna den öppen för mellanväggar.',
  },
})
