document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('scrape-form');
  const input = document.getElementById('keyword');
  const scrapeBtn = document.getElementById('scrape-btn');
  const errorEl = document.getElementById('error');
  const loadingEl = document.getElementById('loading');
  const table = document.getElementById('results-table');
  const tbody = table.querySelector('tbody');
  const downloadBtn = document.getElementById('download-btn');

  let results = [];

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    loadingEl.classList.remove('hidden');
    scrapeBtn.disabled = true;
    downloadBtn.classList.add('hidden');
    tbody.innerHTML = '';
    results = [];

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: input.value })
      });

      if (!res.ok) throw new Error(`Server error: ${res.statusText}`);

      const data = await res.json();
      results = data.results;
      console.log('✅ Results received from backend:', results);

      if (!results || results.length === 0) {
        errorEl.textContent = 'No results found.';
      } else {
        results.forEach((item, i) => {
          const row = document.createElement('tr');
          
          // 🔒 XSS PROTECTION: Create table cells safely without innerHTML
          const indexCell = document.createElement('td');
          indexCell.className = 'border px-4 py-2';
          indexCell.textContent = i + 1;
          
          const titleCell = document.createElement('td');
          titleCell.className = 'border px-4 py-2';
          
          const titleDiv = document.createElement('div');
          titleDiv.className = 'font-semibold';
          titleDiv.textContent = item.title || 'N/A';
          
          const contactDiv = document.createElement('div');
          contactDiv.className = 'text-sm text-gray-600';
          contactDiv.textContent = item.contact || 'N/A';
          
          titleCell.appendChild(titleDiv);
          titleCell.appendChild(contactDiv);
          
          const jobTitleCell = document.createElement('td');
          jobTitleCell.className = 'border px-4 py-2';
          jobTitleCell.textContent = item.jobTitle || 'N/A';
          
          const urlCell = document.createElement('td');
          urlCell.className = 'border px-4 py-2';
          
          const urlLink = document.createElement('a');
          urlLink.href = escapeUrl(item.url || '');
          urlLink.className = 'text-blue-600 underline';
          urlLink.target = '_blank';
          urlLink.textContent = item.url || 'N/A';
          
          urlCell.appendChild(urlLink);
          
          const emailCell = document.createElement('td');
          emailCell.className = 'border px-4 py-2';
          emailCell.textContent = item.email || 'N/A';
          
          const phoneCell = document.createElement('td');
          phoneCell.className = 'border px-4 py-2';
          phoneCell.textContent = item.phone || 'N/A';
          
          const tagsCell = document.createElement('td');
          tagsCell.className = 'border px-4 py-2';
          tagsCell.textContent = item.tags || 'N/A';
          
          const scoreCell = document.createElement('td');
          scoreCell.className = 'border px-4 py-2';
          
          const scoreSpan = document.createElement('span');
          scoreSpan.className = 'px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs';
          scoreSpan.textContent = item.qualityScore || 0;
          
          scoreCell.appendChild(scoreSpan);
          
          // Append all cells to the row
          row.appendChild(indexCell);
          row.appendChild(titleCell);
          row.appendChild(jobTitleCell);
          row.appendChild(urlCell);
          row.appendChild(emailCell);
          row.appendChild(phoneCell);
          row.appendChild(tagsCell);
          row.appendChild(scoreCell);
          
          tbody.appendChild(row);
        });
        downloadBtn.classList.remove('hidden');
      }

    } catch (err) {
      console.error('❌ Fetch or render error:', err);
      errorEl.textContent = 'Something went wrong: ' + err.message;
    } finally {
      loadingEl.classList.add('hidden');
      scrapeBtn.disabled = false;
    }
  });

  downloadBtn.addEventListener('click', () => {
    if (!results || results.length === 0) {
      alert('No results to download');
      return;
    }

    const csv = `Index,Title,URL,Contact Name,Job Title,Email,Phone,Tags,Quality Score\n` + 
      results.map((r, i) =>
        `${i + 1},"${escapeCSVField(r.title || '')}","${escapeCSVField(r.url || '')}","${escapeCSVField(r.contact || '')}","${escapeCSVField(r.jobTitle || '')}","${escapeCSVField(r.email || '')}","${escapeCSVField(r.phone || '')}","${escapeCSVField(r.tags || '')}",${r.qualityScore || 0}`
      ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `winston-results-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});

// 🔒 XSS PROTECTION: Safe HTML escaping functions
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 🔒 XSS PROTECTION: Safe URL validation and escaping
function escapeUrl(url) {
  if (typeof url !== 'string') return '#';
  
  try {
    // Basic URL validation
    const urlObj = new URL(url);
    
    // Only allow HTTP and HTTPS protocols
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return '#';
    }
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /on\w+\s*=/i,  // onclick=, onload=, etc.
      /<script/i,
      /<iframe/i,
      /<object/i,
      /<embed/i
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(url)) {
        console.warn('[SECURITY] Suspicious URL blocked:', url);
        return '#';
      }
    }
    
    return url;
  } catch (error) {
    // If URL parsing fails, return safe fallback
    console.warn('[SECURITY] Invalid URL blocked:', url);
    return '#';
  }
}

// 🔒 CSV PROTECTION: Safe CSV field escaping
function escapeCSVField(text) {
  if (typeof text !== 'string') return '';
  
  // Remove any potentially dangerous characters
  const cleaned = text
    .replace(/"/g, '""')  // Escape quotes
    .replace(/\r/g, '')   // Remove carriage returns
    .replace(/\n/g, ' ')  // Replace newlines with spaces
    .replace(/\t/g, ' ')  // Replace tabs with spaces
    .replace(/[^\x20-\x7E]/g, ''); // Only allow printable ASCII characters
  
  return cleaned;
} 