// Fetch full-depth node trees for the two Dashboard frames identified from the depth=2 pass:
//   1:1481 = DEFAULT VIEW (x=-1716, matches "DEFAULT VIEW" label position)
//   1:762  = EXPANDED ENTRY (x=0, matches "EXPANDED ENTRY" label position)
const FILE_KEY = 'nvpGmK1je0QsesXtZcBdjg';
const token = process.env.FIGMA_TOKEN;
if (!token) {
  console.error('FIGMA_TOKEN not set');
  process.exit(1);
}

const ids = ['1:1481', '1:762'];
const url = `https://api.figma.com/v1/files/${FILE_KEY}/nodes?ids=${ids.join(',')}`;

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

const res = await fetchWithBackoff(url, { headers: { 'X-Figma-Token': token } });
if (!res.ok) {
  console.error('Fetch failed', res.status, await res.text());
  process.exit(1);
}
const json = await res.json();
const fs = await import('node:fs/promises');
await fs.writeFile('design/raw/nodes-full.json', JSON.stringify(json, null, 2));
console.log('Saved design/raw/nodes-full.json');
console.log('Top-level keys:', Object.keys(json.nodes));
