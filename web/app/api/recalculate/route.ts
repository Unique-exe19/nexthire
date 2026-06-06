import { spawn } from 'child_process';
import path from 'path';
import { redis } from '../../../lib/redis';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const scriptPath = path.resolve(process.cwd(), '..', 'ranker', 'ranker.py');

  // Parse body for custom weights (Adaptive Weights)
  let weights: any = null;
  try {
    const body = await request.json();
    if (body && body.weights) {
      weights = body.weights;
    }
  } catch (e) {
    // No weights passed
  }

  let isClosed = false;
  let child: any = null;
  let redisSub: any = null;

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  const stream = new ReadableStream({
    async start(controller) {
      const safeEnqueue = (text: string) => {
        if (!isClosed) {
          try {
            controller.enqueue(encoder.encode(text));
          } catch (e) {
            // Stream already closed
          }
        }
      };

      const safeClose = () => {
        if (!isClosed) {
          isClosed = true;
          try {
            controller.close();
          } catch (e) {
            // Stream already closed
          }
        }
      };

      // Test Redis availability (Circuit Breaker layer)
      let redisWorking = false;
      try {
        await redis.ping();
        redisWorking = true;
      } catch (err) {
        safeEnqueue(`[SYSTEM] Local Redis not detected. Activating Circuit Breaker: Falling back to direct subprocess execution.\n`);
      }

      if (redisWorking) {
        try {
          // Subscribe to job Pub/Sub channel
          redisSub = redis.duplicate();
          await redisSub.connect();

          redisSub.on('message', (channel: string, message: string) => {
            if (message.startsWith('[STATUS] COMPLETED') || message.includes('Done!')) {
              safeEnqueue(`${message}\n`);
              safeClose();
              if (redisSub) {
                try { redisSub.quit(); } catch (e) {}
              }
            } else if (message.startsWith('[STATUS] ERROR')) {
              safeEnqueue(`${message}\n`);
              safeClose();
              if (redisSub) {
                try { redisSub.quit(); } catch (e) {}
              }
            } else {
              safeEnqueue(`${message}\n`);
            }
          });

          await redisSub.subscribe(`nexthire:job:status:${jobId}`);

          // Push job task to Redis Queue
          const jobPayload = {
            job_id: jobId,
            weights: weights,
            input_path: path.resolve(process.cwd(), '..', 'dataset', 'India_runs_data_and_ai_challenge', 'candidates.json'),
            output_path: path.resolve(process.cwd(), '..', 'submission.csv'),
            top_k: 100
          };

          await redis.rpush('nexthire:queue', JSON.stringify(jobPayload));
          safeEnqueue(`[SYSTEM] Job ${jobId} successfully queued on Redis.\n`);
          safeEnqueue(`[SYSTEM] Waiting for background worker to pickup...\n`);

        } catch (queueErr: any) {
          safeEnqueue(`[SYSTEM] Redis queue error: ${queueErr.message}. Falling back to direct subprocess execution.\n`);
          redisWorking = false;
          if (redisSub) {
            try { redisSub.quit(); } catch (e) {}
            redisSub = null;
          }
        }
      }

      // Fallback Direct Execution
      if (!redisWorking) {
        const args = [scriptPath];
        if (weights) {
          args.push('--weights', JSON.stringify(weights));
        }
        
        child = spawn('python', args, {
          cwd: path.resolve(process.cwd(), '..'),
          env: { 
            ...process.env, 
            PYTHONUNBUFFERED: '1',
            PYTHONIOENCODING: 'utf-8'
          }
        });

        child.stdout.on('data', (chunk: any) => {
          safeEnqueue(chunk.toString());
        });

        child.stderr.on('data', (chunk: any) => {
          safeEnqueue(`[STDERR] ${chunk.toString()}`);
        });

        child.on('close', (code: any) => {
          safeEnqueue(`[STATUS] COMPLETED with exit code ${code}\n`);
          safeClose();
        });

        child.on('error', (err: any) => {
          safeEnqueue(`[STATUS] ERROR Failed to start ranker process: ${err.message}\n`);
          safeClose();
        });
      }
    },
    cancel() {
      isClosed = true;
      if (child) {
        try {
          child.kill();
        } catch (e) {
          // Child process already terminated
        }
      }
      if (redisSub) {
        try {
          redisSub.quit();
        } catch (e) {
          // Subscription client already terminated
        }
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Transfer-Encoding': 'chunked',
    },
  });
}
