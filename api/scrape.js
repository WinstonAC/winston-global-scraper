import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer-extra';
import { executablePath } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module __dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log('✅ __dirname resolved to:', __dirname);

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

app.post('/api/scrape', async (req, res) => {
  const { keyword } = req.body;
  if (!keyword || typeof keyword !== 'string') {
    return res.status(400).json({ error: 'Keyword is required.' });
  }
  let browser;
  let filename = '';
  try {
    console.log('🚀 Launching Puppeteer (with stealth)...');
    browser = await puppeteer.launch({
      executablePath: executablePath(),
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 800 }
    });
    console.log('✅ Browser launched');
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.85 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}`;
    console.log(`🌐 Navigating to: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    console.log('✅ Page loaded');
    try {
      await page.waitForSelector('.result__title a', { timeout: 10000 });
      console.log('🔍 Selector found: .result__title a');
    } catch (err) {
      console.error('❌ Selector .result__title a not found. Taking screenshot for debugging...');
      await page.screenshot({ path: 'debug.png' });
      await browser.close();
      return res.status(500).json({ error: 'Selector not found. Screenshot saved as debug.png.' });
    }
    let results = [];
    try {
      console.log('🔎 Scraping results using selector: .result__title a');
      results = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('.result__title a').forEach(a => {
          if (a.innerText && a.href) items.push({ title: a.innerText, url: a.href });
        });
        return items;
      });
      console.log(`✅ Extracted ${results.length} results from DuckDuckGo`);
    } catch (err) {
      console.error('❌ Error scraping elements:', err.message);
      await browser.close();
      return res.status(500).json({ error: 'Scraping failed', details: err.message });
    }
    // Write results to CSV
    try {
      const timestamp = Date.now();
      filename = `output/results_${timestamp}.csv`;
      fs.mkdirSync('output', { recursive: true });
      const csv = results.map(r => `"${r.title.replace(/"/g, '""')}","${r.url}"`).join('\n');
      fs.writeFileSync(filename, csv);
      console.log(`📁 Results saved to ${filename}`);
    } catch (err) {
      console.error('❌ CSV writing failed:', err.message);
    }
    await browser.close();
    // Log keyword, result count, and timestamp
    console.log(`[SCRAPE] Keyword: "${keyword}" | Results: ${results.length} | ${new Date().toISOString()}`);
    res.json({ results, filename });
  } catch (error) {
    console.error('\n==============================');
    console.error('🛑 [WINSTON SCRAPER ERROR]');
    console.error(`🔴 Message: ${error.message}`);
    console.error(`🔴 Stack: ${error.stack}`);
    console.error('==============================\n');
    if (browser) await browser.close();
    res.status(500).json({ error: 'Scrape failed' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Winston Scraper API running on http://localhost:${PORT}`);
});