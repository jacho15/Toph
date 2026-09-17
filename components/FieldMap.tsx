"use client";

import "maplibre-gl/dist/maplibre-gl.css";
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
  // The declarative <Source>/<Layer>components never rendered the outline here: with an inline
  // style object the style finishes loading before those components subscribe to "styledata",
  // and a raster-only style fires no further style events, so the source was never added.
  // Adding the source/layers imperatively in "load" (and fitting bounds there too) removes that
  // race entirely.
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

  // Two entry points on purpose: "load" covers the normal case, and this effect covers a map
  // instance that was already loaded before this component mounted (e.g. a remount while the
  // style is cached). `installBoundary` is idempotent — it checks for the source first.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (map.isStyleLoaded()) {
      installBoundary(map);
    } else {
      map.once("load", () => installBoundary(map));
    }
  }, [installBoundary]);

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
