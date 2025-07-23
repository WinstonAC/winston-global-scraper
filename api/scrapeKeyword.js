import express from 'express';
import puppeteer from 'puppeteer-extra';
import { executablePath } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
puppeteer.use(StealthPlugin());

// ES module __dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tag map
const tagMap = [
  { regex: /women in stem/i, tag: 'Women in STEM' },
  { regex: /africa/i, tag: 'Africa' },
  { regex: /corporate/i, tag: 'Corporate' },
  { regex: /university/i, tag: 'University' },
  { regex: /mentorship program|mentor program|mentoring/i, tag: 'Mentor' },
  { regex: /coaching cohort/i, tag: 'Mentorship Program' },
];

// Placeholder Bing fallback
async function bingFallback(keyword) {
  // Return [] or [{ title, url, emails, phones, tags }...]
  return [];
}

router.post('/', async (req, res) => {
  const { keyword } = req.body;
  if (!keyword || typeof keyword !== 'string') {
    return res.status(400).json({ error: 'Keyword is required.' });
  }
  let browser;
  let rows = [];
  let id = null;
  try {
    browser = await puppeteer.launch({
      executablePath: executablePath(),
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 800 }
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.85 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.result__a, .result__title a', { timeout: 10000 });
    // Scrape first 20 links
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('.result__a, .result__title a'));
      return anchors.slice(0, 20).map(a => ({ title: a.innerText, url: a.href }));
    });
    for (const link of links) {
      // Visit each link and extract emails/phones
      try {
        const subPage = await browser.newPage();
        await subPage.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const content = await subPage.content();
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const phoneRegex = /\+?\d[\d\s().-]{7,}\d/g;
        const emails = content.match(emailRegex) || [];
        const phones = content.match(phoneRegex) || [];
        // Tagging
        const tags = tagMap.filter(t => t.regex.test(link.title + ' ' + content)).map(t => t.tag);
        rows.push({
          title: link.title,
          url: link.url,
          emails: emails.join(';'),
          phones: phones.join(';'),
          tags: tags.join(';')
        });
        await subPage.close();
      } catch (err) {
        // Skip failed links
      }
    }
    await browser.close();
    // Bing fallback if <3 rows
    if (rows.length < 3) {
      const bingRows = await bingFallback(keyword);
      rows = rows.concat(bingRows);
    }
    // Write to CSV
    id = Date.now();
    const outputDir = path.join(__dirname, '../output');
    fs.mkdirSync(outputDir, { recursive: true });
    const filename = path.join(outputDir, `results_${id}.csv`);
    const csv = rows.map(r => `"${r.title.replace(/"/g, '""')}","${r.url}","${r.emails}","${r.phones}","${r.tags}"`).join('\n');
    fs.writeFileSync(filename, csv);
    res.json({ rows, csvId: id });
  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({ error: 'Scrape failed', details: error.message });
  }
});

export default router; 