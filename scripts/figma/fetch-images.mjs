// Downloads:
//  - raw source images (avatar photo, satellite map base + overlay) via /v1/files/:key/images
//  - full-frame reference renders (DEFAULT VIEW, EXPANDED ENTRY) via /v1/images/:key (scale 2 PNG)
// into public/figma/.
import fs from 'node:fs';
import fs_promises from 'node:fs/promises';

const FILE_KEY = 'nvpGmK1je0QsesXtZcBdjg';
const token = process.env.FIGMA_TOKEN;
if (!token) {
  console.error('FIGMA_TOKEN not set');
  process.exit(1);
}
const headers = { 'X-Figma-Token': token };

async function fetchWithBackoff(url, opts, attempt = 0) {
  const res = await fetch(url, opts);
  if (res.status === 429) {
    const wait = Math.min(30000, 1000 * 2 ** attempt);
    console.error(`429 rate limited, waiting ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
    return fetchWithBackoff(url, opts, attempt + 1);
  }
  return res;
}

async function downloadTo(url, destPath) {
  const res = await fetchWithBackoff(url, {});
  if (!res.ok) throw new Error(`download failed ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs_promises.writeFile(destPath, buf);
  console.log('Saved', destPath, buf.length, 'bytes');
}

// 1) Raw source images (avatar, map base, map overlay)
const imagesRes = await fetchWithBackoff(`https://api.figma.com/v1/files/${FILE_KEY}/images`, { headers });
if (!imagesRes.ok) {
  console.error('images fetch failed', imagesRes.status, await imagesRes.text());
  process.exit(1);
}
const imagesJson = await imagesRes.json();
fs.writeFileSync('design/raw/file-images.json', JSON.stringify(imagesJson, null, 2));

const wanted = {
  '8b41ac5cfb869f470f15bcd5454afae0b0528472': 'public/figma/avatar.png',
  'ece298d0ec2c16f10310d45724b276a6035cb503': 'public/figma/map-satellite-base.png',
  '9bc07227079fadca85ce0501c7a9fc5964cef88e': 'public/figma/map-satellite-overlay.png',
};

for (const [ref, dest] of Object.entries(wanted)) {
  const url = imagesJson.meta.images[ref];
  if (!url) {
    console.error('No URL found for imageRef', ref);
    continue;
  }
  await downloadTo(url, dest);
}

// 2) Full-frame reference renders at scale 2
const frameIds = ['1:1481', '1:762'];
const renderRes = await fetchWithBackoff(
  `https://api.figma.com/v1/images/${FILE_KEY}?ids=${frameIds.join(',')}&format=png&scale=2`,
  { headers }
);
if (!renderRes.ok) {
  console.error('render fetch failed', renderRes.status, await renderRes.text());
  process.exit(1);
}
const renderJson = await renderRes.json();
fs.writeFileSync('design/raw/frame-renders.json', JSON.stringify(renderJson, null, 2));

const frameDest = {
  '1:1481': 'public/figma/ref-default.png',
  '1:762': 'public/figma/ref-expanded.png',
};
for (const [id, dest] of Object.entries(frameDest)) {
  const url = renderJson.images[id];
  if (!url) {
    console.error('No render URL for', id);
    continue;
  }
  await downloadTo(url, dest);
}

console.log('Done.');
