import chromium from 'chrome-aws-lambda';
import puppeteerCore from 'puppeteer-core';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Patch stealth plugin to skip 'chrome.app' evasion
const pluginStealth = StealthPlugin();
pluginStealth.enabledEvasions.delete('chrome.app');
puppeteerExtra.use(pluginStealth);

export default async function handler(req, res) {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing URL parameter' });

  let browser;
  try {
    browser = await puppeteerExtra.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Scraping logic: return page title and URL
    const data = await page.evaluate(() => ({
      title: document.title,
      url: window.location.href,
    }));

    await browser.close();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Scrape error:', error.stack || error);
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    return res.status(500).json({ error: error.message || error.toString() });
  }
}