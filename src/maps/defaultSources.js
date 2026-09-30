import { MAP_STACKS } from './catalog.js';
import { photorealUnavailableReason } from './availability.js';
import { keySetupRequirement } from '../keySetupCore.mjs';
import {
  createOsmImagery,
  createEsriImagery,
  createIonImagery,
  ESRI_ATTRIBUTION_HTML,
} from './imagery.js';
import { createOfflineImagery, OFFLINE_CREDIT } from './offlineImagery.js';
import {
  createWorldTerrain,
  createKeylessTerrain,
  createFlatTerrain,
} from './terrain.js';

/** Select sources and setup guidance without putting provider branches in the controller. */
export function createDefaultMapSources({
  googleTileset = null,
  cesiumToken = '',
  googleApiKey = '',
} = {}) {
  const ionToken = String(cesiumToken || '').trim();
  const hasIon = Boolean(ionToken);
  const hasGoogle = Boolean(String(googleApiKey || '').trim());
  const terrain = {
    id: hasIon ? 'world' : 'keyless',
    create: hasIon
      ? (request) => createWorldTerrain(ionToken, request)
      : createKeylessTerrain,
  };
  return {
    defaultId: googleTileset ? 'photoreal' : 'esri-imagery',
    unknownId: 'photoreal',
    recoveryId: googleTileset ? 'photoreal' : null,
    state: { hasCesiumIonToken: hasIon },
    sources: MAP_STACKS.map((descriptor) => {
      const common = {
        descriptor,
        available: !descriptor.requiresIon || hasIon,
        unavailableReason: descriptor.requiresIon
          ? keySetupRequirement('cesium-ion')
          : null,
      };
      if (descriptor.kind === 'photoreal')
        return {
          ...common,
          available: Boolean(googleTileset),
          unavailableReason: photorealUnavailableReason(hasIon || hasGoogle),
          tileset: googleTileset,
        };
      const imagery =
        descriptor.kind === 'ion'
          ? () => createIonImagery(descriptor.style, ionToken)
          : descriptor.kind === 'offline'
            ? createOfflineImagery
            : descriptor.id === 'osm'
              ? createOsmImagery
              : createEsriImagery;
      return {
        ...common,
        imagery,
        /*
         * THE OFFLINE GRID USES FLAT TERRAIN. Quantized-mesh terrain is a
         * network request like any other, so pairing a no-network basemap
         * with a provider that has to reach one would leave the globe waiting
         * on the thing that already failed.
         */
        terrain:
          descriptor.kind === 'offline'
            ? { id: 'flat', create: createFlatTerrain }
            : terrain,
        ...(descriptor.kind === 'offline'
          ? { credit: OFFLINE_CREDIT, available: true }
          : {}),
        ...(descriptor.id === 'esri-imagery'
          ? {
              credit: ESRI_ATTRIBUTION_HTML,
              constructionFallback: {
                id: 'osm',
                message: 'Esri Satellite is unavailable; using OSM',
              },
              tileFailureFallback: {
                id: 'osm',
                /*
                 * An outage fails every tile a view asks for (a 1280x720 view
                 * asks for 20-40) within seconds. A flaky or rate-limited
                 * network fails a handful at once and recovers. Twelve inside
                 * 20 s is an outage; fewer is a bad moment, and a presentation
                 * keeps its imagery through it.
                 */
                threshold: 12,
                windowMs: 20000,
                message: 'Esri Satellite tile requests failed; using OSM',
              },
            }
          : {}),
        /*
         * THE CHAIN NOW HAS A FLOOR. It used to be Esri → OSM → nothing, and
         * "nothing" is a bare blue ellipsoid with the country invisible on
         * it. Every Stage 7 screenshot was of that failure mode, because this
         * sandbox blocks every tile host — the same thing a venue's captive
         * portal or a dead provider produces. A provider outage must not be
         * able to end a presentation.
         */
        ...(descriptor.id === 'osm'
          ? {
              constructionFallback: {
                id: 'offline',
                message:
                  'No imagery provider reachable; using the offline grid',
              },
              tileFailureFallback: {
                id: 'offline',
                threshold: 12,
                windowMs: 20000,
                message: 'OSM tile requests failed; using the offline grid',
              },
            }
          : {}),
      };
    }),
  };
}
