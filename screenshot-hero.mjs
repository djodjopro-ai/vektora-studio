import puppeteer from 'puppeteer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 15000 });
  // Wait for globe textures to load and render
  await new Promise(r => setTimeout(r, 5000));
  const outPath = path.join(__dirname, 'temporary screenshots', 'hero-closeup.png');
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`Saved: ${outPath}`);
  await browser.close();
}
main().catch(console.error);
