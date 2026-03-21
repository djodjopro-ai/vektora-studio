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
      throw new Error(`Task ${label} failed: ${json.data.failMsg}`);
    }
    delay = Math.min(delay * 1.3, 10000);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

async function generateAndSave(promptConfig, outputName, processOpts = {}) {
  console.log(`\nCreating task: ${outputName}...`);
  const taskId = await createTask({
    model: 'nano-banana-pro',
    input: {
      prompt: promptConfig.prompt,
      aspect_ratio: '16:9',
      resolution: '2K',
      output_format: 'png',
    },
  });
  console.log(`  Task created: ${taskId}`);

  const urls = await pollTask(taskId, outputName);
  console.log(`  Downloading ${outputName}...`);
  const res = await fetch(urls[0]);
  const buffer = Buffer.from(await res.arrayBuffer());

  // Save original PNG
  const pngPath = join(__dirname, 'images', `${outputName}-original.png`);
  await writeFile(pngPath, buffer);
  console.log(`  Saved original: ${pngPath} (${(buffer.length / 1024).toFixed(0)}KB)`);

  // Process to WebP at 2048x1024
  let pipeline = sharp(buffer).resize({ width: 2048, height: 1024, fit: 'fill' });

  if (processOpts.grayscale) {
    pipeline = pipeline.grayscale();
  }
  if (processOpts.normalize) {
    pipeline = pipeline.normalize();
  }

  const webpBuffer = await pipeline.webp({ quality: 90 }).toBuffer();
  const webpPath = join(__dirname, 'images', `${outputName}.webp`);
  await writeFile(webpPath, webpBuffer);
  console.log(`  Saved: ${webpPath} (${(webpBuffer.length / 1024).toFixed(0)}KB)`);

  return webpPath;
}

async function main() {
  if (!API_KEY) {
    console.error('Missing KIE_API_KEY. Run with: KIE_API_KEY=... node generate-globe-textures.mjs');
    process.exit(1);
  }

  await mkdir(join(__dirname, 'images'), { recursive: true });

  // Launch all 3 texture generations in parallel
  const results = await Promise.allSettled([
    // 1. Cloud layer - white clouds on pure black background
    generateAndSave({
      prompt: 'Earth cloud layer equirectangular projection map, realistic white and gray clouds viewed from above against pure black background, cumulus clouds over tropics, wispy cirrus clouds at mid latitudes, large spiral cyclone formations over oceans, cloud shadows visible, varying cloud density and thickness, some areas with clear gaps showing black underneath, atmospheric cloud patterns as seen from satellite, flat unwrapped Mercator-style texture for 3D sphere UV mapping, seamless left to right edges, 2048x1024 aspect ratio, high detail render, pure black where no clouds exist',
    }, 'earth-clouds'),

    // 2. Bump/height map - grayscale elevation
    generateAndSave({
      prompt: 'Earth elevation height map equirectangular projection, grayscale topographic map where white represents highest mountains like Himalayas and Andes and Rocky Mountains, black represents deepest ocean trenches and flat ocean floor, medium gray for plains and lowlands, light gray for hills and plateaus, accurate continental shapes with detailed mountain range ridges visible, ocean floor is dark black, continental shelves slightly lighter, mid-ocean ridges barely visible, flat unwrapped Mercator-style texture for 3D sphere UV mapping, seamless left to right edges, 2048x1024 aspect ratio, high contrast between land elevation and ocean depth, no colors only grayscale',
    }, 'earth-bump', { grayscale: true, normalize: true }),

    // 3. Specular map - white oceans (reflective), black land (matte)
    generateAndSave({
      prompt: 'Earth ocean mask equirectangular projection, pure white oceans and seas and lakes and rivers, pure black land masses and continents and islands, sharp clean coastlines, accurate continental outlines showing all major continents Africa Europe Asia Americas Australia Antarctica, Mediterranean Sea white, Red Sea white, Persian Gulf white, Great Lakes white, all inland water bodies white, everything that is land or ice is pure black, everything that is water is pure white, flat unwrapped Mercator-style texture for 3D sphere UV mapping, seamless left to right edges, 2048x1024 aspect ratio, high contrast binary mask, no gradients just pure black and white',
    }, 'earth-specular', { grayscale: true }),
  ]);

  console.log('\n=== RESULTS ===');
  for (const r of results) {
    if (r.status === 'fulfilled') {
      console.log(`  OK: ${r.value}`);
    } else {
      console.error(`  FAILED: ${r.reason.message}`);
    }
  }

  console.log('\nDone! All textures generated.');
}

main().catch(console.error);
