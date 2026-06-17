const id = process.env.NAVER_CLIENT_ID;
const secret = process.env.NAVER_CLIENT_SECRET;
const MAJOR = ["yna.co.kr","yonhapnews.co.kr","chosun.com","joongang.co.kr","joins.com",
  "hani.co.kr","donga.com","khan.co.kr","hankookilbo.com","kbs.co.kr","mbc.co.kr",
  "sbs.co.kr","jtbc.co.kr","ytn.co.kr","mbn.co.kr","tvchosun.com","channela.co.kr",
  "mk.co.kr","hankyung.com","edaily.co.kr","fnnews.com","newsis.com","nocutnews.co.kr",
  "ohmynews.com","tenasia.hankyung.com","starnews.com","osen.co.kr","xportsnews.com",
  "newsen.com","isplus.com"];
const isMajor = (url) => { try { const h = new URL(url).hostname.replace(/^www\./,""); return MAJOR.some(d => h===d || h.endsWith("."+d)); } catch { return false; }};
const clean = s => s.replace(/<\/?b>/g,"").replace(/<[^>]+>/g,"").replace(/&quot;/g,'"').replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
const queries = ["사건사고","연예","이슈"];
const buckets = await Promise.all(queries.map(async q => {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q)}&display=30&sort=sim`;
  const r = await fetch(url, { headers: {"X-Naver-Client-Id":id,"X-Naver-Client-Secret":secret}});
  return (await r.json()).items ?? [];
}));
const seen = new Set();
const top = [];
for (const it of buckets.flat()) {
  if (!isMajor(it.originallink)) continue;
  const t = clean(it.title);
  const key = t.slice(0,24);
  if (seen.has(key)) continue;
  seen.add(key);
  top.push({ title: t, source: new URL(it.originallink).hostname });
  if (top.length >= 8) break;
}
console.log(`raw items: ${buckets.flat().length}, after filter: ${top.length}\n`);
top.forEach((t,i) => console.log(`  ${i+1}. [${t.source}] ${t.title}`));
