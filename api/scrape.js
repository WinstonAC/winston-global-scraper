import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  let browser;
  let url;
  
  // Set a timeout for the entire function
  const timeoutId = setTimeout(() => {
    console.error('[Scraper] Function timeout, closing...');
    if (browser) { 
      browser.close().catch(() => {}); 
    }
    if (!res.headersSent) {
      res.status(408).json({ success: false, error: 'Request timeout' });
    }
  }, 40000); // 40 second timeout
  
  try {
    const body = req.body;
    url = body.url;
    console.log('[Scraper] Payload:', { url }, 'Timestamp:', new Date().toISOString());
    
    if (!url) {
      clearTimeout(timeoutId);
      return res.status(400).json({ success: false, error: 'Missing URL parameter' });
    }
    
    console.log('[Scraper] Launching browser...');
    
    // Ultra-lightweight browser launch
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--no-first-run',
        '--single-process'
      ],
      defaultViewport: { width: 1024, height: 768 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });
    
    console.log('[Scraper] Browser launched, creating page...');
    
    const page = await browser.newPage();
    
    // Set a very short timeout for page navigation
    await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 15000 
    });
    
    console.log('[Scraper] Page loaded, extracting data...');
    
    // Quick data extraction
    const result = await page.evaluate(() => {
      const title = document.title || 'Untitled';
      const emailLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
      const emails = emailLinks.map(a => a.href.replace('mailto:', '')).slice(0, 10); // Limit to 10 emails
      
      return { title, emails };
    });
    
    console.log('[Scraper] Data extracted:', result);
    
    await browser.close();
    clearTimeout(timeoutId);
    
    // Generate CSV file if emails were found
    let csvId = null;
    if (result.emails && result.emails.length > 0) {
      const id = Date.now();
      const outputDir = '/tmp';
      fs.mkdirSync(outputDir, { recursive: true });
      const csvFilename = `results_${id}.csv`;
      const filename = path.join(outputDir, csvFilename);
      const csvHeader = 'Title,URL,Emails,Phones,Tags,Contact\n';
      const csvRow = `"${result.title.replace(/"/g, '""')}","${url}","${result.emails.join(';')}","","","${result.title}"`;
      const csv = csvHeader + csvRow;
      fs.writeFileSync(filename, csv);
      csvId = csvFilename;
      console.log(`[Scraper] CSV written to: ${csvFilename}`);
    }
    
    return res.status(200).json({ 
      success: true, 
      contacts: result, 
      csvId,
      csvData: csvId ? csv : null // Include CSV data if generated
    });
  } catch (error) {
    console.error('[Scraper] Error:', error.message);
    clearTimeout(timeoutId);
    
    if (browser) { 
      try { await browser.close(); } catch (e) {} 
    }
    
    if (!res.headersSent) {
      return res.status(500).json({ 
        success: false, 
        error: 'Scrape failed: ' + error.message 
      });
    }
  }
}