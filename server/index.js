import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PORT = process.env.PORT || 8080;

// Simple health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Hints endpoint: expects { text: "..." }
app.post('/api/hints', async (req, res) => {
  try {
    const text = (req.body?.text || '').trim();
    if (!text) return res.json({ hints: [] });

    const prompt = `You are an assistant for an English teacher. The student said: "${text}".
Return up to 2 very short hints (<=160 chars each) with a concise correction example.
Answer in strict JSON array of objects: [{"type":"grammar|vocab|pron","hint":"...","fix":"..."}]. No extra text.`;

    let hints = [];
    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: "Return ONLY JSON, no prose. Keep it terse and useful for the teacher only."},
          { role: "user", content: prompt }
        ]
      });
      const raw = resp.choices?.[0]?.message?.content?.trim() || "[]";
      try { hints = JSON.parse(raw); } catch { hints = []; }
    } catch (e) {
      console.error("LLM error:", e?.message);
    }
    res.json({ hints });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});

// Serve static client files
app.use(express.static('client'));

app.listen(PORT, () => {
  console.log(`Teacher-only AI Tutor running: http://localhost:${PORT}/teacher.html`);
});
