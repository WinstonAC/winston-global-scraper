import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

// 🚀 ENHANCED PHONE VALIDATION - Filter out timestamps and invalid numbers
function validatePhoneNumber(phone) {
  const digits = phone.replace(/\D/g, '');
  
  // Reject obvious timestamps and invalid patterns
  if (digits.length < 10 || digits.length > 15) return false;
  
  // Reject numbers that look like timestamps (common patterns)
  const timestampPatterns = [
    /^1[0-9]{9}$/,           // 10-digit numbers starting with 1 (often timestamps)
    /^2[0-9]{9}$/,           // 10-digit numbers starting with 2 (often timestamps)
    /^[0-9]{8}$/,            // 8-digit numbers (often dates)
    /^[0-9]{6}$/,            // 6-digit numbers (often dates)
    /^[0-9]{4}$/,            // 4-digit numbers (often years)
  ];
  
  for (const pattern of timestampPatterns) {
    if (pattern.test(digits)) return false;
  }
  
  // Reject numbers that are all the same digit
  if (/^(\d)\1+$/.test(digits)) return false;
  
  // Reject numbers that are sequential
  if (/0123456789|1234567890|9876543210|0987654321/.test(digits)) return false;
  
  // Validate country codes for international numbers
  if (digits.length > 10) {
    const countryCode = digits.slice(0, -10);
    const validCountryCodes = ['1', '44', '33', '49', '81', '86', '91', '61', '55', '7', '34', '39', '31', '46', '47', '45', '358', '46', '47', '45'];
    if (!validCountryCodes.includes(countryCode)) return false;
  }
  
  return true;
}

// 🚀 ENHANCED CONTACT NAME EXTRACTION
function findContactName($, firstEmail, targetUrl) {
  let name = '';
  let jobTitle = '';
  
  // Method 1: Look for names near email addresses
  if (firstEmail) {
    const emailNode = $(`*:contains('${firstEmail}')`).first();
    let prevText = [];
    let node = emailNode[0];
    let count = 0;
    while (node && count < 50) { // Increased context window
      node = node.prev;
      if (node && node.type === 'text' && node.data) {
        prevText.unshift(node.data.trim());
        count++;
      }
    }
    const context = prevText.join(' ');
    
    // Enhanced name patterns for business contacts
    const namePatterns = [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})(?:\s*,?\s*(CEO|CTO|CFO|COO|Founder|Co-Founder|Partner|Director|Manager|VP|President|Investor|Owner|Executive|Principal))/i,
      /(CEO|CTO|CFO|COO|Founder|Co-Founder|Partner|Director|Manager|VP|President|Investor|Owner|Executive|Principal)[\s:,-]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
      /Contact[\s:]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
      /([A-Z][a-z]+\s+[A-Z][a-z]+)[\s,-]+(?:CEO|CTO|CFO|COO|Founder|Co-Founder|Partner|Director|Manager|VP|President|Investor|Owner|Executive|Principal)/i
    ];
    
    for (const pattern of namePatterns) {
      const match = context.match(pattern);
      if (match) {
        name = match[1] || match[2];
        jobTitle = match[2] || match[1];
        break;
      }
    }
  }
  
  // Method 2: Search entire page for business contact patterns
  if (!name) {
    const bodyText = $('body').text();
    const businessContactPatterns = [
      /(?:CEO|CTO|CFO|COO|Founder|Co-Founder|Partner|Director|Manager|VP|President|Investor|Owner|Executive|Principal)[\s:,-]+([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
      /([A-Z][a-z]+\s+[A-Z][a-z]+)[\s,-]+(?:CEO|CTO|CFO|COO|Founder|Co-Founder|Partner|Director|Manager|VP|President|Investor|Owner|Executive|Principal)/gi,
      /(?:Contact|Email|Reach)[\s:]+([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
      /([A-Z][a-z]+\s+[A-Z][a-z]+)[\s,-]+(?:@|email|contact)/gi
    ];
    
    for (const pattern of businessContactPatterns) {
      const matches = bodyText.match(pattern);
      if (matches && matches.length > 0) {
        // Extract the name from the first match
        const nameMatch = matches[0].match(/([A-Z][a-z]+\s+[A-Z][a-z]+)/);
        if (nameMatch) {
          name = nameMatch[1].trim();
          break;
        }
      }
    }
  }
  
  // Method 3: Check meta tags
  if (!name) {
    name = $('meta[name="author"]').attr('content')?.trim();
  }
  if (!name) {
    name = $('meta[property="og:author"]').attr('content')?.trim();
  }
  
  // Method 4: Extract from title or heading
  if (!name) {
    const title = $('title').text();
    const h1 = $('h1').first().text();
    const nameFromTitle = (title + ' ' + h1).match(/([A-Z][a-z]+\s+[A-Z][a-z]+)/);
    if (nameFromTitle) {
      name = nameFromTitle[1];
    }
  }
  
  // Fallback to hostname if no name found
  if (!name) {
    name = new URL(targetUrl).hostname.replace(/^www\./,'').replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
  
  return { name: name || '', jobTitle: jobTitle || '' };
}

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
      const csvHeader = 'Contact Name,Job Title,Company/Title,Website,Primary Email,All Emails,Phone Numbers,Tags,Quality Score,Full URL\n';
      
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
        `""`,                                                        // Job Title
        `"${(result.title || '').replace(/"/g, '""')}"`,            // Company/Title  
        `"${company}"`,                                              // Website
        `"${primaryEmail}"`,                                         // Primary Email
        `"${allEmails}"`,                                           // All Emails
        `"${formattedPhones}"`,                                     // Phone Numbers
        `"Corporate"`,                                              // Tags (Corporate for direct URL)
        `"70"`,                                                     // Quality Score (high for direct URL)
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