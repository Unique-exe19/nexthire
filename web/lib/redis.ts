import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Prevent duplicate connections during hot-reloads in Next.js development
const globalForRedis = global as unknown as { redis: Redis | undefined };

export const redis = globalForRedis.redis ?? new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // Essential for BullMQ and queue tasks
});

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}
