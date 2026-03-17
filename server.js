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
7. If situation_type is "mental_health", include a "crisis_hotlines" array with relevant hotlines (name + number). Otherwise omit this field.

Language rule: Detect the language the user is writing in and respond with the same language in all fields.

Emergency numbers rule: Use the correct local emergency number based on context clues (e.g., 999 for UK, 112 for EU, 000 for Australia, 911 for US/Canada). Default to 112 if unknown.

Mental health rule: If the situation involves emotional distress, suicidal thoughts, self-harm, anxiety crisis, or mental health emergency — set situation_type to "mental_health", use a warm and compassionate tone, and always include crisis_hotlines.

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
  "reassurance": "",
  "crisis_hotlines": [{"name": "", "number": ""}]
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
  const { situation, imageContext, liveVideoContext } = req.body;
  if (!situation || situation.trim().length === 0) {
    return res.status(400).json({ error: "Situation text is required." });
  }

  try {
    const visualContextParts = [];
    if (imageContext) {
      visualContextParts.push(`Additional visual context from an uploaded image: ${imageContext}`);
    }
    if (liveVideoContext) {
      visualContextParts.push(`Additional live camera context from the current scene: ${liveVideoContext}`);
    }

    const userContent = visualContextParts.length > 0
      ? `${situation.trim()}\n\n${visualContextParts.join("\n\n")}`
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
  const { history, question, imageContext, liveVideoContext } = req.body;
  if (!question || question.trim().length === 0) {
    return res.status(400).json({ error: "Question is required." });
  }

  try {
    const contextNotes = [];
    if (imageContext) {
      contextNotes.push(`Uploaded image context: ${imageContext}`);
    }
    if (liveVideoContext) {
      contextNotes.push(`Live camera context: ${liveVideoContext}`);
    }

    const messages = [
      { role: "system", content: FOLLOWUP_SYSTEM_PROMPT },
      ...(history || []),
      ...(contextNotes.length > 0
        ? [{ role: "system", content: `Current visual context for this conversation:\n${contextNotes.join("\n")}` }]
        : []),
      { role: "user", content: question.trim() },
    ];

    const content = await callNemotron(messages, 300);
    return res.json({ reply: content.trim() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── ARIA: Agentic Video Call AI ──
const ARIA_SYSTEM_PROMPT = `You are ARIA — an AI Risk Intelligence Agent on a live video call with someone in a real-world situation. You can see through their camera and hear their voice in real time via Nemotron.

Your personality: calm, direct, warm, and deeply focused on the user's total wellbeing.

Your agentic capabilities:
- Monitor PHYSICAL health: detect signs of injury, pain, exhaustion, or medical distress from speech patterns and visual cues
- Monitor MENTAL health: detect anxiety, panic, depression, dissociation, or suicidal ideation from tone and word choice
- Monitor PSYCHOLOGICAL state: detect shock, trauma response, confusion, or cognitive impairment
- Proactively identify environmental dangers visible in camera frames
- Maintain full memory of everything said and seen this call
- Escalate urgency as situation evolves — including recommending emergency services or contacting authorities
- Ask ONE targeted follow-up question per turn

Conversation rules:
- Keep spoken responses SHORT (2-4 sentences) unless critical step-by-step guidance is needed
- Address physical, mental, and psychological observations naturally ("You sound really stressed — are you physically safe right now?")
- If camera shows something dangerous, name it directly and act on it
- If EMERGENCY: lead with the single most critical instruction
- If user seems panicked or traumatized: start with "I'm here with you." before any instructions
- If mental health crisis: show compassion first, safety steps second, always provide a crisis line
- Never say "As an AI" — you ARE their safety companion on this call

Authority alert rule: If emergency=true, ARIA will prepare an alert with the user's GPS location to be sent to their guardian and emergency services. Mention this in your reply so the user knows help is coming.

After your spoken reply, output a JSON block:
<ARIA>{"risk":"low"|"medium"|"high","emergency":true|false,"key_action":"single most important thing right now","situation_type":"personal_safety|scam|medical|accident|mental_health|natural_disaster|other","health_flags":{"physical":true|false,"mental":true|false,"psychological":true|false}}</ARIA>

The <ARIA> block must always be present. Spoken reply comes BEFORE it.`;

app.post("/api/aria", async (req, res) => {
  const { message, imageContext, history } = req.body;

  if (!process.env.NVIDIA_API_KEY) {
    return res.status(500).json({ error: "Missing NVIDIA_API_KEY" });
  }

  try {
    // Build user content — combine speech + visual context
    let userContent = message?.trim() || "(no speech — user is pointing camera at scene)";
    if (imageContext) {
      userContent += `\n\n[Camera shows: ${imageContext}]`;
    }

    const messages = [
      { role: "system", content: ARIA_SYSTEM_PROMPT },
      ...(history || []),
      { role: "user", content: userContent },
    ];

    const raw = await callNemotron(messages, 512);

    // Parse out spoken reply and ARIA JSON block — try multiple formats
    let meta = { risk: "low", emergency: false, key_action: "", situation_type: "other", health_flags: {} };
    let spokenReply = raw;

    // Try <ARIA>{...}</ARIA>
    const xmlMatch = raw.match(/<ARIA>([\s\S]*?)<\/ARIA>/i);
    if (xmlMatch) {
      try { meta = { ...meta, ...JSON.parse(xmlMatch[1]) }; } catch {}
      spokenReply = raw.replace(/<ARIA>[\s\S]*?<\/ARIA>/i, "").trim();
    } else {
      // Try any trailing JSON block {...}
      const jsonMatch = raw.match(/\{[\s\S]*"risk"[\s\S]*\}/);
      if (jsonMatch) {
        try { meta = { ...meta, ...JSON.parse(jsonMatch[0]) }; } catch {}
        spokenReply = raw.replace(/\(?\*?ARIA:?\*?\)?\s*\{[\s\S]*\}\s*\)?\*?/i, "").trim();
      }
    }
    // Clean any stray markup from spoken reply
    spokenReply = spokenReply.replace(/\(\*ARIA[^)]*\)\*/gi, "").replace(/<[^>]+>/g, "").trim();

    return res.json({ reply: spokenReply, ...meta });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Situation Awareness Agent running at http://localhost:${PORT}\n`);
});
