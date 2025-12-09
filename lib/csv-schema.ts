import { z } from 'zod';

export const StudentRecordSchema = z.object({
  email: z.string().email('Invalid email format'),
  firstname: z.string().min(1, 'First name is required').trim(),
  lastname: z.string().min(1, 'Last name is required').trim(),
  phoneno: z.string().min(1, 'Phone number is required').trim(),
});

export type StudentRecord = z.infer<typeof StudentRecordSchema>;

export const CsvBatchSchema = z.object({
  jobId: z.string().uuid('Invalid job ID'),
  batchNumber: z.number().int().positive(),
  records: z.array(StudentRecordSchema),
  timestamp: z.date(),
});

export type CsvBatch = z.infer<typeof CsvBatchSchema>;

export const CsvProcessingJobSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  fileName: z.string(),
  fileUrl: z.string().url(),
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  totalRecords: z.number().int().nonnegative(),
  processedRecords: z.number().int().nonnegative(),
  failedRecords: z.number().int().nonnegative(),
  errorMessage: z.string().nullable(),
  createdAt: z.date(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
});

export type CsvProcessingJob = z.infer<typeof CsvProcessingJobSchema>;

export function validateStudentRecord(
  data: unknown
): { valid: boolean; error?: string; record?: StudentRecord } {
  const result = StudentRecordSchema.safeParse(data);
  if (result.success) {
    return { valid: true, record: result.data };
  }
  return { valid: false, error: result.error.errors[0]?.message };
}

export function validateStudentRecords(
  records: unknown[]
): { valid: boolean; errors: { index: number; error: string }[] } {
  const errors: { index: number; error: string }[] = [];

  records.forEach((record, index) => {
    const result = StudentRecordSchema.safeParse(record);
    if (!result.success) {
      errors.push({
        index,
        error: result.error.errors[0]?.message || 'Invalid record',
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
