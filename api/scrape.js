import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

try {
  const pluginStealth = StealthPlugin();
  pluginStealth.enabledEvasions.delete('chrome.app');
  puppeteer.use(pluginStealth);
} catch (err) {
  console.error('[Scraper] Failed to load puppeteer-extra or stealth plugin:', err.message);
  throw new Error('Required Puppeteer modules not found. Please install puppeteer-extra and puppeteer-extra-plugin-stealth.');
}

export default async function handler(req, res) {
  let browser;
  let url;
  try {
    const body = req.body;
    url = body.url;
    console.log('[Scraper] Payload:', { url }, 'Timestamp:', new Date().toISOString(), 'Vercel Env:', process.env.VERCEL_ENV);
    if (!url) {
      return res.status(400).json({ success: false, error: 'Missing URL parameter' });
    }
    try {
      console.log('[Scraper] Launching browser...');
      browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath,
        headless: chromium.headless,
        defaultViewport: chromium.defaultViewport
      });
      console.log('[Scraper] Browser launched');
    } catch (err) {
      console.error('[Scraper] Browser launch failed:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to launch browser' });
    }
    let page;
    try {
      page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      console.log('[Scraper] Page loaded:', url);
    } catch (err) {
      console.error('[Scraper] Page navigation failed:', err.message);
      if (browser) { try { await browser.close(); } catch (e) {} }
      return res.status(500).json({ success: false, error: 'Failed to load page' });
    }
    let result;
    try {
      result = await page.evaluate(() => ({
        title: document.title,
        emails: Array.from(document.querySelectorAll('a[href^="mailto:"]')).map(a => a.href),
      }));
      console.log('[Scraper] Extracted emails:', result.emails);
    } catch (err) {
      console.error('[Scraper] Data extraction failed:', err.message);
      if (browser) { try { await browser.close(); } catch (e) {} }
      return res.status(500).json({ success: false, error: 'Failed to extract data' });
    }
    await browser.close();
    return res.status(200).json({ success: true, contacts: result });
  } catch (error) {
    console.error('[Scraper] Unhandled error:', error.message || error);
    if (browser) { try { await browser.close(); } catch (e) {} }
    return res.status(500).json({ success: false, error: error.message || 'Unknown error' });
  }
}