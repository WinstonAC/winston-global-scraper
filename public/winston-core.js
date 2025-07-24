/**
 * Winston AI Web Scraper - Core Module
 * Modular architecture for plugin integration
 * Version: 2.0 - Investor Ready
 */

class WinstonScraper {
  constructor(config = {}) {
    this.config = {
      apiBaseUrl: config.apiBaseUrl || '',
      defaultMode: config.defaultMode || 'keyword',
      maxBatchKeywords: config.maxBatchKeywords || 5,
      ...config
    };
    
    this.currentRows = [];
    this.serverCsvData = null;
    this.lastCsvId = null;
    this.mode = this.config.defaultMode;
    
    // Bind methods for external use
    this.scrape = this.scrape.bind(this);
    this.exportCSV = this.exportCSV.bind(this);
    this.exportToSheets = this.exportToSheets.bind(this);
  }

  /**
   * Main scraping function - handles all three modes
   * @param {string|string[]} input - Search term, URL, or array of keywords
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Results object
   */
  async scrape(input, options = {}) {
    const mode = options.mode || this.mode;
    
    try {
      let response, data;
      
      switch (mode) {
        case 'batch':
          response = await this.batchSearch(input);
          break;
        case 'url':
          response = await this.urlScrape(input);
          break;
        case 'keyword':
        default:
          response = await this.keywordSearch(input);
          break;
      }
      
      // Store results for export
      this.currentRows = response.rows || [];
      this.serverCsvData = response.csvData || null;
      this.lastCsvId = response.csvId || null;
      
      return response;
    } catch (error) {
      throw new Error(error.message || 'Scraping failed');
    }
  }

  /**
   * Keyword search implementation
   */
  async keywordSearch(keyword) {
    const response = await fetch('/api/scrapeKeyword', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Keyword search failed');
    }
    
    return await response.json();
  }

  /**
   * Batch search implementation
   */
  async batchSearch(keywords) {
    if (typeof keywords === 'string') {
      keywords = keywords.split('\n').map(k => k.trim()).filter(k => k.length > 0);
    }
    
    if (keywords.length === 0) {
      throw new Error('Please enter at least one keyword');
    }
    
    if (keywords.length > this.config.maxBatchKeywords) {
      throw new Error(`Maximum ${this.config.maxBatchKeywords} keywords allowed per batch`);
    }
    
    const response = await fetch('/api/batchScrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Batch search failed');
    }
    
    return await response.json();
  }

  /**
   * URL scraping implementation
   */
  async urlScrape(url) {
    // Auto-add https if not present
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      throw new Error('Please enter a valid URL (e.g., https://example.com)');
    }
    
    const response = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'URL scraping failed');
    }
    
    const data = await response.json();
    
    // Convert URL scraper response to match keyword scraper format
    const rows = data.contacts ? [{ 
      title: data.contacts.title || 'Scraped Page',
      url: url,
      emails: data.contacts.emails ? data.contacts.emails.join(';') : '',
      phones: data.contacts.phones ? data.contacts.phones.join(';') : '',
      tags: 'Corporate',
      contact: data.contacts.title || '',
      jobTitle: '',
      socialMedia: ''
    }] : [];
    
    return { ...data, rows };
  }

  /**
   * Export results as CSV
   */
  exportCSV(filename = null) {
    const csvData = this.serverCsvData || this.generateCsvFromRows();
    if (!csvData) {
      throw new Error('No data to export');
    }
    
    this.downloadCsvData(csvData, filename || `winston-results-${Date.now()}.csv`);
  }

  /**
   * Export results for Google Sheets import
   */
  exportToSheets() {
    const csvData = this.serverCsvData || this.generateCsvFromRows();
    if (!csvData) {
      throw new Error('No data to export');
    }
    
    const filename = `winston-sheets-import-${Date.now()}.csv`;
    this.downloadCsvData(csvData, filename);
    
    // Return instructions for user
    return {
      filename,
      instructions: 'CSV file downloaded successfully!\n\nTo import to Google Sheets:\n1. Go to: https://docs.google.com/spreadsheets/create\n2. Click File → Import\n3. Upload the downloaded CSV file\n4. Choose "Replace spreadsheet" and click Import'
    };
  }

  /**
   * Generate CSV from current rows
   */
  generateCsvFromRows() {
    if (!this.currentRows || this.currentRows.length === 0) return null;
    
    const csvHeader = 'Contact Name,Company/Title,Website,Primary Email,All Emails,Phone Numbers,Tags,Full URL\n';
    const csvRows = this.currentRows.map(r => {
      // Extract primary email (first one)
      const emailList = (r.emails || '').split(';').filter(e => e.trim());
      const primaryEmail = emailList[0] || '';
      const allEmails = emailList.join(', ');
      
      // Format phone numbers
      const phoneList = (r.phones || '').split(';').filter(p => p.trim());
      const formattedPhones = phoneList.map(p => {
        if (p.length === 10) return `(${p.slice(0,3)}) ${p.slice(3,6)}-${p.slice(6)}`;
        if (p.length === 11 && p.startsWith('1')) return `+1 (${p.slice(1,4)}) ${p.slice(4,7)}-${p.slice(7)}`;
        return p;
      }).join(', ');
      
      // Extract company name from URL
      let company = '';
      try {
        company = new URL(r.url).hostname.replace(/^www\./, '');
      } catch {}
      
      // Clean tags
      const cleanTags = (r.tags || '').split(';').filter(t => t.trim()).join(', ');
      
      return [
        `"${(r.contact || '').replace(/"/g, '""')}"`,
        `"${(r.title || company || '').replace(/"/g, '""')}"`,
        `"${company}"`,
        `"${primaryEmail}"`,
        `"${allEmails}"`,
        `"${formattedPhones}"`,
        `"${cleanTags}"`,
        `"${r.url || ''}"`
      ].join(',');
    });
    
    return csvHeader + csvRows.join('\n');
  }

  /**
   * Download CSV data as file
   */
  downloadCsvData(csvData, filename) {
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Get current results
   */
  getResults() {
    return {
      rows: this.currentRows,
      csvData: this.serverCsvData,
      csvId: this.lastCsvId,
      count: this.currentRows.length
    };
  }

  /**
   * Clear current results
   */
  clearResults() {
    this.currentRows = [];
    this.serverCsvData = null;
    this.lastCsvId = null;
  }

  /**
   * Set mode
   */
  setMode(mode) {
    if (['keyword', 'batch', 'url'].includes(mode)) {
      this.mode = mode;
    }
  }
}

// Export for both module and global use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WinstonScraper;
} else {
  window.WinstonScraper = WinstonScraper;
} 