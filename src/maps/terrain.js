import * as Cesium from 'cesium';

/** These factories are lazy: a hidden globe must not trigger terrain loading. */
export async function createWorldTerrain(accessToken, { signal } = {}) {
  accessToken = String(accessToken || '').trim();
  if (!accessToken)
    throw new Error('World terrain requires an explicit ion token');
  signal?.throwIfAborted();
  const resource = await Cesium.IonResource.fromAssetId(1, { accessToken });
  signal?.throwIfAborted();
  return {
    provider: await Cesium.CesiumTerrainProvider.fromUrl(resource, {
      requestVertexNormals: true,
      requestWaterMask: false,
      ellipsoid: Cesium.Ellipsoid.WGS84,
    }),
  };
}

export async function createKeylessTerrain() {
  try {
    // Re:Earth / Mapterhorn ellipsoidal quantized mesh, CC BY 4.0.
    return {
      provider: await Cesium.CesiumTerrainProvider.fromUrl(
        'https://terrain.reearth.land/cesium-mesh/ellipsoid',
      ),
    };
  } catch (error) {
    console.warn(
      '[MapStack] Re:Earth terrain unavailable, falling back to flat ellipsoid terrain:',
      error,
    );
    return { provider: new Cesium.EllipsoidTerrainProvider() };
  }
}

/**
 * No network at all. The offline basemap pairs with this rather than with the
 * keyless mesh, because that mesh is itself a fetch: behind a captive portal
 * it neither loads nor fails promptly, and the globe waits on it.
 */
export function createFlatTerrain() {
  return { provider: new Cesium.EllipsoidTerrainProvider() };
}
