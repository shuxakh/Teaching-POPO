<script>
  const statusEl = document.getElementById('status');
  const out = document.getElementById('transcript');
  const feed = document.getElementById('feed');
  const micBtn = document.getElementById('micBtn');
  const tabBtn = document.getElementById('tabBtn');
  const stopBtn = document.getElementById('stopBtn');

  let recog = null;
  let keepListening = false;      // <-- флаг “держать прослушку”
  let fullText = "";
  let lastSentTail = "";          // <-- последний отправленный “хвост” (для дедупа)
  let pingTimer = null;           // <-- пинг, чтобы Render не засыпал

  function supportsSR() {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }
  if (!supportsSR()) {
    alert("Your Chrome does not expose SpeechRecognition API. Please update Chrome.");
  }

  function tail(text, maxWords=25){
    const words = (text||"").trim().split(/\s+/);
    return words.slice(-maxWords).join(" ").toLowerCase();
  }

  function initRecog(lang='en-US') {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recog = new SR();
    recog.lang = lang;
    recog.interimResults = true;
    recog.continuous = true;

    recog.onresult = async (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const piece = r[0].transcript.trim();
          if (!piece) continue;

          fullText += (fullText ? ' ' : '') + piece;
          out.textContent = fullText;

          // --- ДЕДУП: отправляем только НОВЫЙ "хвост"
          const t = tail(fullText, 25);
          if (t && t !== lastSentTail) {
            lastSentTail = t;
            try {
              const resp = await fetch('/api/hints', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: fullText })
              });
              const data = await resp.json();
              if (data && data.card) prependCard(data.card);
            } catch (e) { console.warn('Hints error', e); }
          }
        } else {
          interim += r[0].transcript;
        }
      }
      if (interim) out.textContent = (fullText + ' ' + interim).trim();
    };

    recog.onerror = (e) => {
      console.warn('SpeechRecognition error', e);
      statusEl.textContent = "error (speech)";
      statusEl.className = "warn";
    };

    // --- АВТО-ПЕРЕЗАПУСК: SR иногда завершает сессию при паузе.
    recog.onend = () => {
      if (keepListening) {
        try { recog.start(); } catch {}
      } else {
        stopUI();
      }
    };
  }

  function prependCard(card){
    const entry = document.createElement('div');
    entry.className = 'entry';
    entry.innerHTML = `
      <div class="cols">
        <div class="col error">
          <h4>Errors & Fix</h4>
          <div class="list errors"></div>
        </div>
        <div class="col def">
          <h4>Definitions</h4>
          <div class="list defs"></div>
        </div>
        <div class="col syn">
          <h4>Synonyms</h4>
          <div class="list syns"></div>
        </div>
      </div>
    `;

    const errsWrap = entry.querySelector('.errors');
    (card.errors || []).forEach(e => {
      const div = document.createElement('div');
      div.className = 'errItem';
      div.innerHTML = `
        <div class="errTitle">${e.title || 'Mistake'}</div>
        ${e.wrong ? `<div class="wrong">❌ ${e.wrong}</div>` : ''}
        ${e.fix ? `<div class="fix">✅ ${e.fix}</div>` : ''}
        ${e.explanation ? `<div class="ex">${e.explanation}</div>` : ''}
      `;
      errsWrap.appendChild(div);
    });

    const defsWrap = entry.querySelector('.defs');
    (card.definitions || []).forEach(d => {
      const div = document.createElement('div');
      div.className = 'defItem';
      div.innerHTML = `<div class="word">${d.word || ''} (${d.pos || ''})</div>
                       <div>${d.simple_def || ''}</div>`;
      defsWrap.appendChild(div);
    });

    const synsWrap = entry.querySelector('.syns');
    (card.synonyms || []).forEach(s => {
      const div = document.createElement('div');
      div.className = 'synItem';
      const list = (s.list || []).join(', ');
      div.innerHTML = `<div class="word">${s.word || ''} (${s.pos || ''})</div>
                       <div>${list}</div>`;
      synsWrap.appendChild(div);
    });

    // Даже если пусто, 3 колонки остаются — так ты всегда видишь структуру.
    feed.prepend(entry);

    // ограничим историю 20 карточками
    const max = 20;
    while (feed.children.length > max) feed.removeChild(feed.lastChild);
  }

  function startUI(){
    micBtn.disabled = true;
    stopBtn.disabled = false;
    statusEl.textContent = "listening (mic)";
    statusEl.className = "ok";
    // держим Render бодрым, пока страница открыта
    if (!pingTimer) pingTimer = setInterval(() => { fetch('/api/health').catch(()=>{}); }, 20000);
  }
  function stopUI(){
    stopBtn.disabled = true;
    micBtn.disabled = false;
    statusEl.textContent = "stopped";
    statusEl.className = "";
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  }

  async function startMic() {
    if (!supportsSR()) return alert('Update Chrome.');
    if (!recog) initRecog('en-US');
    fullText = "";
    lastSentTail = "";
    out.textContent = "Listening via Microphone…";
    keepListening = true;
    startUI();
    try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}
    try { recog.start(); } catch {}
  }

  function stopAll() {
    keepListening = false;
    try { recog && recog.stop(); } catch {}
    stopUI();
  }

  micBtn.onclick = startMic;
  stopBtn.onclick = stopAll;

  // --- Quick test (manual) если добавлял поле “Quick test”
  const manualBtn = document.getElementById('sendManual');
  if (manualBtn){
    manualBtn.onclick = async () => {
      const t = document.getElementById('manualText').value.trim();
      if (!t) return;
      fullText = fullText ? (fullText + ' ' + t) : t;
      out.textContent = fullText;
      lastSentTail = tail(fullText, 25);
      try {
        const resp = await fetch('/api/hints', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ text: fullText })
        });
        const data = await resp.json();
        if (data && data.card) prependCard(data.card);
      } catch(e){ console.warn(e); }
    };
  }
</script>
