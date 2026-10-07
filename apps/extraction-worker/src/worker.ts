import Redis from "ioredis";
import { env, REDIS_STREAM, REDIS_GROUPS } from "@kiwu/config";

const GROUP_TO_RAW_TYPE: Record<string, string> = {
  "text-workers": "text",
  "voice-workers": "audio",
  "image-workers": "image",
};

const arg = process.argv[2];
const groups = arg ? [arg] : REDIS_GROUPS;
for (const g of groups) {
  if (!REDIS_GROUPS.includes(g)) {
    console.error(`usage: worker.ts [${REDIS_GROUPS.join("|")}]`);
    process.exit(1);
  }
}

async function runWorker(group: string) {
  const rawType = GROUP_TO_RAW_TYPE[group];
  const consumer = `${group}-${process.pid}`;
  const redis = new Redis(env.REDIS_URL);

  // provision group (idempotent) so workers can start in any order
  try {
    await redis.xgroup("CREATE", REDIS_STREAM, group, "$", "MKSTREAM");
    console.log(`created group ${group}`);
  } catch (e: any) {
    if (!e.message?.includes("BUSYGROUP")) throw e;
  }

  console.log(`${consumer} listening on ${REDIS_STREAM} (group=${group}, raw_type=${rawType})`);

  let shuttingDown = false;
  process.on("SIGINT", () => {
    shuttingDown = true;
    redis.quit().then(() => process.exit(0));
  });

  while (!shuttingDown) {
    const res = await redis.xreadgroup(
      "GROUP",
      group,
      consumer,
      "COUNT",
      10,
      "BLOCK",
      5000,
      "STREAMS",
      REDIS_STREAM,
      ">",
    );
    if (!res) continue;

    for (const [, messages] of res as any) {
      for (const [id, fields] of messages as any) {
        const msg: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) msg[fields[i]] = fields[i + 1];

        if (msg.raw_type === rawType) {
          // TODO: stub until we wire the LLM extraction call
          console.log(`[${group}] processing item ${msg.item_id} (raw_type=${msg.raw_type})`);
        }
        // ack regardless: each message is processed only by its modality's group,
        // other groups must not leave foreign messages pending forever
        await redis.xack(REDIS_STREAM, group, id);
      }
    }
  }
}

await Promise.all(groups.map(runWorker));
