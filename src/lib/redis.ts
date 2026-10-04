import { Redis } from 'ioredis'
import { config } from '../config/index.js'

let _redis: Redis | null = null

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    })
    _redis.on('error', (err) => {
      // Log but don't crash — callers fall back to live fetch on miss
      console.error('[redis] connection error:', err.message)
    })
  }
  return _redis
}

export async function redisPing(): Promise<boolean> {
  try {
    await getRedis().ping()
    return true
  } catch {
    return false
  }
}
