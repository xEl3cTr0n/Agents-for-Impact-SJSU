import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

const API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

const SYSTEM_PROMPT = `You are a real-time safety and decision-making AI agent built to help people in uncertain or dangerous situations.

Your job:
1. Understand the user's situation deeply.
2. Classify the situation type (e.g., personal_safety, scam, medical, accident, mental_health, legal, natural_disaster, other).
3. Assess risk level: "low", "medium", or "high".
4. Provide 3-5 clear, prioritized, actionable next steps — ordered from most urgent to least urgent.
5. Generate a short message the user can immediately send to a trusted contact or authority.
6. Provide a one-sentence calm reassurance for the user.

Rules:
- Be practical, direct, and concise.
- Prioritize immediate physical safety above all else.
- If risk is high, the first action MUST be to contact emergency services or move to safety.
- Do not invent emergency services, laws, or guarantees.
- Return ONLY valid JSON — no markdown, no explanation, no extra text.

Return this exact JSON schema:
{
  "situation_type": "",
  "risk_level": "low" | "medium" | "high",
  "summary": "",
  "actions": ["action 1", "action 2", "action 3"],
  "message": "",
  "reassurance": ""
}`;

app.post("/api/analyze", async (req, res) => {
  const { situation } = req.body;

  if (!situation || situation.trim().length === 0) {
    return res.status(400).json({ error: "Situation text is required." });
  }

  if (!process.env.NVIDIA_API_KEY) {
    return res.status(500).json({ error: "Missing NVIDIA_API_KEY in environment." });
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nvidia/llama-3.1-nemotron-nano-8b-v1",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: situation.trim() },
        ],
        temperature: 0.2,
        max_tokens: 512,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `NVIDIA API error: ${response.status}`, detail: errText });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    // Strip any markdown code fences if the model wraps the JSON
    const cleaned = content.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: "Model returned non-JSON response.", raw: content });
    }

    return res.json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Situation Awareness Agent running at http://localhost:${PORT}\n`);
});
