import chromium from '@sparticuz/chromium';
import fs from 'fs';
import path from 'path';
import { load } from 'cheerio';
import puppeteer from 'puppeteer-core';

const tagRules = [
  { tag: "Women in STEM",        re: /women in stem/i },
  { tag: "Africa",               re: /africa/i },
  { tag: "Corporate",            re: /.com.*(career|about)/i },
  { tag: "University",           re: /\.edu|university|college/i },
  { tag: "Mentor",               re: /\bmentor\b/i },
  { tag: "Mentorship Program",   re: /mentor(?:ing|ship) program|coaching cohort|career mentor/i },
  { tag: "Youth Mentorship",     re: /youth mentor|student mentor|STEM mentor|STEM outreach/i },
  { tag: "Climate Change",       re: /climate change|global warming|net ?zero|decarbon/i },
  { tag: "Sustainability",       re: /sustainab|\bESG\b|green energy|renewable/i },
  
  // 🚀 INVESTOR DETECTION TAGS
  { tag: "Venture Capital",      re: /venture capital|VC firm|\bVC\b|venture partner|investment fund/i },
  { tag: "Angel Investor",       re: /angel investor|angel group|accredited investor|private investor/i },
  { tag: "Startup Funding",      re: /startup funding|seed funding|series [ABC]|pre-seed|funding round/i },
  { tag: "Investment Firm",      re: /investment firm|capital partners|equity partners|growth capital/i },
  { tag: "Female Investor",      re: /female investor|women investor|diversity fund|female-led fund/i },
  { tag: "Tech Investor",        re: /tech investor|technology fund|software investor|AI investor|fintech/i },
  { tag: "Grant Provider",       re: /grant program|foundation grant|startup grant|entrepreneur grant/i },
  { tag: "Accelerator",          re: /accelerator|incubator|startup program|entrepreneur program/i },
  { tag: "Corporate VC",         re: /corporate venture|strategic investor|corporate fund|CVC/i },
  { tag: "Impact Investor",      re: /impact invest|social impact|ESG invest|sustainable invest/i },
  
  // 🌍 GEOGRAPHIC DETECTION TAGS  
  { tag: "San Francisco",        re: /san francisco|SF bay area|silicon valley|palo alto|menlo park/i },
  { tag: "New York",             re: /new york|NYC|manhattan|brooklyn|wall street/i },
  { tag: "Boston",               re: /boston|cambridge|massachusetts|MIT|harvard/i },
  { tag: "Los Angeles",          re: /los angeles|LA|hollywood|santa monica|beverly hills/i },
  { tag: "Seattle",              re: /seattle|bellevue|redmond|washington state/i },
  { tag: "Austin",               re: /austin|texas tech|south by southwest|SXSW/i },
  { tag: "Chicago",              re: /chicago|illinois|windy city/i },
  { tag: "London",               re: /london|UK|united kingdom|england|british/i },
  { tag: "Toronto",              re: /toronto|canada|canadian|ontario/i },
  { tag: "Berlin",               re: /berlin|germany|german|deutschland/i },
  { tag: "Tel Aviv",             re: /tel aviv|israel|israeli/i },
  { tag: "Singapore",            re: /singapore|asia pacific|APAC/i },
  { tag: "India",                re: /india|bangalore|mumbai|delhi|indian/i },
  { tag: "Remote/Global",        re: /remote|global|worldwide|international|distributed team/i }
];

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

// 🚀 QUALITY SCORING FUNCTION
function calculateQualityScore(row) {
  let score = 0;
  
  // Email quality (40 points)
  const emails = (row.emails || '').split(';').filter(e => e.trim());
  if (emails.length > 0) score += 40;
  if (emails.length > 1) score += 10; // Bonus for multiple emails
  
  // Name quality (30 points)
  if (row.contact && row.contact !== 'Unknown Contact' && !row.contact.includes('.')) {
    score += 30;
  } else if (row.contact && row.contact !== 'Unknown Contact') {
    score += 15; // Partial credit for company names
  }
  
  // Phone quality (20 points)
  const phones = (row.phones || '').split(';').filter(p => p.trim());
  if (phones.length > 0) score += 20;
  
  // Job title quality (10 points)
  if (row.jobTitle && row.jobTitle.trim()) score += 10;
  
  // Tag relevance bonus (up to 10 points)
  const tags = (row.tags || '').split(';');
  if (tags.some(tag => tag.includes('Investor') || tag.includes('Founder') || tag.includes('CEO') || tag.includes('Partner'))) {
    score += 10;
  }
  
  return score;
}

async function bingFallback(keyword) { 
  console.warn("[Keyword Scraper] Using Bing fallback...");
  return []; 
}

