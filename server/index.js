import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { OpenAI } from 'openai';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' })); // принимаем крупные аудиокуски base64

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PORT = process.env.PORT || 8080;

// ---- helpers ----
function lastTail(text, maxWords = 15) {
  const words = (text || '').trim().split(/\s+/);
  return words.slice(-maxWords).join(' ');
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

/**
 * /api/hints — общие подсказки по КОРОТКОМУ хвосту объединённой речи
 * body: { teacher: "text", student: "text" }
 */
app.post('/api/hints', async (req, res) => {
  try {
    const teacher = (req.body?.teacher || '').trim();
    const student = (req.body?.student || '').trim();
    const mix = [teacher, student].filter(Boolean).join('  ');
    if (!mix) return res.json({ card: null });

    const focus = lastTail(mix, 15);

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
      "explanation": "A2-level reason (<=300 chars)"
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
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 260,
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

/**
 * /api/stt_student — серверное STT для ЗВУКА УЧЕНИКА (захват вкладки)
 * body: { audioBase64: "data in base64 (no prefix)", mime: "audio/webm" }
 * Возвращает: { text: "..." }
 */
app.post('/api/stt_student', async (req, res) => {
  try {
    const { audioBase64, mime } = req.body || {};
    if (!audioBase64) return res.status(400).json({ text: '' });

    // сохраняем chunk во временный файл и даём его Whisper'у
    const buf = Buffer.from(audioBase64, 'base64');
    const tmpName = `${randomUUID()}.webm`;
    const tmpPath = path.join('/tmp', tmpName);
    fs.writeFileSync(tmpPath, buf);

    let text = '';
    try {
      const fileStream = fs.createReadStream(tmpPath);
      const resp = await openai.audio.transcriptions.create({
        file: fileStream,
        model: 'whisper-1', // серверное STT
        // language можно не задавать — автоопределение. При желании: language: 'en'
      });
      text = (resp?.text || '').trim();
    } catch (e) {
      console.error('Whisper error:', e?.message);
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }

    res.json({ text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ text: '' });
  }
});

// статика и редирект
app.use(express.static('client'));
app.get('/', (_req, res) => res.redirect('/teacher.html'));

app.listen(PORT, () => {
  console.log(`Teacher-only AI Tutor running: http://localhost:${PORT}/teacher.html`);
});
