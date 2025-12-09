'use client';

import { useEffect, useState } from 'react';

export default function Page() {
  const [schedulerStatus, setSchedulerStatus] = useState<string>('initializing');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeScheduler = async () => {
      try {
        const response = await fetch('/api/csv-jobs-scheduler', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setSchedulerStatus('active');
          console.log('CSV Job Scheduler initialized:', data);
        } else {
          setError(`Scheduler initialization failed: ${response.statusText}`);
          setSchedulerStatus('error');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to initialize scheduler: ${errorMessage}`);
        setSchedulerStatus('error');
      }
    };

    initializeScheduler();
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Storage Service</h1>
      <div>
        <p><strong>CSV Job Scheduler Status:</strong> {schedulerStatus}</p>
        {error && <p style={{ color: 'red' }}><strong>Error:</strong> {error}</p>}
      </div>
    </div>
  );
}


