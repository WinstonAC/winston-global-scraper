import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as XLSX from 'xlsx';

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
    
    // Parse CSV and convert to worksheet
    const workbook = XLSX.read(csvData, { type: 'string' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // Create new workbook with formatted data
    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, worksheet, 'Winston Contacts');
    
    // Generate XLSX buffer
    const xlsxBuffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Set appropriate headers for XLSX download
    const filename = csvId.replace('.csv', '.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', xlsxBuffer.length);
    
    // Send the XLSX data
    res.status(200).send(xlsxBuffer);
    
  } catch (error) {
    console.error('XLSX download error:', error);
    res.status(500).json({ error: 'Failed to generate XLSX file' });
  }
} 