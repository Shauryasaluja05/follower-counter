const express = require('express');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));

let cachedCount = null;
let cacheTime = 0;
const CACHE_MS = 5 * 60 * 1000;

function parseFollowerText(raw) {
  if (!raw) return null;
  const s = raw.trim().replace(/,/g, '');
  if (/^\d+(\.\d+)?[Kk]$/.test(s)) return Math.round(parseFloat(s) * 1e3);
  if (/^\d+(\.\d+)?[Mm]$/.test(s)) return Math.round(parseFloat(s) * 1e6);
  if (/^\d+(\.\d+)?[Bb]$/.test(s)) return Math.round(parseFloat(s) * 1e9);
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

async function getFollowerCount() {
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-extensions',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ]
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/122.0.0.0 Safari/537.36'
    );

    // Load cookies from file
    const cookiePath = path.join(__dirname, 'cookie.json');
    if (fs.existsSync(cookiePath)) {
      const raw = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      const cookies = raw.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain || '.x.com',
        path: c.path || '/',
        expires: c.expirationDate || c.expires || -1,
        httpOnly: c.httpOnly || false,
        secure: c.secure || true,
        sameSite: 'None'
      }));
      await page.setCookie(...cookies);
      console.log(`[Scraper] Loaded ${cookies.length} cookies ✅`);
    } else {
      console.log('[Scraper] ⚠️  No cookies.json found — this will likely fail.');
      console.log('[Scraper]     Follow the instructions to export your X cookies.');
    }

    console.log('[Scraper] Opening x.com/lithiumtako ...');
await page.goto('https://x.com/lithiumtako', {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });

   try {
      await page.waitForSelector('a[href*="/followers"]', { timeout: 15000 });
    } catch {
      console.log('[Scraper] waitForSelector timed out — trying anyway...');
    }

   await new Promise(r => setTimeout(r, 6000));

const text = await page.evaluate(() => {
      // Strategy 1: find a link containing /followers in href
      const links = Array.from(document.querySelectorAll('a'));
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (href.includes('/followers') && !href.includes('verified')) {
          const spans = link.querySelectorAll('span');
          for (const span of spans) {
            const t = (span.innerText || span.textContent || '').trim();
            if (/^[\d,.]+[KMBkmb]?$/.test(t) && t.length > 0) {
              return t;
            }
          }
          // Also try the link's own text
          const full = (link.innerText || link.textContent || '');
          const match = full.match(/([\d,.]+[KMBkmb]?)\s*Followers/i);
          if (match) return match[1];
        }
      }

      // Strategy 2: scan ALL text on page for "X Followers" pattern
      const allText = document.body.innerText || '';
      const match = allText.match(/([\d,.]+[KMBkmb]?)\s*Followers/i);
      if (match) return match[1];

      return null;
    });

    if (!text) {
      await page.screenshot({ path: 'debug.png', fullPage: false });
      console.log('[Scraper] Count not found. Saved debug.png — please share it.');
      return null;
    }

    const count = parseFollowerText(text);
    console.log(`[Scraper] Raw: "${text}" → Parsed: ${count}`);
    return count;

  } finally {
    await browser.close();
  }
}

app.get('/api/followers', async (req, res) => {
  const now = Date.now();

  if (cachedCount !== null && now - cacheTime < CACHE_MS) {
    const refreshIn = Math.ceil((CACHE_MS - (now - cacheTime)) / 1000);
    return res.json({ count: cachedCount, cached: true, refreshIn });
  }

  try {
    const count = await getFollowerCount();

    if (count !== null) {
      cachedCount = count;
      cacheTime = now;
      return res.json({ count, cached: false, refreshIn: CACHE_MS / 1000 });
    }

    if (cachedCount !== null) {
      return res.json({ count: cachedCount, cached: true, stale: true, refreshIn: 60 });
    }

    return res.status(503).json({
      error: 'Could not fetch count. Check debug.png in your folder.'
    });

  } catch (err) {
    console.error('[Error]', err.message);
    if (cachedCount !== null) {
      return res.json({ count: cachedCount, cached: true, stale: true, refreshIn: 60 });
    }
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('\n  ✅  Server running!');
  console.log(`  🌐  Open: http://localhost:${PORT}`);
  console.log('  ⏳  First load takes 30–60 seconds\n');
});