import { logger } from './logger';

export interface CsvValidationResult {
  isValid: boolean;
  error?: string;
  headers?: string[];
  recordCount?: number;
}

// Option set 1: student master import
const REQUIRED_CSV_HEADERS_VARIANT_1: string[] = [
  'email',
  'firstname',
  'lastname',
  'phoneno',
];

// Option set 2: course assignment import
const REQUIRED_CSV_HEADERS_VARIANT_2: string[] = [
  'coursename',
  'studentname',
];

export const OPTIONAL_CSV_HEADERS: string[] = [];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MIN_FILE_SIZE = 10; // At least header + 1 record

/**
 * Validates if a buffer is a valid CSV file based on content and structure
 */
export function validateCsvFile(
  fileBuffer: Buffer,
  fileName: string,
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

    // Check if content is text
    const contentSample = fileBuffer.slice(0, 512).toString('utf-8', 0, 512);

    const csvContentRegex =
      /^[\p{L}\p{N}\s,"'.;\-_@#$%&()[\]{}+=:/?!~`^|\\]*$/gu;

    if (!csvContentRegex.test(contentSample)) {
      return {
        isValid: false,
        error: 'File content appears to be binary, not plain text CSV',
      };
    }

    // Must contain at least one comma
    if (!contentSample.includes(',')) {
      return {
        isValid: false,
        error: 'File does not appear to be CSV format (no commas detected)',
      };
    }

    // Parse first few lines
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

    const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

    // Check against both header variants
    const hasVariant1 = REQUIRED_CSV_HEADERS_VARIANT_1.every((h) =>
      normalizedHeaders.includes(h),
    );
    const hasVariant2 = REQUIRED_CSV_HEADERS_VARIANT_2.every((h) =>
      normalizedHeaders.includes(h),
    );

    if (!hasVariant1 && !hasVariant2) {
      const missingVariant1 = REQUIRED_CSV_HEADERS_VARIANT_1.filter(
        (h) => !normalizedHeaders.includes(h),
      );
      const missingVariant2 = REQUIRED_CSV_HEADERS_VARIANT_2.filter(
        (h) => !normalizedHeaders.includes(h),
      );

      return {
        isValid: false,
        error:
          `Missing required CSV headers. ` +
          `Either provide: [${REQUIRED_CSV_HEADERS_VARIANT_1.join(
            ', ',
          )}] (student details) ` +
          `or: [${REQUIRED_CSV_HEADERS_VARIANT_2.join(
            ', ',
          )}] (course & student name). ` +
          `Missing for variant 1: ${missingVariant1.join(
            ', ',
          )}; missing for variant 2: ${missingVariant2.join(', ')}`,
      };
    }

    // Determine which variant is used for “known headers” check
    const activeRequired =
      hasVariant1 ? REQUIRED_CSV_HEADERS_VARIANT_1 : REQUIRED_CSV_HEADERS_VARIANT_2;

    const allValidHeaders = [...activeRequired, ...OPTIONAL_CSV_HEADERS];
    const unknownHeaders = normalizedHeaders.filter(
      (h) => !allValidHeaders.includes(h),
    );

    if (unknownHeaders.length > 0) {
      logger.warn(
        `CSV contains unexpected columns: ${unknownHeaders.join(
          ', ',
        )}. They will be ignored.`,
      );
    }

    const recordCount = lines.length - 1;

    logger.info(
      `CSV validation successful: ${recordCount} records found with headers: ${normalizedHeaders.join(
        ', ',
      )}`,
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
