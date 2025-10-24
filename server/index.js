import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PORT = process.env.PORT || 8080;

// ---- helpers ----
function lastTail(text, maxWords = 25) {
  const words = (text || '').trim().split(/\s+/);
  return words.slice(-maxWords).join(' ');
}

// health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Получаем транскрипт и делаем структурированные подсказки (3 колонки)
app.post('/api/hints', async (req, res) => {
  try {
    const full = (req.body?.text || '').trim();
    if (!full) return res.json({ card: null });

    // Берём только короткий хвост (ускоряет и уменьшает путаницу)
    const focus = lastTail(full, 25);

    const prompt = `
You are an assistant for an English teacher. Analyze ONLY this short tail of the student's speech:
"${focus}"

Return a STRICT JSON object with three arrays:
{
  "errors": [ { "title": "Article mistake", "wrong": "I have car.", "fix": "I have a car.", "explanation": "Short and simple reason (<=200 chars)." } ],
  "definitions": [ { "word": "dog", "pos": "noun|verb|adj", "simple_def": "Very simple definition for A1-A2 level." } ],
  "synonyms": [ { "word": "happy", "pos": "adj|noun|verb", "list": ["glad","cheerful","joyful"] } ]
}

Rules:
- errors: 0–2 items max, each with short title, wrong sentence and corrected version + brief explanation.
- definitions: 0–3 items max; pick nouns/verbs/adjectives from the text; extremely simple English.
- synonyms: 0–3 items max; pick useful words from the text; 2–5 synonyms each.
- No prose, ONLY JSON.
`;

    let card = null;
    try {
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 350,
        messages: [
          { role: 'system', content: 'Return ONLY valid JSON.' },
          { role: 'user', content: prompt }
        ]
      });
      const raw = resp.choices?.[0]?.message?.content?.trim() || '{}';
      card = JSON.parse(raw);
    } catch (e) {
      console.error('LLM error', e?.message);
    }

    res.json({ card, focus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

// статика и редирект
app.use(express.static('client'));
app.get('/', (req, res) => res.redirect('/teacher.html'));

app.listen(PORT, () => {
  console.log(`Teacher-only AI Tutor running: http://localhost:${PORT}/teacher.html`);
});
