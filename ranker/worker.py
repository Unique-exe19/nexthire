"""
worker.py
---------
Background worker daemon for NextHire AI Ranker.
Pulls jobs from Redis list and streams execution logs via Redis Pub/Sub.

Run:
    python ranker/worker.py
"""

import sys
import os
import json
import time
import logging
import traceback
import pickle
import redis

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from ranker import rank_candidates, DEFAULT_INPUT, DEFAULT_OUTPUT
from hybrid_ranker import redis_client, redis_available

# Setup loggers
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("worker")

class RedisPublishHandler(logging.Handler):
    """Logging handler that publishes logs to a Redis Pub/Sub channel."""
    def __init__(self, job_id: str):
        super().__init__()
        self.job_id = job_id
        self.channel = f"nexthire:job:status:{job_id}"

    def emit(self, record):
        try:
            log_entry = self.format(record)
            if redis_available:
                redis_client.publish(self.channel, log_entry)
        except Exception:
            pass

def process_job(job_data: dict):
    job_id = job_data.get("job_id")
    weights = job_data.get("weights")
    input_path = job_data.get("input_path", DEFAULT_INPUT)
    output_path = job_data.get("output_path", DEFAULT_OUTPUT)
    top_k = job_data.get("top_k", 100)

    log.info(f"Processing job {job_id}...")

    # Attach Redis log handler to stream logs back in real-time
    redis_handler = RedisPublishHandler(job_id)
    redis_handler.setFormatter(logging.Formatter("[SYSTEM] %(asctime)s [%(levelname)s] %(message)s", "%H:%M:%S"))
    
    # Get all project loggers and attach handler
    root_logger = logging.getLogger()
    root_logger.addHandler(redis_handler)
    
    # Also attach directly to ranker & hybrid logger in case propagation is disabled
    logging.getLogger("ranker").addHandler(redis_handler)
    logging.getLogger("ranker.hybrid").addHandler(redis_handler)

    try:
        # Publish start notification
        if redis_available:
            redis_client.publish(f"nexthire:job:status:{job_id}", "[STATUS] PROCESSING")

        # Run ranker
        rank_candidates(input_path=input_path, output_path=output_path, top_k=top_k, user_weights=weights)

        # Publish success notification
        if redis_available:
            redis_client.publish(f"nexthire:job:status:{job_id}", "[STATUS] COMPLETED")
            log.info(f"Job {job_id} completed successfully.")
    except Exception as e:
        err_msg = f"Error processing job {job_id}: {str(e)}\n{traceback.format_exc()}"
        log.error(err_msg)
        if redis_available:
            redis_client.publish(f"nexthire:job:status:{job_id}", f"[STATUS] ERROR: {str(e)}")
    finally:
        # Clean up handlers
        root_logger.removeHandler(redis_handler)
        logging.getLogger("ranker").removeHandler(redis_handler)
        logging.getLogger("ranker.hybrid").removeHandler(redis_handler)

def main():
    if not redis_available:
        log.error("Redis is not running! Worker cannot start.")
        sys.exit(1)

    queue_key = "nexthire:queue"
    log.info(f"NextHire Background Worker running. Listening on queue '{queue_key}'...")

    while True:
        try:
            # Blocking pop from Redis list
            result = redis_client.blpop(queue_key, timeout=10)
            if not result:
                continue

            # Parse job payload
            _, payload_bytes = result
            job_data = json.loads(payload_bytes.decode('utf-8'))
            process_job(job_data)
        except KeyboardInterrupt:
            log.info("Worker shutting down...")
            break
        except (redis.exceptions.TimeoutError, redis.exceptions.ConnectionError) as e:
            # Silence expected socket timeouts from cloud Redis while blocking on an empty queue
            if "Timeout reading from socket" in str(e):
                # Simply loop again without delay
                continue
            log.warning(f"Redis connection issue: {e}. Retrying in 3s...")
            time.sleep(3)
        except Exception as e:
            log.error(f"Worker queue error: {e}")
            time.sleep(2)

if __name__ == "__main__":
    main()
