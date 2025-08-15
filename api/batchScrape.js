import chromium from '@sparticuz/chromium';
import fs from 'fs';
import path from 'path';
import { load } from 'cheerio';
import puppeteer from 'puppeteer-core';
import { defaultRateLimit } from '../utils/rateLimit.js';

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

function findContactName($, firstEmail, targetUrl) {
  let name = '';
  let jobTitle = '';
  
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
    
    // 🚀 ENHANCED NAME EXTRACTION
    const nameMatch = context.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})(?:\s*,?\s*(CEO|CTO|CFO|COO|Founder|Co-Founder|Partner|Director|Manager|VP|President|Investor))?/i);
    if (nameMatch) {
      name = nameMatch[1].trim();
      jobTitle = nameMatch[2] || '';
    }
  }
  
  // 🚀 ADDITIONAL NAME EXTRACTION METHODS
  if (!name) {
    // Try to find names in common patterns
    const bodyText = $('body').text();
    const namePatterns = [
      /(?:CEO|Founder|Partner|Director)[\s:,-]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
      /([A-Z][a-z]+\s+[A-Z][a-z]+)[\s,-]+(?:CEO|Founder|Partner|Director)/i,
      /Contact[\s:]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i
    ];
    
    for (const pattern of namePatterns) {
      const match = bodyText.match(pattern);
      if (match) {
        name = match[1].trim();
        break;
      }
    }
  }
  
  if (!name) {
    name = $('meta[name="author"]').attr('content')?.trim();
  }
  if (!name) name = new URL(targetUrl).hostname.replace(/^www\./,'');
  
  return { name: name || '', jobTitle: jobTitle || '' };
}

async function scrapeKeyword(browser, keyword) {
  console.log(`[Batch Scraper] Processing keyword: ${keyword}`);
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.85 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    await page.waitForSelector('a[data-testid="result-title-a"]', { timeout: 10000 });
    
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[data-testid="result-title-a"]'));
      return anchors.slice(0, 10).map(a => ({ title: a.innerText, url: a.href })); // Reduced to 10 for batch processing
    });
    
    await page.close();
    
    let rows = [];
    // Process first 5 links for batch mode
    const linksToProcess = links.slice(0, 5);
    
    for (const link of linksToProcess) {
      try {
        const subPage = await browser.newPage();
        await subPage.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 8000 });
        
        const html = await subPage.content();
        const $ = load(html);
        
        const rawEmails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        const emails = [...new Set(rawEmails)].filter(e => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(e)).slice(0, 10);
        
        // 📱 ENHANCED PHONE NUMBER EXTRACTION
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
        
        // Clean and validate phone numbers
        const phones = [...new Set(rawPhones)]
          .map(p => p.replace(/[^\d+]/g, ''))  // Keep only digits and +
          .filter(p => {
            const digits = p.replace(/\D/g, '');
            return digits.length >= 10 && digits.length <= 15 && 
                   !digits.match(/^(19|20)\d{6}/) && // Exclude dates like 20200728
                   !digits.match(/^\d{8}$/) &&       // Exclude 8-digit dates
                   digits.length !== 8;             // Exclude simple dates
          })
          .slice(0, 3);
        
        // 🚀 SOCIAL MEDIA EXTRACTION
        const linkedinMatches = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[a-zA-Z0-9-]+/g) || [];
        const twitterMatches = html.match(/https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+/g) || [];
        const socialMedia = [...new Set([...linkedinMatches, ...twitterMatches])].slice(0, 3);
        
        const tags = tagRules.filter(t => t.re.test(link.title + ' ' + html)).map(t => t.tag);
        const contactInfo = emails.length ? findContactName($, emails[0], link.url) : findContactName($, '', link.url);
        
        // 🚀 JOB TITLE EXTRACTION
        const jobTitlePatterns = [
          /\b(CEO|Chief Executive Officer|Founder|Co-Founder|President|Managing Partner|General Partner|Investment Partner|Partner|Director|VP|Vice President|Manager|Head of|Lead)\b/gi
        ];
        let detectedJobTitles = [];
        for (const pattern of jobTitlePatterns) {
          const matches = html.match(pattern) || [];
          detectedJobTitles = detectedJobTitles.concat(matches);
        }
        const uniqueJobTitles = [...new Set(detectedJobTitles)].slice(0, 2).join(', ');
        
        rows.push({ 
          title: link.title, 
          url: link.url, 
          emails: emails.join(';'), 
          phones: phones.join(';'), 
          tags: tags.join(';'), 
          contact: contactInfo.name,
          jobTitle: contactInfo.jobTitle || uniqueJobTitles,
          socialMedia: socialMedia.join(';'),
          keyword: keyword // Track which keyword found this result
        });
        
        await subPage.close();
      } catch (err) {
        console.error(`[Batch Scraper] Subpage scrape failed for ${link.url}:`, err.message);
      }
    }
    
    console.log(`[Batch Scraper] Completed keyword "${keyword}" - found ${rows.length} results`);
    return rows;
    
  } catch (error) {
    console.error(`[Batch Scraper] Keyword "${keyword}" failed:`, error.message);
    return [];
  }
}

