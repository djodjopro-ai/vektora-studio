import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_KEY = process.env.KIE_API_KEY;
const CREATE_URL = 'https://api.kie.ai/api/v1/jobs/createTask';
const STATUS_URL = 'https://api.kie.ai/api/v1/jobs/recordInfo';

const HEADERS = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

async function createTask(body) {
  const res = await fetch(CREATE_URL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.code !== 200) throw new Error(`Create failed: ${JSON.stringify(json)}`);
  return json.data.taskId;
}

async function pollTask(taskId, label, maxWait = 600000) {
  const start = Date.now();
  let delay = 3000;
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, delay));
    const res = await fetch(`${STATUS_URL}?taskId=${taskId}`, { headers: HEADERS });
    const json = await res.json();
    const state = json.data?.state;
    const progress = json.data?.progress || 0;
    console.log(`  [${label}] state=${state} progress=${progress}%`);

    if (state === 'success') {
      const result = JSON.parse(json.data.resultJson);
      return result.resultUrls;
    }
    if (state === 'fail') {
      throw new Error(`Task failed: ${json.data.failMsg}`);
    }
    delay = Math.min(delay * 1.3, 10000);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

async function main() {
  if (!API_KEY) {
    console.error('Missing KIE_API_KEY. Run with: KIE_API_KEY=... node generate-logo.mjs');
    process.exit(1);
  }

  await mkdir(join(__dirname, 'images'), { recursive: true });

  console.log('Creating LF logo task...');
  const taskId = await createTask({
    model: 'nano-banana-pro',
    input: {
      prompt: 'Minimal monogram logo mark, letters "LF" intertwined, geometric clean design, dark purple #a680ff on pure black #050510 background, sharp edges, modern tech aesthetic, no other text, no decorations, centered, high contrast, vector-style clean lines, square 1:1 format',
      aspect_ratio: '1:1',
      resolution: '2K',
      output_format: 'png',
    },
  });
  console.log(`Task created: ${taskId}`);

  console.log('Polling for result...');
  const urls = await pollTask(taskId, 'lf-logo');

  console.log('Downloading and processing...');
  const res = await fetch(urls[0]);
  const buffer = Buffer.from(await res.arrayBuffer());

  // Save original PNG
  const originalPath = join(__dirname, 'images', 'logo-original.png');
  await writeFile(originalPath, buffer);
  console.log(`Saved original: ${originalPath}`);

  // Favicon sizes
  const sizes = [32, 180, 192, 512];
  for (const size of sizes) {
    const out = await sharp(buffer)
      .resize(size, size, { fit: 'contain', background: { r: 5, g: 5, b: 16, alpha: 1 } })
      .png()
      .toBuffer();
    const name = size === 180 ? 'apple-touch-icon.png' :
                 size === 32 ? 'favicon-32x32.png' :
                 `favicon-${size}x${size}.png`;
    const outPath = join(__dirname, name);
    await writeFile(outPath, out);
    console.log(`Saved ${name} (${(out.length / 1024).toFixed(1)}KB)`);
  }

  // WebP for OG/general use
  const ogBuffer = await sharp(buffer)
    .resize(512, 512, { fit: 'contain', background: { r: 5, g: 5, b: 16, alpha: 1 } })
    .webp({ quality: 90 })
    .toBuffer();
  await writeFile(join(__dirname, 'images', 'logo.webp'), ogBuffer);
  console.log(`Saved images/logo.webp (${(ogBuffer.length / 1024).toFixed(1)}KB)`);

  console.log('Done!');
}

main().catch(console.error);
