// server/index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import OpenAI from "openai";
import { toFile } from "openai/uploads";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(express.static(path.join(__dirname, "..", "client")));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// STT для студента (WAV/PCM, язык фиксируем EN)
app.post("/api/stt_student", async (req, res) => {
  try {
    const { audioBase64, mime } = req.body || {};
    if (!audioBase64) return res.status(400).json({ error: "no audioBase64" });

    const buf = Buffer.from(audioBase64, "base64");
    const isWav = mime === "audio/wav";
    const file = await toFile(buf, isWav ? "chunk.wav" : "chunk.webm", {
      type: isWav ? "audio/wav" : "audio/webm",
    });

    let text = "";
    try {
      const r = await openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-transcribe",
        language: "en",
      });
      text = (r?.text || "").trim();
    } catch {
      const r2 = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: "en",
      });
      text = (r2?.text || "").trim();
    }

    return res.json({ text });
  } catch (err) {
    console.error("STT error:", err?.response?.data || err.message);
    return res.status(err?.status || 500).send(err?.message || "STT error");
  }
});

// Генерация подсказок (3 колонки)
app.post("/api/hints", async (req, res) => {
  try {
    const { teacher = "", student = "" } = req.body || {};
    const input = (teacher + " " + student).trim();
    if (!input) return res.json({ card: null });

    const prompt = `
You are a concise English-teaching assistant. From the input text, produce a JSON with:
{
  "errors": [{"title": "...", "wrong": "...", "fix": "...", "explanation": "..."}],
  "definitions": [{"word": "...", "pos": "noun|verb|adj", "simple_def": "..."}],
  "synonyms": [{"word": "...", "pos": "noun|verb|adj", "list": ["...","..."]}]
}
Keep it short. Use simple English. Pick a few relevant nouns/verbs/adjectives.
Input: """${input}"""`;

    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    let payload = {};
    try { payload = JSON.parse(chat.choices?.[0]?.message?.content || "{}"); } catch {}
    const card = {
      errors: Array.isArray(payload.errors) ? payload.errors : [],
      definitions: Array.isArray(payload.definitions) ? payload.definitions : [],
      synonyms: Array.isArray(payload.synonyms) ? payload.synonyms : [],
    };
    return res.json({ card });
  } catch (err) {
    console.error("hints error:", err?.response?.data || err.message);
    return res.status(500).json({ card: null });
  }
});

// single-page
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "teacher.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Teacher-only AI Tutor running: http://localhost:${PORT}/teacher.html`);
});
