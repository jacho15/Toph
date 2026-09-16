// Uploads the 4 recorded seed clips to Supabase Storage (bucket `recordings`)
// and backfills `duration_s` on the matching seeded `logs` rows.
//
// Duration is read straight out of the MP4 container's moov/mvhd box (no
// ffmpeg dependency) — see parseMvhdDuration below.
//
// Usage: npm run db:seed-audio

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL is not set. Refusing to run — ' +
      'set it in .env.local or .env.development.local.'
  );
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY is not set. Refusing to run — ' +
      'set it in .env.local or .env.development.local.'
  );
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/** Reads an 8- or 16-byte MP4 box header at `offset`. */
function readBoxHeader(buf, offset) {
  if (offset + 8 > buf.length) return null;
  let size = buf.readUInt32BE(offset);
  const type = buf.toString('ascii', offset + 4, offset + 8);
  let headerSize = 8;
  if (size === 1) {
    // 32-bit size field is a sentinel; real size is the next 64-bit value.
    if (offset + 16 > buf.length) return null;
    const high = buf.readUInt32BE(offset + 8);
    const low = buf.readUInt32BE(offset + 12);
    size = high * 2 ** 32 + low;
    headerSize = 16;
  } else if (size === 0) {
    // Box extends to the end of the buffer (only valid for the last box).
    size = buf.length - offset;
  }
  return { type, size, headerSize, start: offset };
}

/** Scans sibling boxes in [start, end) for the first box of `targetType`. */
function findChildBox(buf, start, end, targetType) {
  let offset = start;
  while (offset < end) {
    const header = readBoxHeader(buf, offset);
    if (!header || header.size < header.headerSize) return null;
    if (header.type === targetType) return header;
    offset += header.size;
  }
  return null;
}

/** Parses moov/mvhd (timescale + duration, version 0 or 1) into seconds. */
function parseMvhdDuration(buf) {
  const moov = findChildBox(buf, 0, buf.length, 'moov');
  if (!moov) throw new Error('moov box not found');

  const moovContentStart = moov.start + moov.headerSize;
  const moovContentEnd = moov.start + moov.size;
  const mvhd = findChildBox(buf, moovContentStart, moovContentEnd, 'mvhd');
  if (!mvhd) throw new Error('mvhd box not found');

  const contentStart = mvhd.start + mvhd.headerSize;
  const version = buf.readUInt8(contentStart);

  let timescale;
  let duration;
  if (version === 1) {
    // version(1) + flags(3) + creation_time(8) + modification_time(8)
    timescale = buf.readUInt32BE(contentStart + 20);
    duration = Number(buf.readBigUInt64BE(contentStart + 24));
  } else {
    // version(1) + flags(3) + creation_time(4) + modification_time(4)
    timescale = buf.readUInt32BE(contentStart + 12);
    duration = buf.readUInt32BE(contentStart + 16);
  }

  if (!timescale) throw new Error('mvhd timescale is zero');
  return duration / timescale;
}

const mapPath = path.join(repoRoot, 'supabase', 'seed-audio-map.json');
const entries = JSON.parse(readFileSync(mapPath, 'utf8'));

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let hadError = false;

for (const entry of entries) {
  const { key, log_id: logId, path: storagePath } = entry;
  try {
    const filePath = path.join(repoRoot, 'seed-audio', `${key}.m4a`);
    const fileBuffer = readFileSync(filePath);
    const durationS = parseMvhdDuration(fileBuffer);

    const { error: uploadError } = await supabase.storage
      .from('recordings')
      .upload(storagePath, fileBuffer, {
        contentType: 'audio/mp4',
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const { error: updateError } = await supabase
      .from('logs')
      .update({ duration_s: durationS })
      .eq('id', logId);
    if (updateError) throw updateError;

    console.log(
      `${key}: path=${storagePath} bytes=${fileBuffer.length} duration_s=${durationS.toFixed(2)}`
    );
  } catch (err) {
    hadError = true;
    console.error(`${key}: FAILED — ${err.message ?? err}`);
  }
}

if (hadError) {
  process.exit(1);
}
