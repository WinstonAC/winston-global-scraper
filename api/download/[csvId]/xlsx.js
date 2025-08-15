import { readFileSync, existsSync } from 'fs';
import { join, resolve, normalize } from 'path';
import * as XLSX from 'xlsx';
import { downloadRateLimit } from '../../../utils/rateLimit.js';

export default async function handler(req, res) {
  // 🔒 HTTP METHOD RESTRICTION - Only allow GET for downloads
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method not allowed', 
      message: 'Only GET requests are allowed for this endpoint' 
    });
  }
  
  // 🔒 Apply rate limiting for downloads
  downloadRateLimit(req, res);
  
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
    
    // Parse CSV and convert to worksheet
    const workbook = XLSX.read(csvData, { type: 'string' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // Create new workbook with formatted data
    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, worksheet, 'Winston Contacts');
    
    // Generate XLSX buffer
    const xlsxBuffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Set appropriate headers for XLSX download
    const filename = validationResult.sanitizedId.replace('.csv', '.xlsx');
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