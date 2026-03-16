const API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const API_KEY = process.env.NVIDIA_API_KEY;

const SYSTEM_PROMPT = `
You are a real-time safety and decision-making AI agent.

Your job:
1. Understand the user's situation.
2. Classify the situation type.
3. Assess risk level (low, medium, high).
4. Provide clear, actionable next steps.
5. Generate a message the user can send if needed.

Return ONLY valid JSON with this schema:
{
  "situation_type": "",
  "risk_level": "",
  "actions": [],
  "message": ""
}
`.trim();

async function runAgent(input) {
  if (!API_KEY) {
    throw new Error("Missing NVIDIA_API_KEY");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "nvidia/llama-3.1-nemotron-nano-8b-v1",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: input },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`NVIDIA API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  console.log(content);
}

runAgent("I think someone is following me").catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
