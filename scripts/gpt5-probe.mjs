const apiKey = process.env.OPENAI_API_KEY;
const r = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gpt-5.3-chat-latest",
    messages: [
      { role: "system", content: "당신은 카페에서 친구와 수다 떠는 한국인. 1문장." },
      { role: "user", content: "야 오늘 비 오네" },
    ],
    max_completion_tokens: 80,
  }),
});
console.log("HTTP", r.status);
const j = await r.json();
console.log(j.choices?.[0]?.message?.content?.trim() ?? JSON.stringify(j).slice(0, 300));
