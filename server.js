const express = require('express');
const path = require('path');
const https = require('https');

const app = express();
const PORT = 3000;

const BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAAGsn8QEAAAAAmGMNJZgyNQf%2FeQkm74UXZTQvX6o%3DkJNLME4ZHyzuiSUo4PlERfGHunXkvKaHanTaeNNTdgif1LXVfc';
const USERNAME = 'lithiumtako';

app.use(express.static(path.join(__dirname, 'public')));

let cachedCount = null;
let cacheTime = 0;
const CACHE_MS = 5 * 60 * 1000;

function fetchFollowerCount() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.twitter.com',
      path: `/2/users/by/username/${USERNAME}?user.fields=public_metrics`,
      headers: {
        'Authorization': `Bearer ${BEARER_TOKEN}`
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('[API Response]', JSON.stringify(json));
          const count = json?.data?.public_metrics?.followers_count;
          if (count !== undefined) {
            console.log(`[API] Followers: ${count}`);
            resolve(count);
          } else {
            console.log('[API] Count not found in response');
            resolve(null);
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

app.get('/api/followers', async (req, res) => {
  const now = Date.now();

  if (cachedCount !== null && now - cacheTime < CACHE_MS) {
    const refreshIn = Math.ceil((CACHE_MS - (now - cacheTime)) / 1000);
    return res.json({ count: cachedCount, cached: true, refreshIn });
  }

  try {
    const count = await fetchFollowerCount();

    if (count !== null) {
      cachedCount = count;
      cacheTime = now;
      return res.json({ count, cached: false, refreshIn: CACHE_MS / 1000 });
    }

    if (cachedCount !== null) {
      return res.json({ count: cachedCount, cached: true, stale: true, refreshIn: 60 });
    }

    return res.status(503).json({ error: 'Could not fetch count from X API.' });

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
  console.log('  No browser needed — using X API directly!\n');
});
