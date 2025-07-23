import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

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
      
      // Use @sparticuz/chromium for Vercel deployment with optimized settings
      browser = await puppeteer.launch({
        args: [...chromium.args, '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
      
      console.log('[Scraper] Browser launched successfully');
    } catch (err) {
      console.error('[Scraper] Browser launch failed:', err.message);
      return res.status(500).json({ success: false, error: 'Failed to launch browser' });
    }
    
    let page;
    try {
      page = await browser.newPage();
      
      // Set shorter timeout for direct URL scraping to avoid 504 errors
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
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
        emails: Array.from(document.querySelectorAll('a[href^="mailto:"]')).map(a => a.href.replace('mailto:', '')),
      }));
      console.log('[Scraper] Extracted data:', result);
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