import { validateCsvFile } from '../lib/csv-validator';
import { logger } from '../lib/logger';

jest.mock('../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('CSV Validator Coverage Suite', () => {
  const fileName = 'data.csv';

  it('validates a valid Variant 1 (Student) CSV', () => {
    const csv = 'email,firstname,lastname,phoneno\na@b.com,John,Doe,123';
    const res = validateCsvFile(Buffer.from(csv), fileName);
    expect(res.isValid).toBe(true);
    expect(res.recordCount).toBe(1);
  });

  it('validates a valid Variant 2 (Course) CSV', () => {
    const csv = 'coursename,studentname\nMath,Alice';
    const res = validateCsvFile(Buffer.from(csv), fileName);
    expect(res.isValid).toBe(true);
  });

  it('fails on files that are too small', () => {
    const res = validateCsvFile(Buffer.from('small'), fileName);
    expect(res.isValid).toBe(false);
    expect(res.error).toMatch(/too small/);
  });

  it('fails on wrong file extension', () => {
    const res = validateCsvFile(Buffer.from('email,firstname,lastname,phoneno\na,b,c,d'), 'data.txt');
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('File must have .csv extension');
  });

  it('fails on binary-like content', () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x10]);
    const res = validateCsvFile(buffer, fileName);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('binary');
  });

  it('fails if no commas are found', () => {
    const csv = 'email firstname lastname phoneno\nval val val val';
    const res = validateCsvFile(Buffer.from(csv), fileName);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('no commas detected');
  });

  it('fails if there are no data rows', () => {
    const csv = 'email,firstname,lastname,phoneno';
    const res = validateCsvFile(Buffer.from(csv), fileName);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('at least a header and one data row');
  });

  it('fails if headers do not match either variant', () => {
    const csv = 'unknown,header\nval,val';
    const res = validateCsvFile(Buffer.from(csv), fileName);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Missing required CSV headers');
  });

  it('warns when unknown columns are present in a valid variant', () => {
    const csv = 'email,firstname,lastname,phoneno,extra\na,b,c,d,e';
    validateCsvFile(Buffer.from(csv), fileName);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('handles quoted fields and escaped quotes in parser', () => {
    const csv = 'email,firstname,lastname,phoneno\n"me@ex.com","John ""The Man""","Doe","123"';
    const res = validateCsvFile(Buffer.from(csv), fileName);
    expect(res.isValid).toBe(true);
  });

  it('catches and returns unexpected errors', () => {
    // @ts-ignore - passing null to trigger the catch block
    const res = validateCsvFile(null, fileName);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('CSV validation failed');
  });

  it('hits line 46: Max file size branch', () => {
  const largeBuffer = Buffer.alloc(50 * 1024 * 1024 + 1);
  const result = validateCsvFile(largeBuffer, 'large.csv');
  expect(result.isValid).toBe(false);
  expect(result.error).toContain('exceeds maximum limit');
});

it('hits line 97: Logger warning for unknown headers', () => {
  const csv = 'email,firstname,lastname,phoneno,extra_column\na,b,c,d,e';
  validateCsvFile(Buffer.from(csv), 'test.csv');
  // This triggers the branch where unknownHeaders.length > 0
  expect(logger.warn).toHaveBeenCalled();
});

it('hits lines 188-192: Escaped quotes in parser', () => {
  // This triggers the logic: if (insideQuotes && line[i + 1] === '"')
  const csv = 'email,firstname,lastname,phoneno\n"test@ex.com","John ""The Legend""","Doe","123"';
  const result = validateCsvFile(Buffer.from(csv), 'test.csv');
  expect(result.isValid).toBe(true);
});
});