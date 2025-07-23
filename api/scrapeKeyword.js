import chromium from 'chrome-aws-lambda';
import fs from 'fs';
import path from 'path';
import { load } from 'cheerio';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

try {
  const pluginStealth = StealthPlugin();
  pluginStealth.enabledEvasions.delete('chrome.app');
  puppeteer.use(pluginStealth);
} catch (err) {
  console.error('[Keyword Scraper] Failed to load puppeteer-extra or stealth plugin:', err.message);
  throw new Error('Required Puppeteer modules not found. Please install puppeteer-extra and puppeteer-extra-plugin-stealth.');
}

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

async function bingFallback(keyword) { 
  console.warn("[Keyword Scraper] Using Bing fallback...");
  return []; 
}
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
  let browser;
  let keyword;
  try {
    const body = req.body;
    keyword = body.keyword;
    console.log('[Keyword Scraper] Payload:', { keyword }, 'Timestamp:', new Date().toISOString(), 'Vercel Env:', process.env.VERCEL_ENV);
    if (!keyword || typeof keyword !== 'string') {
      return res.status(400).json({ error: 'Keyword is required.' });
    }
    try {
      console.log('[Keyword Scraper] Launching browser...');
      browser = await puppeteer.launch({
        executablePath: await chromium.executablePath || process.env.CHROME_EXECUTABLE_PATH,
        headless: chromium.headless,
        args: chromium.args,
        defaultViewport: { width: 1280, height: 800 },
        ignoreHTTPSErrors: true,
      });
      console.log('[Keyword Scraper] Browser launched');
    } catch (err) {
      console.error('[Keyword Scraper] Browser launch failed:', err.message);
      return res.status(500).json({ error: 'Failed to launch browser' });
    }
    let page;
    try {
      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.85 Safari/537.36');
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      console.log('[Keyword Scraper] Navigated to DuckDuckGo search');
      await page.waitForSelector('a[data-testid="result-title-a"]', { timeout: 10000 });
    } catch (err) {
      console.error('[Keyword Scraper] Page navigation failed:', err.message);
      if (browser) { try { await browser.close(); } catch (e) {} }
      return res.status(500).json({ error: 'Failed to load search page' });
    }
    let links;
    try {
      links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[data-testid="result-title-a"]'));
        return anchors.slice(0, 20).map(a => ({ title: a.innerText, url: a.href }));
      });
      console.log('[Keyword Scraper] Found', links.length, 'results');
    } catch (err) {
      console.error('[Keyword Scraper] Search results extraction failed:', err.message);
      if (browser) { try { await browser.close(); } catch (e) {} }
      return res.status(500).json({ error: 'Failed to extract search results' });
    }
    let rows = [];
    for (const link of links) {
      try {
        console.log(`[Keyword Scraper] Scraping subpage: ${link.url}`);
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
        console.log(`[Keyword Scraper] Extracted emails: ${emails.join(', ')}`);
        console.log(`[Keyword Scraper] Contact name: ${contact}`);
        console.log(`[Keyword Scraper] Tags: ${tags.join(', ')}`);
        rows.push({ title: link.title, url: link.url, emails: emails.join(';'), phones: phones.join(';'), tags: tags.join(';'), contact });
        await subPage.close();
      } catch (err) {
        console.error('[Keyword Scraper] Subpage scrape failed:', err.message);
      }
    }
    await browser.close();
    if (rows.length < 3) {
      const bingRows = await bingFallback(keyword);
      rows = rows.concat(bingRows);
    }
    let id = Date.now();
    const outputDir = '/tmp';
    fs.mkdirSync(outputDir, { recursive: true });
    const filename = path.join(outputDir, `results_${id}.csv`);
    const csv = rows.map(r => `"${r.title.replace(/"/g, '""')}","${r.url}","${r.emails}","${r.phones}","${r.tags}","${r.contact}"`).join('\n');
    fs.writeFileSync(filename, csv);
    console.log(`[Keyword Scraper] Results written to: results_${id}.csv`);
    res.status(200).json({ rows, csvId: id });
  } catch (error) {
    console.error('[Keyword Scraper] Unhandled error:', error.message || error);
    if (browser) { try { await browser.close(); } catch (e) {} }
    res.status(500).json({ error: 'Scrape failed' });
  }
} 