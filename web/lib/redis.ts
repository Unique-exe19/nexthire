import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Prevent duplicate connections during hot-reloads in Next.js development
const globalForRedis = global as unknown as { redis: Redis | undefined };

export const redis = globalForRedis.redis ?? new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, 
  enableOfflineQueue: false, // Reject command execution immediately if connection is closed
  connectTimeout: 1000,      // Fail connection quickly if host is offline
  retryStrategy(times) {
    if (times > 2) return null; // Stop retrying connection after 2 failures to let commands reject fast
    return 1000;
  }
});

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

// Catch connection errors gracefully to prevent Unhandled Error event crashes
redis.on('error', (err) => {
  // Silent warning since circuit breaker fallback is automatically handling it
});
