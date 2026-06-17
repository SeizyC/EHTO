const id = process.env.NAVER_CLIENT_ID;
const secret = process.env.NAVER_CLIENT_SECRET;
const url = "https://openapi.naver.com/v1/search/news.json?query=" + encodeURIComponent("주요뉴스") + "&display=8&sort=date";
const r = await fetch(url, {
  headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
});
console.log("HTTP", r.status);
const j = await r.json();
if (j.items) {
  j.items.forEach((it, i) => {
    const title = it.title.replace(/<\/?b>/g, "").replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    console.log(`  ${i+1}. ${title}`);
  });
} else {
  console.log(JSON.stringify(j).slice(0, 400));
}
