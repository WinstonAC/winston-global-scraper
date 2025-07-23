import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer-extra';
import { executablePath } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import scrapeKeyword from './scrapeKeyword.js';
import { load } from 'cheerio';
import { findContactName } from './scrapeKeyword.js';

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

const tagRules = [
  { tag: "Women in STEM",        re: /women in stem/i },
  { tag: "Africa",               re: /africa/i },
  { tag: "Corporate",            re: /.com.*(career|about)/i },
  { tag: "University",           re: /\.edu|university|college/i },
  { tag: "Mentor",               re: /\bmentor\b/i },
  { tag: "Mentorship Program",   re: /mentor(?:ing|ship) program|coaching cohort|career mentor/i },
  { tag: "Youth Mentorship",     re: /youth mentor|student mentor|STEM mentor|STEM outreach/i },
  { tag: "Climate Change",       re: /climate change|global warming|net ?zero|decarbon/i },
  { tag: "Sustainability",       re: /sustainab|\bESG\b|green energy|renewable/i }
];

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
      const $ = load(pageContent);
      // Extract and clean emails
      const rawEmails = pageContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      const emails = rawEmails.filter(e => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(e));
      // Extract and clean phones
      const rawPhones = pageContent.match(/\+?\d[\d\s().-]{7,}\d/g) || [];
      const phones = rawPhones.map(p => p.replace(/\D/g, '')).filter(p => p.length >= 7 && p.length <= 15);
      // Contact extraction
      const contact = emails.length ? findContactName($, emails[0], url) : findContactName($, '', url);
      // Tagging
      const tags = tagRules.filter(t => t.re.test(pageContent)).map(t => t.tag);
      contacts = [
        {
          emails: emails.join(';'),
          phones: phones.join(';'),
          contact,
          tags: tags.join(';')
        }
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
      try {
        fs.mkdirSync(outputDir, { recursive: true });
        fs.accessSync(outputDir, fs.constants.W_OK);
      } catch (err) {
        console.error('❌ Output directory is not writable or cannot be created:', outputDir);
        console.error(err);
        process.exit(1);
      }
      const filename = path.join(outputDir, `results_${id}.csv`);
      const csv = contacts.map(c => `"${c.emails}","${c.phones}","${c.contact}","${c.tags}"`).join('\n');
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

app.use('/api/scrapeKeyword', scrapeKeyword);

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

const outputDir = path.join(__dirname, '../output');
try {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.accessSync(outputDir, fs.constants.W_OK);
} catch (err) {
  console.error('❌ Output directory is not writable or cannot be created:', outputDir);
  console.error(err);
  process.exit(1);
}
// Cleanup old CSVs (>24h) in output dir
try {
  const now = Date.now();
  const files = fs.readdirSync(outputDir);
  files.forEach(file => {
    if (file.startsWith('results_') && file.endsWith('.csv')) {
      const filePath = path.join(outputDir, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
        fs.unlinkSync(filePath);
        console.log('🗑️ Deleted old CSV:', filePath);
      }
    }
  });
} catch (err) {
  console.error('⚠️ Error during CSV cleanup:', err);
}

app.listen(PORT, () => {
  console.log(`✅ Winston Scraper API running on http://localhost:${PORT}`);
});