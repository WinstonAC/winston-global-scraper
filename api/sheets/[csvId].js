import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export default async function handler(req, res) {
  const { csvId } = req.query;
  
  if (!csvId) {
    return res.status(400).json({ error: 'Missing csvId parameter' });
  }
  
  try {
    // Construct the file path
    const filePath = join('/tmp', csvId);
    
    // Check if file exists
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'CSV file not found' });
    }
    
    // Read the CSV file
    const csvData = readFileSync(filePath, 'utf8');
    
    // Parse CSV data into rows
    const lines = csvData.trim().split('\n');
    const rows = lines.map(line => {
      // Simple CSV parsing - handles quoted fields
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
    
    // Create Google Sheets URL with pre-filled data
    // Google Sheets import URL format
    const encodedCsv = encodeURIComponent(csvData);
    const sheetsUrl = `https://docs.google.com/spreadsheets/d/1mJbOT8-KwKqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKqK/edit#gid=0`;
    
    // For better UX, we'll return a response that includes both the data and instructions
    const response = {
      success: true,
      message: 'Google Sheets data prepared',
      data: rows,
      instructions: 'Copy the CSV data and paste it into a new Google Sheet',
      csvData: csvData,
      alternativeUrl: `https://docs.google.com/spreadsheets/create`
    };
    
    res.status(200).json(response);
    
  } catch (error) {
    console.error('Google Sheets preparation error:', error);
    res.status(500).json({ error: 'Failed to prepare Google Sheets data' });
  }
} 