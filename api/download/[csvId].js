import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  try {
    const { csvId } = req.query;
    
    if (!csvId) {
      return res.status(400).json({ error: 'CSV ID is required' });
    }
    
    const filename = path.join('/tmp', `results_${csvId}.csv`);
    
    if (!fs.existsSync(filename)) {
      return res.status(404).json({ error: 'CSV file not found' });
    }
    
    const csvContent = fs.readFileSync(filename, 'utf8');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="winston-results-${csvId}.csv"`);
    res.status(200).send(csvContent);
  } catch (error) {
    console.error('[Download] Error:', error.message);
    res.status(500).json({ error: 'Failed to download CSV' });
  }
} 