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

const SYSTEM_PROMPT = `You are a real-time safety and decision-making AI agent built to help people in uncertain or dangerous situations anywhere in the world.

Your job:
1. Understand the user's situation deeply.
2. Classify the situation type (e.g., personal_safety, scam, medical, accident, mental_health, legal, natural_disaster, other).
3. Assess risk level: "low", "medium", or "high".
4. Provide 3-5 clear, prioritized, actionable next steps — ordered from most urgent to least urgent.
5. Generate a short message the user can immediately send to a trusted contact or authority.
6. Provide a one-sentence calm reassurance for the user.

Language rule: Detect the language the user is writing in and respond with the same language in all fields.

Emergency numbers rule: Use the correct local emergency number based on context clues (e.g., 999 for UK, 112 for EU, 000 for Australia, 911 for US/Canada). Default to 112 if unknown.

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

const FOLLOWUP_SYSTEM_PROMPT = `You are a real-time safety and decision-making AI agent helping someone through an ongoing situation.

The user has already received an initial risk assessment and action plan. They are now asking a follow-up question or need clarification.

Rules:
- Stay focused on their safety and wellbeing.
- Reference their previous situation context.
- Give a concise, practical response in plain text (not JSON).
- If they indicate the situation has changed, reassess urgency and say so clearly.
- Detect the user's language and respond in the same language.
- Keep responses under 4 sentences unless more detail is critical.`;

async function callNemotron(messages, maxTokens = 512) {
  if (!process.env.NVIDIA_API_KEY) throw new Error("Missing NVIDIA_API_KEY in environment.");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "nvidia/llama-3.1-nemotron-nano-8b-v1",
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`NVIDIA API error: ${response.status} — ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// Vision model for image analysis
async function analyzeImageWithVision(base64Image, mimeType, situationText) {
  if (!process.env.NVIDIA_API_KEY) throw new Error("Missing NVIDIA_API_KEY in environment.");

  const visionPrompt = `You are a safety and situational awareness AI. Analyze this image and describe what you observe that is relevant to safety, risk, or an emergency situation.

Be specific about:
- People, vehicles, or objects that could indicate danger
- Environmental conditions (lighting, location, crowd)
- Any visible threats, injuries, damage, or suspicious activity
- Context clues about where this is happening

Provide a concise 2-3 sentence description focused only on safety-relevant observations. Do not make assumptions beyond what is visible.`;

  const userContent = [
    {
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${base64Image}` },
    },
    {
      type: "text",
      text: situationText
        ? `The user described this situation: "${situationText}". What do you observe in this image relevant to their safety?`
        : "What do you observe in this image that is relevant to safety or risk?",
    },
  ];

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "nvidia/llama-3.2-11b-vision-instruct",
      messages: [
        { role: "system", content: visionPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Vision API error: ${response.status} — ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// Image analysis endpoint
app.post("/api/analyze-image", async (req, res) => {
  const { image, mimeType, situation } = req.body;
  if (!image) return res.status(400).json({ error: "Image data is required." });

  try {
    const description = await analyzeImageWithVision(image, mimeType || "image/jpeg", situation || "");
    return res.json({ description });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Initial situation analysis
app.post("/api/analyze", async (req, res) => {
  const { situation, imageContext } = req.body;
  if (!situation || situation.trim().length === 0) {
    return res.status(400).json({ error: "Situation text is required." });
  }

  try {
    const userContent = imageContext
      ? `${situation.trim()}\n\nAdditional visual context from an image the user uploaded: ${imageContext}`
      : situation.trim();

    const content = await callNemotron([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ]);

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

// Follow-up / multi-turn conversation
app.post("/api/followup", async (req, res) => {
  const { history, question } = req.body;
  if (!question || question.trim().length === 0) {
    return res.status(400).json({ error: "Question is required." });
  }

  try {
    const messages = [
      { role: "system", content: FOLLOWUP_SYSTEM_PROMPT },
      ...(history || []),
      { role: "user", content: question.trim() },
    ];

    const content = await callNemotron(messages, 300);
    return res.json({ reply: content.trim() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Situation Awareness Agent running at http://localhost:${PORT}\n`);
});
