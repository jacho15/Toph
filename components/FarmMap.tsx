"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { LngLatBoundsLike, StyleSpecification } from "maplibre-gl";
import { Layer, Map, Marker, Source } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import Link from "next/link";
import clsx from "clsx";
import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { formatActivityLabel, formatLogDate } from "@/lib/format";
import type { FarmField, RecentLogLocation } from "@/lib/data-pages";

// Duplicated from components/FieldMap.tsx (a small constant) rather than imported, since FieldMap
// is owned by a concurrent change and must not be touched.
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

function boundsFromBoundaries(boundaries: GeoJSON.Polygon[]): LngLatBoundsLike | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const boundary of boundaries) {
    for (const [lng, lat] of boundary.coordinates[0]) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  if (!Number.isFinite(minLng)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/** Bounding-box center. The seed fields are rectangles, so this is also their true centroid. */
function centroidOfBoundary(boundary: GeoJSON.Polygon): [number, number] {
  const bounds = boundsFromBoundaries([boundary]) as [[number, number], [number, number]] | null;
  if (!bounds) return [0, 0];
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

type Selection = { type: "field"; field: FarmField } | { type: "pin"; location: RecentLogLocation } | null;

export default function FarmMap({ fields, locations }: { fields: FarmField[]; locations: RecentLogLocation[] }) {
  const mapRef = useRef<MapRef>(null);
  const [selected, setSelected] = useState<Selection>(null);

  const fieldsWithBoundary = useMemo(() => fields.filter((f) => f.boundary !== null), [fields]);

  const boundaryCollection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: fieldsWithBoundary.map((field) => ({
        type: "Feature" as const,
        geometry: field.boundary as GeoJSON.Polygon,
        properties: { fieldId: field.id },
      })),
    }),
    [fieldsWithBoundary]
  );

  const initialBounds = useMemo(
    () => boundsFromBoundaries(fieldsWithBoundary.map((f) => f.boundary as GeoJSON.Polygon)),
    [fieldsWithBoundary]
  );

  function flyToField(field: FarmField) {
    setSelected({ type: "field", field });
    if (!field.boundary) return;
    const bounds = boundsFromBoundaries([field.boundary]);
    if (bounds) mapRef.current?.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 600 });
  }

  if (fields.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-[14px] border-[0.88px] border-border-map bg-border-subtle text-sm text-text-secondary">
        No fields recorded yet.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[10px] xl:flex-row">
      <div className="flex max-h-[280px] shrink-0 flex-col gap-2 overflow-y-auto rounded-[14px] border border-border-subtle p-3 xl:max-h-none xl:w-[280px]">
        {fields.map((field) => (
          <button
            key={field.id}
            type="button"
            onClick={() => flyToField(field)}
            className={clsx(
              "flex flex-col gap-1 rounded-[10px] border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40",
              selected?.type === "field" && selected.field.id === field.id
                ? "border-ink bg-row-highlight"
                : "border-border-subtle hover:bg-row-highlight"
            )}
          >
            <span className="text-sm font-medium text-ink">{field.name}</span>
            <span className="text-sm text-text-secondary">
              {field.crop ?? "No crop set"}
              {field.acres !== null ? ` · ${field.acres.toFixed(1)} acres` : ""}
            </span>
            <span className="text-2xs text-text-faint">
              {field.recentLogCount} log{field.recentLogCount === 1 ? "" : "s"} in the last 30 days
            </span>
          </button>
        ))}
      </div>

      <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-[14px] border-[0.88px] border-border-map">
        <Map
          ref={mapRef}
          initialViewState={
            initialBounds
              ? { bounds: initialBounds, fitBoundsOptions: { padding: 60, maxZoom: 16 } }
              : { longitude: 0, latitude: 0, zoom: 1 }
          }
          mapStyle={SATELLITE_STYLE}
          style={{ width: "100%", height: "100%" }}
          interactiveLayerIds={fieldsWithBoundary.length > 0 ? ["field-fill"] : undefined}
          onClick={(event) => {
            const feature = event.features?.[0];
            const fieldId = feature?.properties?.fieldId as string | undefined;
            const field = fieldId ? fields.find((f) => f.id === fieldId) : undefined;
            if (field) setSelected({ type: "field", field });
          }}
        >
          {fieldsWithBoundary.length > 0 ? (
            <Source id="fields" type="geojson" data={boundaryCollection}>
              <Layer id="field-fill" type="fill" paint={{ "fill-color": "#0065f0", "fill-opacity": 0.15 }} />
              <Layer id="field-line" type="line" paint={{ "line-color": "#0065f0", "line-width": 1.5 }} />
            </Source>
          ) : null}

          {fieldsWithBoundary.map((field) => {
            const [lng, lat] = centroidOfBoundary(field.boundary as GeoJSON.Polygon);
            return (
              <Marker key={field.id} longitude={lng} latitude={lat} anchor="center">
                <span className="pointer-events-none whitespace-nowrap rounded bg-ink/70 px-1.5 py-0.5 text-2xs font-medium text-paper">
                  {field.name}
                </span>
              </Marker>
            );
          })}

          {locations.map((location) => (
            <Marker
              key={location.id}
              longitude={location.location.coordinates[0]}
              latitude={location.location.coordinates[1]}
              anchor="center"
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                setSelected({ type: "pin", location });
              }}
            >
              <span
                aria-hidden
                className="block h-[13px] w-[13px] cursor-pointer rounded-full border-2 border-white"
                style={{ background: "linear-gradient(135deg, #0065f0, #00d4f0)" }}
              />
            </Marker>
          ))}
        </Map>

        {selected ? (
          <div className="absolute right-3 top-3 z-10 w-[240px] rounded-[14px] border border-border-subtle bg-paper p-4 shadow-lg">
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute right-3 top-3 text-text-secondary focus-visible:outline-none"
            >
              <X className="h-4 w-4" strokeWidth={1.33} />
            </button>
            {selected.type === "field" ? (
              <div className="flex flex-col gap-1 pr-5">
                <span className="text-sm font-medium text-ink">{selected.field.name}</span>
                <span className="text-sm text-text-secondary">{selected.field.crop ?? "No crop set"}</span>
                <span className="text-sm text-text-secondary">
                  {selected.field.acres !== null ? `${selected.field.acres.toFixed(1)} acres` : "Acreage unknown"}
                </span>
                <span className="text-sm text-text-secondary">
                  {selected.field.recentLogCount} log{selected.field.recentLogCount === 1 ? "" : "s"} in the last 30
                  days
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1 pr-5">
                <span className="text-sm font-medium text-ink">{selected.location.employee_name}</span>
                <span className="text-sm text-text-secondary">{formatActivityLabel(selected.location.activity)}</span>
                <span className="text-sm text-text-secondary">{formatLogDate(selected.location.started_at)}</span>
                <Link
                  href={`/dashboard?open=${selected.location.id}`}
                  className="mt-1 text-sm text-ink underline underline-offset-2"
                >
                  View log
                </Link>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
