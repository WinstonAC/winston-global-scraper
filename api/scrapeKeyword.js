import puppeteerExtra from 'puppeteer-extra';
import chromium from 'chrome-aws-lambda';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { load } from 'cheerio';

// Patch stealth plugin to skip 'chrome.app' evasion
const pluginStealth = StealthPlugin();
pluginStealth.enabledEvasions.delete('chrome.app');
puppeteerExtra.use(pluginStealth);

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

async function bingFallback(keyword) { return []; }
function findContactName($, firstEmail, targetUrl) {
  let name = '';
  if (firstEmail) {
    const emailNode = $(`*:contains('${firstEmail}')`).first();
    let prevText = [];
    let node = emailNode[0];
    let count = 0;
    while (node && count < 30) {
      node = node.prev;
      if (node && node.type === 'text' && node.data) {
        prevText.unshift(node.data.trim());
        count++;
      }
    }
    const context = prevText.join(' ');
    const match = context.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})$/);
    if (match) name = match[1].trim();
  }
  if (!name) {
    name = $('meta[name="author"]').attr('content')?.trim();
  }
  if (!name) name = new URL(targetUrl).hostname.replace(/^www\./,'');
  return name || '';
}

export default async function handler(req, res) {
  const { keyword } = req.body;
  if (!keyword || typeof keyword !== 'string') {
    return res.status(400).json({ error: 'Keyword is required.' });
  }
  let browser;
  let rows = [];
  let id = null;
  try {
    browser = await puppeteerExtra.launch({
      executablePath: await chromium.executablePath || process.env.CHROME_EXECUTABLE_PATH,
      headless: chromium.headless,
      args: chromium.args,
      defaultViewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.85 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('a[data-testid="result-title-a"]', { timeout: 10000 });
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[data-testid="result-title-a"]'));
      return anchors.slice(0, 20).map(a => ({ title: a.innerText, url: a.href }));
    });
    for (const link of links) {
      try {
        const subPage = await browser.newPage();
        await subPage.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const html = await subPage.content();
        const $ = load(html);
        const rawEmails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        const emails = rawEmails.filter(e => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(e));
        const rawPhones = html.match(/\+?\d[\d\s().-]{7,}\d/g) || [];
        const phones = rawPhones.map(p => p.replace(/\D/g, '')).filter(p => p.length >= 7 && p.length <= 15);
        const tags = tagRules.filter(t => t.re.test(link.title + ' ' + html)).map(t => t.tag);
        const contact = emails.length ? findContactName($, emails[0], link.url) : findContactName($, '', link.url);
        rows.push({ title: link.title, url: link.url, emails: emails.join(';'), phones: phones.join(';'), tags: tags.join(';'), contact });
        await subPage.close();
      } catch (err) {
        console.error('Subpage scrape failed:', err.stack || err);
      }
    }
    await browser.close();
    if (rows.length < 3) {
      const bingRows = await bingFallback(keyword);
      rows = rows.concat(bingRows);
    }
    id = Date.now();
    const outputDir = '/tmp'; // Always use /tmp for Vercel
    fs.mkdirSync(outputDir, { recursive: true });
    const filename = path.join(outputDir, `results_${id}.csv`);
    const csv = rows.map(r => `"${r.title.replace(/"/g, '""')}","${r.url}","${r.emails}","${r.phones}","${r.tags}","${r.contact}"`).join('\n');
    fs.writeFileSync(filename, csv);
    res.status(200).json({ rows, csvId: id });
  } catch (error) {
    console.error('Scrape failed:', error.stack || error);
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    res.status(500).json({ error: 'Scrape failed', details: error.message || error.toString() });
  }
} 