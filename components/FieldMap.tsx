"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibre-worker";
import type { LngLatBoundsLike, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { Map, Marker } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import clsx from "clsx";
import { useCallback, useEffect, useRef } from "react";

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
  },
  layers: [{ id: "esri-satellite", type: "raster", source: "esri" }],
};

const BOUNDARY_SOURCE_ID = "field-boundary";

function boundsFromBoundary(boundary: GeoJSON.Polygon): LngLatBoundsLike {
  const ring = boundary.coordinates[0];
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export default function FieldMap({
  boundary,
  location,
  interactive,
  className,
}: {
  boundary: GeoJSON.Polygon | null;
  location: GeoJSON.Point | null;
  interactive: boolean;
  className?: string;
}) {
  // The outline is added imperatively (source + two layers) and the view is fitted to the
  // field in the same step, so both happen exactly once the style is usable. Note that the
  // polygon depends on MapLibre's Web Worker (GeoJSON is processed there); see
  // lib/maplibre-worker.ts for why that worker needs an explicit URL under Turbopack.
  const mapRef = useRef<MapRef>(null);

  const installBoundary = useCallback(
    (map: MapLibreMap) => {
      if (!boundary) return;

      if (!map.getSource(BOUNDARY_SOURCE_ID)) {
        map.addSource(BOUNDARY_SOURCE_ID, {
          type: "geojson",
          data: { type: "Feature", geometry: boundary, properties: {} },
        });
        map.addLayer({
          id: "field-boundary-fill",
          type: "fill",
          source: BOUNDARY_SOURCE_ID,
          paint: { "fill-color": "#0065f0", "fill-opacity": 0.2 },
        });
        map.addLayer({
          id: "field-boundary-line",
          type: "line",
          source: BOUNDARY_SOURCE_ID,
          paint: { "line-color": "#0065f0", "line-width": 1.5 },
        });
      }

      map.fitBounds(boundsFromBoundary(boundary), { padding: 24, maxZoom: 16, duration: 0 });
    },
    [boundary]
  );

  // Belt and braces alongside onLoad: poll `isStyleLoaded()` so the outline is installed even
  // if the style became ready before this component's handlers attached. `installBoundary`
  // checks for its source first, so running it twice is harmless. The console warning is the
  // only signal if the map never becomes ready (it is what exposed the missing worker).
  useEffect(() => {
    if (!boundary) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      const map = mapRef.current?.getMap();
      if (map?.isStyleLoaded()) {
        window.clearInterval(timer);
        installBoundary(map);
      } else if (++attempts > 100) {
        window.clearInterval(timer);
        console.warn("[FieldMap] map style never reported ready; field outline not drawn");
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [boundary, installBoundary]);

  if (!boundary && !location) {
    return (
      <div
        className={clsx(
          "flex items-center justify-center rounded-[14px] border-[0.88px] border-border-map bg-border-subtle text-sm text-text-secondary",
          className
        )}
      >
        No location recorded
      </div>
    );
  }

  const initialViewState = boundary
    ? {
        bounds: boundsFromBoundary(boundary),
        fitBoundsOptions: { padding: 40, maxZoom: 16 },
      }
    : {
        longitude: location!.coordinates[0],
        latitude: location!.coordinates[1],
        zoom: 15,
      };

  return (
    <div className={clsx("overflow-hidden rounded-[14px] border-[0.88px] border-border-map", className)}>
      <Map
        initialViewState={initialViewState}
        mapStyle={SATELLITE_STYLE}
        scrollZoom={interactive}
        dragPan={interactive}
        dragRotate={interactive}
        doubleClickZoom={interactive}
        touchZoomRotate={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        style={{ width: "100%", height: "100%" }}
        ref={mapRef}
        onLoad={(event) => installBoundary(event.target)}
      >
        {location ? (
          <Marker longitude={location.coordinates[0]} latitude={location.coordinates[1]} anchor="center">
            <span
              aria-hidden
              className="block h-[17px] w-[17px] rounded-full border-2 border-white"
              style={{
                background: "linear-gradient(135deg, #0065f0, #00d4f0)",
                boxShadow: "0 0 39.5px #0065f0",
              }}
            />
          </Marker>
        ) : null}
      </Map>
    </div>
  );
}
