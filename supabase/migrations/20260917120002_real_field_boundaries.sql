-- Real field boundaries.
--
-- The original seed used hand-drawn rectangles that happened to land on woodland and a
-- lake, which looks wrong on satellite imagery for a farm product. These are actual
-- farmland parcels near Faribault, Minnesota, taken from OpenStreetMap
-- (landuse=farmland ways, ODbL), so the map shows real crop fields.
--
-- Existing log GPS points were placed inside the old rectangles, so each log is moved to a
-- point inside its new field (ST_PointOnSurface, which is always inside the polygon, unlike
-- a centroid on a concave shape). The centroid/acres trigger recomputes those columns.

-- FIELD A — OpenStreetMap way 1450124559
update public.fields set boundary = extensions.ST_GeomFromText('POLYGON((-93.300638 44.081403,-93.288881 44.083545,-93.28962 44.082152,-93.289657 44.081173,-93.287915 44.081173,-93.287914 44.080616,-93.300475 44.080663,-93.300638 44.081403))', 4326)::extensions.geography
  where name = 'FIELD A';

-- FIELD B — OpenStreetMap way 1463771453
update public.fields set boundary = extensions.ST_GeomFromText('POLYGON((-93.304404 44.096804,-93.30431 44.096999,-93.303169 44.098376,-93.302866 44.098404,-93.302564 44.098465,-93.302556 44.098677,-93.302385 44.098855,-93.302144 44.098989,-93.301958 44.099151,-93.301942 44.09943,-93.301849 44.099842,-93.301554 44.100127,-93.301314 44.100389,-93.301119 44.100539,-93.300855 44.101169,-93.30091 44.101504,-93.301104 44.102106,-93.300933 44.102267,-93.300685 44.102295,-93.299877 44.102301,-93.299706 44.102256,-93.299349 44.102039,-93.298977 44.102016,-93.298674 44.102178,-93.298123 44.102223,-93.297603 44.102415,-93.297175 44.10239,-93.296552 44.102377,-93.296497 44.095038,-93.301295 44.095129,-93.301441 44.096557,-93.303564 44.096533,-93.303755 44.096734,-93.304239 44.096734,-93.304404 44.096804))', 4326)::extensions.geography
  where name = 'FIELD B';

-- FIELD C — OpenStreetMap way 1463771429
update public.fields set boundary = extensions.ST_GeomFromText('POLYGON((-93.294272 44.103623,-93.294769 44.10362,-93.297222 44.103605,-93.297201 44.103069,-93.297175 44.10239,-93.297603 44.102415,-93.299373 44.102518,-93.299776 44.102446,-93.300537 44.102474,-93.300933 44.102669,-93.301348 44.10315,-93.303286 44.105395,-93.303317 44.105729,-93.302913 44.105952,-93.302532 44.105997,-93.301803 44.105958,-93.301383 44.105813,-93.301081 44.105824,-93.300677 44.105925,-93.300327 44.105992,-93.292854 44.105998,-93.294272 44.103623))', 4326)::extensions.geography
  where name = 'FIELD C';

-- FIELD D — OpenStreetMap way 1463771434
update public.fields set boundary = extensions.ST_GeomFromText('POLYGON((-93.292854 44.105998,-93.291867 44.10765,-93.292519 44.107609,-93.293429 44.107641,-93.296305 44.108569,-93.298935 44.109417,-93.303006 44.109437,-93.303495 44.109331,-93.303681 44.109096,-93.303713 44.108756,-93.303728 44.106064,-93.302532 44.105997,-93.301803 44.105958,-93.301508 44.106058,-93.300327 44.105992,-93.292854 44.105998))', 4326)::extensions.geography
  where name = 'FIELD D';

-- Re-place every log GPS point inside its (new) field.
update public.logs l
set location = extensions.ST_PointOnSurface(f.boundary::extensions.geometry)::extensions.geography
from public.fields f
where l.field_id = f.id and l.location is not null;
