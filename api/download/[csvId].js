import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export default async function handler(req, res) {
  const { csvId } = req.query;
  
  if (!csvId) {
    return res.status(400).json({ error: 'Missing csvId parameter' });
  }
  
  try {
    // Construct the file path - csvId should include the full filename
    const filePath = join('/tmp', csvId);
    
    // Check if file exists
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'CSV file not found' });
    }
    
    // Read the CSV file
    const csvData = readFileSync(filePath, 'utf8');
    
    // Set appropriate headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${csvId}"`);
    
    // Send the CSV data
    res.status(200).send(csvData);
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download CSV file' });
  }
} 