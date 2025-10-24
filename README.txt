TEACHER-ONLY AI TUTOR (Chrome) — NO CODING

What it does
------------
- You open one page in Chrome (teacher.html)
- Choose audio source: Microphone OR capture a Chrome tab with audio (e.g., Google Meet tab)
- The page transcribes the student's speech and shows short, private AI hints for the teacher

You need
--------
1) Chrome browser
2) Node.js 18+ (download from https://nodejs.org, LTS version)
3) An OpenAI API key (platform.openai.com → API Keys → Create new secret key)

Steps
-----
1) Unzip this folder.
2) Rename file "env.example" to ".env"
   - Open ".env" with any text editor.
   - Replace sk-REPLACE_ME with your real OpenAI key.
3) Open Terminal (Mac) or Command Prompt (Windows) in this folder and run:
   npm install
   npm start
4) In Chrome, open:  http://localhost:8080/teacher.html
5) Click:
   - "Microphone" if your laptop mic can hear the student (speaker on)
   - OR "Capture a Chrome Tab" if the student speaks in a Chrome tab (Meet/Zoom Web). When Chrome asks, choose the tab and tick "Share tab audio".
6) Watch live transcript and AI hints appear. These hints are private (only on this page).

Tips
----
- If hints are too frequent or repeated, pause and resume.
- For better accuracy later, replace browser transcription with server Whisper; I can help upgrade when you're ready.
- English by default; you can change recognition language in the code later (en-US).

Stop
----
Close the browser tab or press Stop. To stop the server, press Ctrl+C in the terminal.
