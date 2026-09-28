import * as Cesium from 'cesium';
export const MAP_STACKS = [
  {
    id: 'photoreal',
    label: 'Google 3D',
    shortLabel: '3D',
    kind: 'photoreal',
    requiresIon: false,
  },
  {
    id: 'bing-aerial',
    label: 'Bing Aerial',
    shortLabel: 'Aerial',
    kind: 'ion',
    style: Cesium.IonWorldImageryStyle.AERIAL,
    requiresIon: true,
  },
  {
    id: 'bing-labels',
    label: 'Bing Labels',
    shortLabel: 'Labels',
    kind: 'ion',
    style: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS,
    requiresIon: true,
  },
  {
    id: 'esri-imagery',
    label: 'Esri Satellite',
    shortLabel: 'SAT',
    kind: 'esri-imagery',
    requiresIon: false,
  },
  {
    id: 'osm',
    label: 'OSM',
    shortLabel: 'OSM',
    kind: 'osm',
    requiresIon: false,
  },
  /*
   * The last link in the chain, and the only one that cannot fail: it is
   * drawn locally. Listed so the controller's existing fallback machinery can
   * resolve it by id like any other stack, and so a presenter can select it
   * deliberately when a venue's network is known to be hostile.
   */
  {
    id: 'offline',
    label: 'Offline grid',
    shortLabel: 'GRID',
    kind: 'offline',
    requiresIon: false,
  },
];
