import { redis as _redis } from './config.js'
import Redis from 'ioredis'

export default function getRedis (dbName) {
  const dbMap = {
    'main': 0,
    'sticker_ban': 1
  }
  const dbId = dbMap[dbName]
  if (dbId === undefined) {
    throw new Error(`Invalid database name: ${dbName}`)
  }

  return new Redis({
    host: _redis.host,
    port: _redis.port,
    db: dbId
  })
}