export default async function handler(req, res) {
  let browser;
  let keyword;
  try {
    const body = req.body;
    keyword = body.keyword;
    const searchDepth = body.searchDepth || 'balanced';
    const pageNum = body.page || 1; // Renamed to avoid conflict with Puppeteer page
    const limit = body.limit || 50; // Configurable result limit
    console.log('[Keyword Scraper] Payload:', { keyword, searchDepth, pageNum, limit }, 'Timestamp:', new Date().toISOString(), 'Vercel Env:', process.env.VERCEL_ENV);
    
    if (!keyword || typeof keyword !== 'string') {
      return res.status(400).json({ error: 'Keyword is required.' });
    }
    
    // Configure search depth with enhanced limits
    const depthConfig = {
      fast: { searchResults: 25, processLinks: 8, maxResults: 100 },
      balanced: { searchResults: 35, processLinks: 12, maxResults: 200 },
      thorough: { searchResults: 45, processLinks: 16, maxResults: 300 }
    };
    
    const config = depthConfig[searchDepth] || depthConfig.balanced;
    
    try {
      console.log('[Keyword Scraper] Launching browser...');
      
      // Use @sparticuz/chromium for Vercel deployment with optimized settings
      browser = await puppeteer.launch({
        args: [...chromium.args, '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
      
      console.log('[Keyword Scraper] Browser launched successfully');
    } catch (err) {
      console.error('[Keyword Scraper] Browser launch failed:', err.message);
      return res.status(500).json({ error: 'Failed to launch browser' });
    }
    
    let page;
    try {
      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.85 Safari/537.36');
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      
      // Add pagination to search URL for DuckDuckGo
      const offset = (pageNum - 1) * 10; // DuckDuckGo uses 10 results per page
      const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}&s=${offset}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      console.log('[Keyword Scraper] Navigated to DuckDuckGo search page', pageNum);
      
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
        return anchors.slice(0, 35).map(a => ({ title: a.innerText, url: a.href })); // Will be overridden by config
      });
      console.log('[Keyword Scraper] Found', links.length, 'results');
    } catch (err) {
      console.error('[Keyword Scraper] Search results extraction failed:', err.message);
      if (browser) { try { await browser.close(); } catch (e) {} }
      return res.status(500).json({ error: 'Failed to extract search results' });
    }
    
    let rows = [];
    // Process links based on search depth configuration
    const linksToProcess = links.slice(0, config.processLinks);
    console.log(`[Keyword Scraper] Processing ${linksToProcess.length} links with ${searchDepth} depth`);
    
    // Enhanced contact extraction with better deduplication
    const seenEmails = new Set();
    const seenPhones = new Set();
    
    for (const link of linksToProcess) {
      try {
        console.log(`[Keyword Scraper] Scraping subpage: ${link.url}`);
        const subPage = await browser.newPage();
        
        // Set shorter timeout for individual pages
        await subPage.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 8000 });
        
        const html = await subPage.content();
        const $ = load(html);
        
        const rawEmails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        const emails = [...new Set(rawEmails)]
          .filter(e => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(e))
          .filter(e => !seenEmails.has(e.toLowerCase())) // Deduplicate emails
          .slice(0, 20);
        
        // Add to seen set
        emails.forEach(e => seenEmails.add(e.toLowerCase()));
        
        // 🚀 ENHANCED PHONE NUMBER EXTRACTION WITH VALIDATION
        const phonePatterns = [
          /\+\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,  // International format
          /\(\d{3}\)[-.\s]?\d{3}[-.\s]?\d{4}/g,                          // US format (123) 456-7890
          /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,                              // US format 123-456-7890
          /\+\d{10,15}/g                                                   // Simple international
        ];
        
        let rawPhones = [];
        phonePatterns.forEach(pattern => {
          const matches = html.match(pattern) || [];
          rawPhones = rawPhones.concat(matches);
        });
        
        // Clean and validate phone numbers with deduplication
        const phones = [...new Set(rawPhones)]
          .map(p => p.replace(/[^\d+]/g, ''))  // Keep only digits and +
          .filter(validatePhoneNumber)  // Use enhanced validation
          .filter(p => !seenPhones.has(p)) // Deduplicate phones
          .slice(0, 5);
        
        // Add to seen set
        phones.forEach(p => seenPhones.add(p));
        
        // 🚀 SOCIAL MEDIA EXTRACTION
        const linkedinMatches = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[a-zA-Z0-9-]+/g) || [];
        const twitterMatches = html.match(/https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+/g) || [];
        const socialMedia = [...new Set([...linkedinMatches, ...twitterMatches])].slice(0, 5);
        
        const tags = tagRules.filter(t => t.re.test(link.title + ' ' + html)).map(t => t.tag);
        const contactInfo = emails.length ? findContactName($, emails[0], link.url) : findContactName($, '', link.url);
        
        // 🚀 JOB TITLE EXTRACTION
        const jobTitlePatterns = [
          /\b(CEO|Chief Executive Officer|Founder|Co-Founder|President|Managing Partner|General Partner|Investment Partner|Partner|Director|VP|Vice President|Manager|Head of|Lead|Owner|Executive|Principal)\b/gi
        ];
        let detectedJobTitles = [];
        for (const pattern of jobTitlePatterns) {
          const matches = html.match(pattern) || [];
          detectedJobTitles = detectedJobTitles.concat(matches);
        }
        const uniqueJobTitles = [...new Set(detectedJobTitles)].slice(0, 3).join(', ');
        
        console.log(`[Keyword Scraper] Extracted emails: ${emails.join(', ')}`);
        console.log(`[Keyword Scraper] Contact name: ${contactInfo.name}`);
        console.log(`[Keyword Scraper] Job titles: ${uniqueJobTitles}`);
        console.log(`[Keyword Scraper] Tags: ${tags.join(', ')}`);
        
        const row = { 
          title: link.title, 
          url: link.url, 
          emails: emails.join(';'), 
          phones: phones.join(';'), 
          tags: tags.join(';'), 
          contact: contactInfo.name,
          jobTitle: contactInfo.jobTitle || uniqueJobTitles,
          socialMedia: socialMedia.join(';')
        };
        
        // Only add rows with minimum quality threshold
        const qualityScore = calculateQualityScore(row);
        if (qualityScore >= 30) { // Minimum quality threshold
          row.qualityScore = qualityScore;
          rows.push(row);
        }
        
        await subPage.close();
      } catch (err) {
        console.error('[Keyword Scraper] Subpage scrape failed:', err.message);
        // Continue processing other links even if one fails
      }
    }
    
    await browser.close();
    
    // Sort by quality score (highest first)
    rows.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
    
    // Apply pagination and limits
    const startIndex = (pageNum - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedRows = rows.slice(startIndex, endIndex);
    
    if (rows.length < 3) {
      const bingRows = await bingFallback(keyword);
      rows = rows.concat(bingRows);
    }
    
    let id = Date.now();
    const outputDir = '/tmp';
    fs.mkdirSync(outputDir, { recursive: true });
    const csvFilename = `results_${id}.csv`;
    const filename = path.join(outputDir, csvFilename);
    
    // Create spreadsheet-friendly CSV with better formatting
    const csvHeader = 'Contact Name,Job Title,Company/Title,Website,Primary Email,All Emails,Phone Numbers,Social Media,Tags,Quality Score,Full URL\n';
    const csvRows = paginatedRows.map(r => {
      // Extract primary email (first one)
      const emailList = (r.emails || '').split(';').filter(e => e.trim());
      const primaryEmail = emailList[0] || '';
      const allEmails = emailList.join(', ');
      
      // 📱 ENHANCED PHONE FORMATTING
      const phoneList = (r.phones || '').split(';').filter(p => p.trim());
      const formattedPhones = phoneList.map(p => {
        const digits = p.replace(/\D/g, '');
        
        // US/Canada numbers
        if (digits.length === 10) {
          return `+1 (${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
        }
        // US/Canada with country code
        if (digits.length === 11 && digits.startsWith('1')) {
          return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
        }
        // International numbers
        if (digits.length > 11) {
          return `+${digits}`;
        }
        // Other formats
        if (digits.length >= 10) {
          return `+${digits.slice(0,2)} (${digits.slice(2,5)}) ${digits.slice(5,8)}-${digits.slice(8)}`;
        }
        return p;
      }).join(', ');
      
      // Extract company name from URL
      let company = '';
      try {
        company = new URL(r.url).hostname.replace(/^www\./, '');
      } catch {}
      
      // Clean tags and social media
      const cleanTags = (r.tags || '').split(';').filter(t => t.trim()).join(', ');
      const cleanSocialMedia = (r.socialMedia || '').split(';').filter(s => s.trim()).join(', ');
      
      return [
        `"${(r.contact || '').replace(/"/g, '""')}"`,           // Contact Name
        `"${(r.jobTitle || '').replace(/"/g, '""')}"`,          // Job Title
        `"${(r.title || company || '').replace(/"/g, '""')}"`,  // Company/Title
        `"${company}"`,                                          // Website
        `"${primaryEmail}"`,                                     // Primary Email
        `"${allEmails}"`,                                        // All Emails
        `"${formattedPhones}"`,                                  // Phone Numbers
        `"${cleanSocialMedia}"`,                                 // Social Media Profiles
        `"${cleanTags}"`,                                        // Tags
        `"${r.qualityScore || 0}"`,                             // Quality Score
        `"${r.url || ''}"`                                       // Full URL
      ].join(',');
    }).join('\n');
    const csv = csvHeader + csvRows;
    fs.writeFileSync(filename, csv);
    
    console.log(`[Keyword Scraper] Results written to: ${csvFilename} - Processed ${paginatedRows.length} results (page ${pageNum} of ${Math.ceil(rows.length / limit)})`);
    
    // Enhanced response with pagination info
    res.status(200).json({ 
      rows: paginatedRows, 
      csvId: csvFilename,
      csvData: csv,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(rows.length / limit),
        totalResults: rows.length,
        resultsPerPage: limit,
        hasMore: pageNum < Math.ceil(rows.length / limit)
      }
    });
  } catch (error) {
    console.error('[Keyword Scraper] Unhandled error:', error.message || error);
    if (browser) { try { await browser.close(); } catch (e) {} }
    res.status(500).json({ error: 'Scrape failed' });
  }
} 