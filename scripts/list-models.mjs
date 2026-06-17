const apiKey = process.env.OPENAI_API_KEY;
const r = await fetch("https://api.openai.com/v1/models", {
  headers: { Authorization: "Bearer " + apiKey },
});
const j = await r.json();
const chat = j.data.filter(m => /^(gpt-|chatgpt|o\d|o-)/.test(m.id)).map(m => m.id).sort();
console.log(chat.join("\n"));
