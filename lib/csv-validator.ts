import { logger } from './logger';

export interface CsvValidationResult {
  isValid: boolean;
  error?: string;
  headers?: string[];
  recordCount?: number;
}

const REQUIRED_CSV_HEADERS: string[] = ['email', 'firstname', 'lastname', 'phoneno'];
const OPTIONAL_CSV_HEADERS: string[] = [];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MIN_FILE_SIZE = 10; // At least header + 1 record

/**
 * Validates if a buffer is a valid CSV file based on content and structure
 */
export function validateCsvFile(
  fileBuffer: Buffer,
  fileName: string
): CsvValidationResult {
  try {
    // Check file size
    if (fileBuffer.length < MIN_FILE_SIZE) {
      return {
        isValid: false,
        error: `File size too small (minimum ${MIN_FILE_SIZE} bytes)`,
      };
    }

    if (fileBuffer.length > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `File size exceeds maximum limit (${MAX_FILE_SIZE / 1024 / 1024} MB)`,
      };
    }

    // Check file extension
    if (!fileName.toLowerCase().endsWith('.csv')) {
      return {
        isValid: false,
        error: 'File must have .csv extension',
      };
    }

    // Check if content is text using regex with Unicode support
    const contentSample = fileBuffer.slice(0, 512).toString('utf-8', 0, 512);

    // More permissive regex that allows most characters except binary
    // Pattern: allows letters, numbers, common punctuation, whitespace, accented chars
    const csvContentRegex = /^[\p{L}\p{N}\s,"'.;\-_@#$%&()[\]{}+=:/?!~`^|\\]*$/gu;
    
    if (!csvContentRegex.test(contentSample)) {
      return {
        isValid: false,
        error: 'File content appears to be binary, not plain text CSV',
      };
    }

    // Additional check: must contain at least one comma (CSV delimiter)
    if (!contentSample.includes(',')) {
      return {
        isValid: false,
        error: 'File does not appear to be CSV format (no commas detected)',
      };
    }

    // Parse first few lines to validate structure
    const textContent = fileBuffer.toString('utf-8');
    const lines = textContent.split('\n').filter((line) => line.trim());

    if (lines.length < 2) {
      return {
        isValid: false,
        error: 'CSV file must contain at least a header and one data row',
      };
    }

    // Extract and validate headers
    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine);

    if (headers.length === 0) {
      return {
        isValid: false,
        error: 'CSV file has no headers',
      };
    }

    // Normalize header names (lowercase, trim whitespace)
    const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

    // Check if required headers are present
    const hasRequiredHeaders = REQUIRED_CSV_HEADERS.every((required) =>
      normalizedHeaders.includes(required)
    );

    if (!hasRequiredHeaders) {
      const missing = REQUIRED_CSV_HEADERS.filter(
        (h) => !normalizedHeaders.includes(h)
      );
      return {
        isValid: false,
        error: `Missing required CSV headers: ${missing.join(', ')}`,
      };
    }

    // Check if all headers are recognized (required or optional)
    const allValidHeaders = [...REQUIRED_CSV_HEADERS, ...OPTIONAL_CSV_HEADERS];
    const unknownHeaders = normalizedHeaders.filter(
      (h) => !allValidHeaders.includes(h)
    );

    if (unknownHeaders.length > 0) {
      logger.warn(
        `CSV contains unexpected columns: ${unknownHeaders.join(
          ', '
        )}. They will be ignored.`
      );
    }

    // Count records (lines minus header)
    const recordCount = lines.length - 1;

    logger.info(
      `CSV validation successful: ${recordCount} records found with headers: ${normalizedHeaders.join(', ')}`
    );

    return {
      isValid: true,
      headers: normalizedHeaders,
      recordCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      isValid: false,
      error: `CSV validation failed: ${errorMessage}`,
    };
  }
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        // Handle escaped quotes
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result.filter((field) => field.length > 0);
}
