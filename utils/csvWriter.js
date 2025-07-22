import fs from 'fs';
import { createObjectCsvWriter } from 'csv-writer';

export async function writeToCSV(data, keyword = 'output') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = `./public/${keyword}-${timestamp}.csv`;

  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: 'title', title: 'Title' },
      { id: 'url', title: 'URL' },
      { id: 'tags', title: 'Tags' },
    ],
  });

  try {
    await csvWriter.writeRecords(data);
    console.log(`✅ CSV saved: ${filePath}`);
  } catch (err) {
    console.error('❌ Failed to write CSV:', err);
  }
}
