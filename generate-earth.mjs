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
    console.error('Missing KIE_API_KEY. Run with: KIE_API_KEY=... node generate-earth.mjs');
    process.exit(1);
  }

  await mkdir(join(__dirname, 'images'), { recursive: true });

  console.log('Creating Earth texture task...');
  const taskId = await createTask({
    model: 'nano-banana-pro',
    input: {
      prompt: 'Planet Earth equirectangular projection map texture, ultra realistic satellite photography, lush vibrant green forests and tropical jungles with visible tree canopy texture, deep vivid blue oceans with turquoise shallow waters and white ocean currents, golden Sahara desert, snow white polar ice caps and mountain ranges, scattered realistic white clouds and thin wispy cloud formations over oceans, visible atmospheric haze at horizons, rich saturated colors, high contrast between land and ocean, detailed continental coastlines and rivers, flat unwrapped Mercator-style world map texture suitable for 3D sphere UV mapping, continuous seamless edges left to right, 2048x1024 aspect ratio, 8K quality render',
      aspect_ratio: '16:9',
      resolution: '2K',
      output_format: 'png',
    },
  });
  console.log(`Task created: ${taskId}`);

  console.log('Polling for result...');
  const urls = await pollTask(taskId, 'earth-texture');

  console.log('Downloading and processing...');
  const res = await fetch(urls[0]);
  const buffer = Buffer.from(await res.arrayBuffer());

  // Save full-size WebP for Three.js texture
  const webpBuffer = await sharp(buffer)
    .resize({ width: 2048, height: 1024, fit: 'fill' })
    .webp({ quality: 85 })
    .toBuffer();

  const outputPath = join(__dirname, 'images', 'earth-texture.webp');
  await writeFile(outputPath, webpBuffer);
  console.log(`Saved ${outputPath} (${(webpBuffer.length / 1024).toFixed(0)}KB)`);

  // Also save original PNG for reference
  const pngPath = join(__dirname, 'images', 'earth-texture-original.png');
  await writeFile(pngPath, buffer);
  console.log(`Saved original: ${pngPath} (${(buffer.length / 1024).toFixed(0)}KB)`);

  console.log('Done!');
}

main().catch(console.error);
