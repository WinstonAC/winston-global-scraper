import { NextResponse } from 'next/server';
import chromium from 'chrome-aws-lambda';

let puppeteer, StealthPlugin;
try {
  puppeteer = require('puppeteer-extra');
  StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());
} catch (err) {
  console.error('[Scraper] Failed to load puppeteer-extra or stealth plugin:', err.message);
  throw new Error('Required Puppeteer modules not found. Please install puppeteer-extra and puppeteer-extra-plugin-stealth.');
}

export async function POST(req) {
  let browser;
  let url;
  try {
    const body = await req.json();
    url = body.url;
    console.log('[Scraper] Payload:', { url }, 'Timestamp:', new Date().toISOString(), 'Vercel Env:', process.env.VERCEL_ENV);
    if (!url) {
      return NextResponse.json({ success: false, error: 'Missing URL parameter' }, { status: 400 });
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
      return NextResponse.json({ success: false, error: 'Failed to launch browser' }, { status: 500 });
    }
    let page;
    try {
      page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      console.log('[Scraper] Page loaded:', url);
    } catch (err) {
      console.error('[Scraper] Page navigation failed:', err.message);
      if (browser) { try { await browser.close(); } catch (e) {} }
      return NextResponse.json({ success: false, error: 'Failed to load page' }, { status: 500 });
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
      return NextResponse.json({ success: false, error: 'Failed to extract data' }, { status: 500 });
    }
    await browser.close();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[Scraper] Unhandled error:', error.message || error);
    if (browser) { try { await browser.close(); } catch (e) {} }
    return NextResponse.json({ success: false, error: error.message || 'Unknown error' }, { status: 500 });
  }
}