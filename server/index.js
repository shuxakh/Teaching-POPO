// server/index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// OpenAI SDK (>= v4)
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ⬇️ КРИТИЧНО: поднимаем лимиты тела запроса (иначе 413 / обрыв больших аудио)
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// статика
app.use(express.static(path.join(__dirname, "..", "client")));

// OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ====== STT студента (Whisper) ======
app.post("/api/stt_student", async (req, res) => {
  try {
    const { audioBase64 } = req.body || {};
    if (!audioBase64) return res.status(400).json({ error: "no audio" });

    // Преобразуем base64 → буфер
    const buf = Buffer.from(audioBase64, "base64");

    // Отправляем в /audio/transcriptions
    // Используем "whisper-1" или "gpt-4o-mini-transcribe" (если доступна)
    const result = await openai.audio.transcriptions.create({
      file: new File([buf], "chunk.webm", { type: "audio/webm" }),
      model: "whisper-1", // можно "gpt-4o-mini-transcribe" при наличии
      // language: "en", // при желании фиксировать язык
    });

    const text = (result?.text || "").trim();
    res.json({ text });
  } catch (err) {
    console.error("stt_student error:", err?.response?.data || err.message);
    const code = err?.status || 500;
    res.status(code).send(err?.message || "STT error");
  }
});

// ====== Подсказки для учителя ======
app.post("/api/hints", async (req, res) => {
  try {
    const { teacher = "", student = "" } = req.body || {};
    const input = (teacher + " " + student).trim();
    if (!input) return res.json({ card: null });

    // Просим модель выдать структуру (ошибки, дефиниции, синонимы)
    const prompt = `
You are a concise English-teaching assistant. From the input text, produce a JSON with:
{
  "errors": [{"title": "...", "wrong": "...", "fix": "...", "explanation": "..."}],
  "definitions": [{"word": "...", "pos": "noun|verb|adj", "simple_def": "..."}],
  "synonyms": [{"word": "...", "pos": "noun|verb|adj", "list": ["...","..."]}]
}
- Keep it short and simple.
- Only include a few most relevant nouns/verbs/adjectives.
- If no content for a section, return an empty array for it.
Input: """${input}"""`;

    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini", // быстро и недорого; можно сменить при желании
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    let payload = {};
    try {
      payload = JSON.parse(chat.choices?.[0]?.message?.content || "{}");
    } catch {}

    const card = {
      errors: Array.isArray(payload.errors) ? payload.errors : [],
      definitions: Array.isArray(payload.definitions) ? payload.definitions : [],
      synonyms: Array.isArray(payload.synonyms) ? payload.synonyms : [],
    };

    res.json({ card });
  } catch (err) {
    console.error("hints error:", err?.response?.data || err.message);
    res.status(500).json({ card: null });
  }
});

// fallback на страницу
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "teacher.html"));
});

// порт (Render использует PORT)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Teacher-only AI Tutor running: http://localhost:${PORT}/teacher.html`);
});
