import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PORT = process.env.PORT || 8080;

function lastTail(text, maxWords = 20) { // было 25
  const words = (text || '').trim().split(/\s+/);
  return words.slice(-maxWords).join(' ');
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/hints', async (req, res) => {
  try {
    const full = (req.body?.text || '').trim();
    if (!full) return res.json({ card: null });

    const focus = lastTail(full, 20);

    const prompt = `
You are an assistant for an English teacher. Analyze ONLY this short tail:
"${focus}"

Return STRICT JSON with three arrays (always present):
{
  "errors": [
    {
      "title": "Missing article | Grammar mistake | etc.",
      "wrong": "short incorrect fragment",
      "fix": "corrected fragment",
      "explanation": "A2-level reason (<=200 chars)"
    }
  ],
  "definitions": [
    { "word": "word", "pos": "noun|verb|adj", "simple_def": "Very simple (A1-A2)" }
  ],
  "synonyms": [
    { "word": "word", "pos": "noun|verb|adj", "list": ["syn1","syn2","syn3"] }
  ]
}

Rules:
- errors: 0–2 items;
- definitions: 1–3 items from the utterance;
- synonyms: 1–3 items, 2–5 synonyms each (reuse from definitions if needed).
- ONLY JSON. No markdown/prose.
`;

    let card = { errors: [], definitions: [], synonyms: [] };
    try {
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',     // быстрый и дешёвый
        temperature: 0.1,
        max_tokens: 300,          // было 380
        messages: [
          { role: 'system', content: 'Return ONLY valid JSON. No markdown. No commentary.' },
          { role: 'user', content: prompt }
        ]
      });
      const raw = resp.choices?.[0]?.message?.content?.trim() || '{}';
      const parsed = JSON.parse(raw);
      card.errors = Array.isArray(parsed.errors) ? parsed.errors : [];
      card.definitions = Array.isArray(parsed.definitions) ? parsed.definitions : [];
      card.synonyms = Array.isArray(parsed.synonyms) ? parsed.synonyms : [];
    } catch (e) {
      console.error('LLM error', e?.message);
    }

    res.json({ card, focus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

app.use(express.static('client'));
app.get('/', (_req, res) => res.redirect('/teacher.html'));

app.listen(PORT, () => {
  console.log(`Teacher-only AI Tutor running: http://localhost:${PORT}/teacher.html`);
});
