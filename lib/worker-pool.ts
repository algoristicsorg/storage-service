import { EventEmitter } from 'events';
import { logger } from './logger';

export interface WorkerTask<T, R> {
  id: string;
  data: T;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
}

export class WorkerPool<T, R> extends EventEmitter {
  private queue: WorkerTask<T, R>[] = [];
  private activeWorkers = 0;
  private readonly maxWorkers: number;

  constructor(maxWorkers: number = 5) {
    super();
    this.maxWorkers = Math.max(1, Math.min(maxWorkers, 10));
  }

  async execute(id: string, data: T): Promise<R> {
    logger.info(`WorkerPool.enqueue id=${id} data=${JSON.stringify(data)}`);
    return new Promise((resolve, reject) => {
      this.queue.push({ id, data, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue(): void {
    logger.debug(`WorkerPool.processQueue activeWorkers=${this.activeWorkers} queueLength=${this.queue.length}`);
    if (this.activeWorkers >= this.maxWorkers || this.queue.length === 0) {
      return;
    }

    this.activeWorkers++;
    const task = this.queue.shift();

    if (task) {
      this.emit('taskStart', task.id);

      Promise.resolve()
        .then(() => {
          logger.info(`WorkerPool.invoke handleTask for id=${task.id}`);
          return this.handleTask(task.data, task.id);
        })
        .then((result) => {
          this.emit('taskComplete', task.id);
          logger.info(`WorkerPool.taskComplete id=${task.id} result=${JSON.stringify(result)}`);
          task.resolve(result);
        })
        .catch((error) => {
          this.emit('taskError', task.id, error);
          logger.error(`WorkerPool.taskError id=${task.id} error=${error}`);
          task.reject(error);
        })
        .finally(() => {
          this.activeWorkers--;
          this.processQueue();
        });
    }
  }

  protected async handleTask(data: T, id: string): Promise<R> {
    throw new Error('handleTask must be implemented by subclass');
  }

  getStats() {
    return {
      activeWorkers: this.activeWorkers,
      queuedTasks: this.queue.length,
      maxWorkers: this.maxWorkers,
    };
  }

  clear(): void {
    this.queue = [];
  }
}

export class CsvProcessorPool extends WorkerPool<
  { jobId: string; batchNumber: number },
  { success: boolean; processedCount: number; failedCount: number }
> {
  private processor?: (
    jobId: string,
    batchNumber: number
  ) => Promise<{ success: boolean; processedCount: number; failedCount: number }>;

  setProcessor(
    processor: (
      jobId: string,
      batchNumber: number
    ) => Promise<{ success: boolean; processedCount: number; failedCount: number }>
  ): void {
    this.processor = processor;
  }

  protected async handleTask(
    data: { jobId: string; batchNumber: number },
    id: string
  ): Promise<{ success: boolean; processedCount: number; failedCount: number }> {
    if (!this.processor) {
      throw new Error('Processor not configured');
    }
    return this.processor(data.jobId, data.batchNumber);
  }
}
