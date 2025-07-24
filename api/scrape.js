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
      const emails = emailLinks.map(a => a.href.replace('mailto:', '')).slice(0, 25); // Increased to 25 emails
      
      // 📱 PHONE NUMBER EXTRACTION (matching other scrapers)
      const html = document.documentElement.outerHTML;
      const phonePatterns = [
        /\+\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
        /\(\d{3}\)[-.\s]?\d{3}[-.\s]?\d{4}/g,
        /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
        /\+\d{10,15}/g
      ];
      
      let rawPhones = [];
      phonePatterns.forEach(pattern => {
        const matches = html.match(pattern) || [];
        rawPhones = rawPhones.concat(matches);
      });
      
      const phones = [...new Set(rawPhones)]
        .map(p => p.replace(/[^\d+]/g, ''))
        .filter(p => {
          const digits = p.replace(/\D/g, '');
          return digits.length >= 10 && digits.length <= 15 && 
                 !digits.match(/^(19|20)\d{6}/) &&
                 !digits.match(/^\d{8}$/) &&
                 digits.length !== 8;
        })
        .slice(0, 5);
      
      return { title, emails, phones };
    });
    
    console.log('[Scraper] Data extracted:', result);
    
    await browser.close();
    clearTimeout(timeoutId);
    
    // Generate CSV file if emails were found
    let csvId = null;
    let csvData = null;
    
    if (result.emails && result.emails.length > 0) {
      const id = Date.now();
      const outputDir = '/tmp';
      fs.mkdirSync(outputDir, { recursive: true });
      const csvFilename = `results_${id}.csv`;
      const filename = path.join(outputDir, csvFilename);
      // Create spreadsheet-friendly CSV with better formatting  
      const csvHeader = 'Contact Name,Company/Title,Website,Primary Email,All Emails,Phone Numbers,Tags,Full URL\n';
      
      // Extract company name from URL
      let company = '';
      try {
        company = new URL(url).hostname.replace(/^www\./, '');
      } catch {}
      
      const primaryEmail = result.emails[0] || '';
      const allEmails = result.emails.join(', ');
      
      // 📱 Format phone numbers same as other scrapers
      const phoneList = result.phones || [];
      const formattedPhones = phoneList.map(p => {
        const digits = p.replace(/\D/g, '');
        if (digits.length === 10) {
          return `+1 (${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
        }
        if (digits.length === 11 && digits.startsWith('1')) {
          return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
        }
        if (digits.length > 11) {
          return `+${digits}`;
        }
        if (digits.length >= 10) {
          return `+${digits.slice(0,2)} (${digits.slice(2,5)}) ${digits.slice(5,8)}-${digits.slice(8)}`;
        }
        return p;
      }).join(', ');
      
      const csvRow = [
        `"${(result.title || company || '').replace(/"/g, '""')}"`,  // Contact Name
        `"${(result.title || '').replace(/"/g, '""')}"`,            // Company/Title  
        `"${company}"`,                                              // Website
        `"${primaryEmail}"`,                                         // Primary Email
        `"${allEmails}"`,                                           // All Emails
        `"${formattedPhones}"`,                                     // Phone Numbers
        `"Corporate"`,                                              // Tags (Corporate for direct URL)
        `"${url}"`                                                  // Full URL
      ].join(',');
      csvData = csvHeader + csvRow;
      fs.writeFileSync(filename, csvData);
      csvId = csvFilename;
      console.log(`[Scraper] CSV written to: ${csvFilename}`);
    }
    
    return res.status(200).json({ 
      success: true, 
      contacts: result, 
      csvId,
      csvData // Include CSV data if generated
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