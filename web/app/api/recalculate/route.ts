import { spawn } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST() {
  const encoder = new TextEncoder();
  const scriptPath = path.resolve(process.cwd(), '..', 'ranker', 'ranker.py');

  let isClosed = false;
  let child: any = null;

  const stream = new ReadableStream({
    start(controller) {
      // Spawn python ranker process
      // PYTHONUNBUFFERED=1 forces stdout/stderr streams to flush immediately instead of buffering
      child = spawn('python', [scriptPath], {
        cwd: path.resolve(process.cwd(), '..'),
        env: { 
          ...process.env, 
          PYTHONUNBUFFERED: '1',
          // Force stdout/stderr output encoding to UTF-8
          PYTHONIOENCODING: 'utf-8'
        }
      });

      const safeEnqueue = (text: string) => {
        if (!isClosed) {
          try {
            controller.enqueue(encoder.encode(text));
          } catch (e) {
            // Stream is already closed by client
          }
        }
      };

      const safeClose = () => {
        if (!isClosed) {
          isClosed = true;
          try {
            controller.close();
          } catch (e) {
            // Stream is already closed
          }
        }
      };

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
    },
    cancel() {
      isClosed = true;
      if (child) {
        try {
          child.kill();
        } catch (e) {
          // Process already dead
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
