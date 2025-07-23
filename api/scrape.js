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
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required.' });
  }
  let browser;
  let id = null;
  let contacts = [];
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
    console.log(`🌐 Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log('✅ Page loaded');
    // Example: Scrape emails and phones (customize as needed)
    try {
      const pageContent = await page.content();
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const phoneRegex = /\+?\d[\d\s().-]{7,}\d/g;
      const emails = pageContent.match(emailRegex) || [];
      const phones = pageContent.match(phoneRegex) || [];
      contacts = [
        ...emails.map(email => ({ type: 'email', value: email })),
        ...phones.map(phone => ({ type: 'phone', value: phone }))
      ];
    } catch (err) {
      console.error('❌ Error scraping contacts:', err.message);
      await browser.close();
      return res.status(500).json({ error: 'Scraping contacts failed', details: err.message });
    }
    // Write contacts to CSV
    try {
      id = Date.now();
      const outputDir = path.join(__dirname, '../output');
      fs.mkdirSync(outputDir, { recursive: true });
      const filename = path.join(outputDir, `results_${id}.csv`);
      const csv = contacts.map(c => `"${c.type}","${c.value}"`).join('\n');
      fs.writeFileSync(filename, csv);
      console.log(`📁 Contacts saved to ${filename}`);
    } catch (err) {
      console.error('❌ CSV writing failed:', err.message);
    }
    await browser.close();
    // Log url, contact count, and timestamp
    console.log(`[SCRAPE] URL: "${url}" | Contacts: ${contacts.length} | ${new Date().toISOString()}`);
    res.json({ contacts, csvId: id });
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

// New download route
app.get('/api/download/:id', (req, res) => {
  const file = path.join(__dirname, '../output', `results_${req.params.id}.csv`);
  res.download(file, 'contacts.csv', err => {
    if (err) {
      console.error('❌ Download failed:', err.message);
      res.status(404).json({ error: 'File not found' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`✅ Winston Scraper API running on http://localhost:${PORT}`);
});