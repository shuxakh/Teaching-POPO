import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { OpenAI } from 'openai';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PORT = process.env.PORT || 8080;

function lastTail(text, maxWords = 15) {
  const words = (text || '').trim().split(/\s+/);
  return words.slice(-maxWords).join(' ');
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---------- AI hints (teacher + student, короткий хвост) ----------
app.post('/api/hints', async (req, res) => {
  try {
    const teacher = (req.body?.teacher || '').trim();
    const student = (req.body?.student || '').trim();
    const mix = [teacher, student].filter(Boolean).join('  ');
    if (!mix) return res.json({ card: null });

    const focus = lastTail(mix, 15);

    let card = { errors: [], definitions: [], synonyms: [] };
    try {
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 260,
        messages: [
          { role: 'system', content: 'Return ONLY valid JSON. No markdown.' },
          {
            role: 'user',
            content: `
You are an assistant for an English teacher. Analyze ONLY this short tail:
"${focus}"

Return STRICT JSON (no prose, no markdown). At least ONE section MUST be non-empty:
{
  "errors": [
    {"title":"...","wrong":"...","fix":"...","explanation":"..."}
  ],
  "definitions": [
    {"word":"...","pos":"noun|verb|adj","simple_def":"..."}
  ],
  "synonyms": [
    {"word":"...","pos":"noun|verb|adj","list":["...","..."]}
  ]
}

If there are no mistakes, provide 1–2 simple definitions and one synonyms item from the utterance.
`
          }
        ]
      });
      const raw = resp.choices?.[0]?.message?.content?.trim() || '{}';
      const parsed = JSON.parse(raw);
      card.errors = Array.isArray(parsed.errors) ? parsed.errors : [];
      card.definitions = Array.isArray(parsed.definitions) ? parsed.definitions : [];
      card.synonyms = Array.isArray(parsed.synonyms) ? parsed.synonyms : [];
    } catch (e) {
      console.error('LLM error:', e.message);
    }

    // фильтр пустых карточек
    const empty =
      (!card.errors || card.errors.length === 0) &&
      (!card.definitions || card.definitions.length === 0) &&
      (!card.synonyms || card.synonyms.length === 0);

    if (empty) return res.json({ card: null, focus });

    res.json({ card, focus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ---------- Whisper STT для студента (звук вкладки) ----------
app.post('/api/stt_student', async (req, res) => {
  try {
    const { audioBase64 } = req.body || {};
    if (!audioBase64) return res.status(400).json({ text: '' });

    const buf = Buffer.from(audioBase64, 'base64');
    const tmp = path.join('/tmp', `${randomUUID()}.webm`);
    fs.writeFileSync(tmp, buf);

    let text = '';
    try {
      const stream = fs.createReadStream(tmp);
      const tr = await openai.audio.transcriptions.create({
        file: stream,
        model: 'whisper-1'
      });
      text = (tr?.text || '').trim();
    } catch (e) {
      console.error('Whisper error:', e.message);
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }

    res.json({ text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ text: '' });
  }
});

app.use(express.static('client'));
app.get('/', (_req, res) => res.redirect('/teacher.html'));

app.listen(PORT, () => {
  console.log(`Ready → http://localhost:${PORT}/teacher.html`);
});
