import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

export default async function handler(req, res) {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Missing URL parameter' });
  }

  let browser = null;

  try {
    browser = await puppeteerExtra.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Example scraping logic (adjust as needed)
    const data = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
      };
    });

    await browser.close();
    return res.status(200).json({ success: true, data });

  } catch (err) {
    console.error('Scrape error:', err);
    if (browser) await browser.close();
    return res.status(500).json({ error: err.toString() });
  }
}