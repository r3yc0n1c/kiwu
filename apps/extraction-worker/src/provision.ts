import Redis from "ioredis";
import { env, REDIS_STREAM, REDIS_GROUPS } from "@kiwu/config";

const redis = new Redis(env.REDIS_URL);

for (const group of REDIS_GROUPS) {
  try {
    // "$" = only messages added after provisioning; use "0" to replay backlog
    await redis.xgroup("CREATE", REDIS_STREAM, group, "$", "MKSTREAM");
    console.log(`created group ${group}`);
  } catch (e: any) {
    if (e.message?.includes("BUSYGROUP")) console.log(`group ${group} already exists`);
    else throw e;
  }
}

await redis.quit();
