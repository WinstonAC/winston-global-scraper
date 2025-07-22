import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';

export async function writeCSV(data, keyword) {
  const safeKeyword = keyword.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filePath = path.resolve(`results-${safeKeyword}.csv`);
  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: 'title', title: 'Title' },
      { id: 'url', title: 'URL' }
    ]
  });
  await csvWriter.writeRecords(data);
  return filePath;
}
