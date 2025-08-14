import { readFileSync, existsSync } from 'fs';
import { join, resolve, normalize } from 'path';

export default async function handler(req, res) {
  const { csvId } = req.query;
  
  if (!csvId) {
    return res.status(400).json({ error: 'Missing csvId parameter' });
  }
  
  // 🔒 SECURITY: Validate and sanitize csvId parameter
  const validationResult = validateCSVId(csvId);
  if (!validationResult.isValid) {
    return res.status(400).json({ 
      error: `Invalid file ID: ${validationResult.reason}` 
    });
  }
  
  try {
    // 🔒 SECURITY: Use safe path construction with validation
    const safeFilePath = constructSafeFilePath(csvId);
    
    // 🔒 SECURITY: Verify the final path is within allowed directory
    if (!isPathSafe(safeFilePath)) {
      console.error(`[SECURITY] Path traversal attempt blocked: ${csvId}`);
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if file exists
    if (!existsSync(safeFilePath)) {
      return res.status(404).json({ error: 'CSV file not found' });
    }
    
    // 🔒 SECURITY: Verify file is actually a CSV file
    if (!isCSVFile(safeFilePath)) {
      console.error(`[SECURITY] Non-CSV file access attempt blocked: ${csvId}`);
      return res.status(403).json({ error: 'Invalid file type' });
    }
    
    // Read the CSV file
    const csvData = readFileSync(safeFilePath, 'utf8');
    
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

// 🔒 Validate CSV ID parameter to prevent path traversal
function validateCSVId(csvId) {
  // Must be a string
  if (typeof csvId !== 'string') {
    return { isValid: false, reason: 'Invalid parameter type' };
  }
  
  // Must not be empty
  if (!csvId.trim()) {
    return { isValid: false, reason: 'Empty file ID' };
  }
  
  // Must not contain path traversal characters
  if (csvId.includes('..') || csvId.includes('\\') || csvId.includes('/')) {
    return { isValid: false, reason: 'Path traversal characters not allowed' };
  }
  
  // Must match safe filename pattern
  const safeFilenameRegex = /^[A-Za-z0-9_-]+\.csv$/;
  if (!safeFilenameRegex.test(csvId)) {
    return { isValid: false, reason: 'Invalid filename format' };
  }
  
  // Must not be too long (prevent buffer overflow attacks)
  if (csvId.length > 100) {
    return { isValid: false, reason: 'Filename too long' };
  }
  
  // Must not contain suspicious characters
  const suspiciousChars = /[<>:"|?*\x00-\x1f]/;
  if (suspiciousChars.test(csvId)) {
    return { isValid: false, reason: 'Suspicious characters in filename' };
  }
  
  return {
    isValid: true,
    reason: 'Valid CSV ID',
    sanitizedId: csvId.trim()
  };
}

// 🔒 Construct safe file path
function constructSafeFilePath(csvId) {
  // Use /tmp directory for Vercel deployment
  const baseDir = '/tmp';
  
  // Normalize and resolve the path to prevent directory traversal
  const normalizedPath = normalize(join(baseDir, csvId));
  
  // Ensure the resolved path is within the base directory
  const resolvedPath = resolve(normalizedPath);
  
  return resolvedPath;
}

// 🔒 Verify path is safe (within allowed directory)
function isPathSafe(filePath) {
  const baseDir = '/tmp';
  const resolvedBaseDir = resolve(baseDir);
  const resolvedFilePath = resolve(filePath);
  
  // Check if the file path is within the base directory
  return resolvedFilePath.startsWith(resolvedBaseDir);
}

// 🔒 Verify file is actually a CSV file
function isCSVFile(filePath) {
  try {
    // Check file extension
    if (!filePath.toLowerCase().endsWith('.csv')) {
      return false;
    }
    
    // Check file size (prevent reading extremely large files)
    const fs = require('fs');
    const stats = fs.statSync(filePath);
    
    // Maximum file size: 10MB
    const maxSize = 10 * 1024 * 1024;
    if (stats.size > maxSize) {
      return false;
    }
    
    // Check if file is readable
    if (!fs.accessSync) {
      return true; // Fallback if accessSync not available
    }
    
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
    
  } catch (error) {
    console.error('[SECURITY] File validation error:', error);
    return false;
  }
} 