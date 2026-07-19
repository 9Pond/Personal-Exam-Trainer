import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as { redis: IORedis | undefined };

/**
 * BullMQ ต้องการ connection ที่ maxRetriesPerRequest: null
 * (ไม่งั้น worker จะ throw เวลา command ถูก retry ภายใน)
 */
export const redisConnection =
  globalForRedis.redis ??
  new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redisConnection;
