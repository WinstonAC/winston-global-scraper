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
          row.innerHTML = `
            <td class="border px-4 py-2">${i + 1}</td>
            <td class="border px-4 py-2"><a href="${item.url}" class="text-blue-600 underline" target="_blank">${item.title}</a></td>
          `;
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
    const csv = `Index,Title,URL\n` + results.map((r, i) =>
      `${i + 1},"${r.title.replace(/"/g, '""')}","${r.url}"`
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `winston-results.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}); 