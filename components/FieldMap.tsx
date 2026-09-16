"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { LngLatBoundsLike, StyleSpecification } from "maplibre-gl";
import { Layer, Map, Marker, Source } from "react-map-gl/maplibre";
import clsx from "clsx";
import { useState } from "react";

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
  // An inline style loads before <Source> subscribes to "styledata", so the source is never
  // added. Rendering the overlay only after onLoad guarantees the style is ready.
  const [styleLoaded, setStyleLoaded] = useState(false);

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
        onLoad={() => setStyleLoaded(true)}
      >
        {boundary && styleLoaded ? (
          <Source
            id="field-boundary"
            type="geojson"
            data={{ type: "Feature", geometry: boundary, properties: {} }}
          >
            <Layer
              id="field-boundary-fill"
              type="fill"
              paint={{ "fill-color": "#0065f0", "fill-opacity": 0.2 }}
            />
            <Layer
              id="field-boundary-line"
              type="line"
              paint={{ "line-color": "#0065f0", "line-width": 1 }}
            />
          </Source>
        ) : null}
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