export default async function handler(req, res) {
  // 🔒 HTTP METHOD RESTRICTION - Only allow POST for batch scraping
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed', 
      message: 'Only POST requests are allowed for this endpoint' 
    });
  }
  
  // 🔒 Apply rate limiting
  defaultRateLimit(req, res);
  
  let browser;
  
  try {
    const body = req.body;
    const { keywords } = body;
    
    console.log('[Batch Scraper] Payload:', { keywords }, 'Timestamp:', new Date().toISOString());
    
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: 'Keywords array is required.' });
    }
    
    if (keywords.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 keywords allowed per batch.' });
    }
    
    console.log('[Batch Scraper] Launching browser...');
    
    browser = await puppeteer.launch({
      args: [...chromium.args, '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });
    
    console.log('[Batch Scraper] Browser launched successfully');
    
    // Process all keywords
    let allRows = [];
    for (const keyword of keywords) {
      const keywordRows = await scrapeKeyword(browser, keyword.trim());
      allRows = allRows.concat(keywordRows);
    }
    
    await browser.close();
    
    // Remove duplicates based on URL
    const uniqueRows = allRows.filter((row, index, self) => 
      index === self.findIndex((r) => r.url === row.url)
    );
    
    console.log(`[Batch Scraper] Total unique results: ${uniqueRows.length}`);
    
    // Generate CSV
    const id = Date.now();
    const outputDir = '/tmp';
    fs.mkdirSync(outputDir, { recursive: true });
    const csvFilename = `batch_results_${id}.csv`;
    const filename = path.join(outputDir, csvFilename);
    
    const csvHeader = 'Contact Name,Job Title,Company/Title,Website,Primary Email,All Emails,Phone Numbers,Social Media,Tags,Search Keyword,Full URL\n';
    const csvRows = uniqueRows.map(r => {
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
      
      let company = '';
      try {
        company = new URL(r.url).hostname.replace(/^www\./, '');
      } catch {}
      
      const cleanTags = (r.tags || '').split(';').filter(t => t.trim()).join(', ');
      const cleanSocialMedia = (r.socialMedia || '').split(';').filter(s => s.trim()).join(', ');
      
      return [
        `"${(r.contact || '').replace(/"/g, '""')}"`,
        `"${(r.jobTitle || '').replace(/"/g, '""')}"`,
        `"${(r.title || company || '').replace(/"/g, '""')}"`,
        `"${company}"`,
        `"${primaryEmail}"`,
        `"${allEmails}"`,
        `"${formattedPhones}"`,
        `"${cleanSocialMedia}"`,
        `"${cleanTags}"`,
        `"${(r.keyword || '').replace(/"/g, '""')}"`,
        `"${r.url || ''}"`
      ].join(',');
    }).join('\n');
    
    const csv = csvHeader + csvRows;
    fs.writeFileSync(filename, csv);
    
    console.log(`[Batch Scraper] Results written to: ${csvFilename}`);
    
    res.status(200).json({ 
      rows: uniqueRows, 
      csvId: csvFilename,
      csvData: csv,
      summary: {
        totalResults: uniqueRows.length,
        keywordsProcessed: keywords.length,
        duplicatesRemoved: allRows.length - uniqueRows.length
      }
    });
    
  } catch (error) {
    console.error('[Batch Scraper] Unhandled error:', error.message || error);
    if (browser) { try { await browser.close(); } catch (e) {} }
    res.status(500).json({ error: 'Batch scrape failed' });
  }
} 