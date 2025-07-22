import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import { writeToCSV } from '../utils/csvWriter.js';

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/scrape', async (req, res) => {
  const { keyword } = req.body;
  if (!keyword) return res.status(400).json({ error: 'Keyword is required' });

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const searchURL = `https://www.google.com/search?q=${encodeURIComponent(keyword)}`;
    await page.goto(searchURL, { waitUntil: 'networkidle2' });

    const results = await page.$$eval('div.g', elements =>
      elements.map(el => {
        const titleEl = el.querySelector('h3');
        const linkEl = el.querySelector('a');
        return titleEl && linkEl
          ? {
              title: titleEl.innerText,
              url: linkEl.href,
              tags: [], // we’ll add real tags later
            }
          : null;
      }).filter(Boolean)
    );

    await browser.close();

    // Save to CSV
    await writeToCSV(results, keyword);

    res.json({ success: true, results });
  } catch (err) {
    console.error('Scrape failed:', err);
    res.status(500).json({ error: 'Scraping failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Scraper running on http://localhost:${PORT}`);
});