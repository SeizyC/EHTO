// Verify what model is actually being used at runtime by:
//  (1) directly probing gpt-5.3-chat-latest — confirms access works
//  (2) hitting our own /api/cron/ambient and inspecting what the
//      OpenAI completion returns. OpenAI's response includes the
//      `model` field showing which model actually served the request.
const apiKey = process.env.OPENAI_API_KEY;

console.log("(1) direct gpt-5.3-chat-latest probe");
const r = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gpt-5.3-chat-latest",
    messages: [
      { role: "system", content: "당신은 광장 멤버 한 명. 한 줄로 반응만." },
      { role: "user", content: "야 너 진짜 어떤 모델이야? 솔직히 말해봐 ㅋㅋ" },
    ],
    max_completion_tokens: 80,
  }),
});
const j = await r.json();
console.log("  HTTP", r.status);
console.log("  response model field:", j.model);
console.log("  id:", j.id);
console.log("  content:", j.choices?.[0]?.message?.content?.trim());
console.log("  usage:", JSON.stringify(j.usage));
