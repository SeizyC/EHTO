const id = process.env.NAVER_CLIENT_ID;
const secret = process.env.NAVER_CLIENT_SECRET;

const KST_OFFSET = 9 * 3600_000;
const ROLLOVER_HOUR = 9;
function dayStart() {
  const kst = new Date(Date.now() + KST_OFFSET);
  const y = kst.getUTCFullYear(), m = kst.getUTCMonth(), d = kst.getUTCDate(), h = kst.getUTCHours();
  const todayNine = Date.UTC(y, m, d, ROLLOVER_HOUR) - KST_OFFSET;
  return h < ROLLOVER_HOUR ? todayNine - 86400000 : todayNine;
}
const todayMs = dayStart();
console.log("today starts at:", new Date(todayMs).toISOString());

const queries = ["사건사고","연예","이슈"];
const buckets = await Promise.all(queries.map(async q => {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q)}&display=100&sort=date`;
  const r = await fetch(url, {headers:{"X-Naver-Client-Id":id,"X-Naver-Client-Secret":secret}});
  return (await r.json()).items ?? [];
}));
const all = buckets.flat();
console.log("raw items:", all.length);

const todayItems = all.filter(it => {
  const t = Date.parse(it.pubDate ?? "");
  return Number.isFinite(t) && t >= todayMs;
});
console.log("today-only:", todayItems.length);

const olderSample = all.filter(it => {
  const t = Date.parse(it.pubDate ?? "");
  return Number.isFinite(t) && t < todayMs;
}).slice(0, 3);
console.log("\nolder examples that would have been DROPPED:");
for (const it of olderSample) {
  const t = it.title.replace(/<\/?b>/g,"").replace(/&quot;/g,'"').slice(0,60);
  console.log(`  [${it.pubDate}] ${t}`);
}

console.log("\ntoday's top 5 that pass:");
for (const it of todayItems.slice(0,5)) {
  const t = it.title.replace(/<\/?b>/g,"").replace(/&quot;/g,'"').slice(0,60);
  console.log(`  [${it.pubDate}] ${t}`);
}
