/* CommonStudy Local — a zero-dependency, local-first SAT practice app. */
const app = document.querySelector('#app');
const picker = document.querySelector('#pack-picker');
const STORE = { settings: 'prepbook.local.settings', history: 'prepbook.local.history' };
const MODES = {
  feedback: { name: 'Instant Feedback', description: 'Check each response before continuing.' },
  review: { name: 'Review', description: 'Answers and explanations are shown as you work.' },
  practice: { name: 'Untimed Test', description: 'No timer; review explanations at the end.' },
  timed: { name: 'Timed test', description: 'Module clock, explanations at the end.' }
};
const BUILTIN_PACKS = [...[4, 5, 6, 7, 8, 9, 10, 11].map(number => `packs/SAT-Practice-Test-${number}.qpack`), ...['Inverse-Trig-Derivatives', 'Trig-Derivatives', 'Calculus-Radicals'].map(name => `packs/${name}.qpack`)];
let packs = [];
const builtinIDs = new Set();
let selectedMode = 'timed';
let pendingSet = null;
let route = 'home';
let session = null;
let timerHandle = null;
let settings = readJSON(STORE.settings, { showTimer: true, fontScale: 1 });

function readJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function esc(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
function id(value) { return encodeURIComponent(value); }
function packCount(pack) { return pack.sets.reduce((total, set) => total + set.questions.length, 0); }

// IndexedDB keeps source packs out of the much smaller localStorage quota.
const PackDB = {
  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('prepbook-local', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('packs', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async all() { const db = await this.open(); return new Promise((resolve, reject) => { const request = db.transaction('packs').objectStore('packs').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); },
  async put(record) { const db = await this.open(); return new Promise((resolve, reject) => { const request = db.transaction('packs', 'readwrite').objectStore('packs').put(record); request.onsuccess = resolve; request.onerror = () => reject(request.error); }); },
  async remove(packID) { const db = await this.open(); return new Promise((resolve, reject) => { const request = db.transaction('packs', 'readwrite').objectStore('packs').delete(packID); request.onsuccess = resolve; request.onerror = () => reject(request.error); }); }
};

function decodePack(text) {
  if (typeof text !== 'string') throw new Error('The question pack is not readable text.');
  const divider = text.indexOf('\n');
  if (divider < 0 || text.slice(0, divider).trim() !== 'QPACK/1') throw new Error('Not a supported question pack. The first line must be QPACK/1.');
  let pack;
  try { pack = JSON.parse(text.slice(divider + 1)); } catch (error) { throw new Error(`Invalid JSON: ${error.message}`); }
  if (!pack || typeof pack !== 'object') throw new Error('The pack must contain a JSON object.');
  if (!nonempty(pack.id)) throw new Error('Pack: missing required field “id”.');
  if (!nonempty(pack.title)) throw new Error('Pack: missing required field “title”.');
  if (!Array.isArray(pack.sets) || !pack.sets.length) throw new Error('Pack: expected a non-empty “sets” array.');
  if (new Set(pack.sets.map(set => set.id)).size !== pack.sets.length) throw new Error('Set IDs must be unique.');
  pack.sets.forEach((set, setIndex) => {
    const setName = nonempty(set.title) ? set.title : `Set ${setIndex + 1}`;
    if (!nonempty(set.id)) throw new Error(`${setName}: missing required field “id”.`);
    if (!Array.isArray(set.questions) || !set.questions.length) throw new Error(`${setName}: expected a non-empty “questions” array.`);
    if (new Set(set.questions.map(q => q.id)).size !== set.questions.length) throw new Error(`${setName}: question IDs must be unique.`);
    set.questions.forEach((question, questionIndex) => validateQuestion(question, setName, questionIndex));
  });
  return pack;
}
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
function isText(question) { return String(question.answerType || '').toLowerCase() === 'textentry' || (!question.correctChoiceID && Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.length); }
function validateQuestion(q, setName, index) {
  const label = `${setName}, question ${Number.isInteger(q.number) ? q.number : index + 1}`;
  if (!nonempty(q.id)) throw new Error(`${label}: missing required field “id”.`);
  if (!Number.isInteger(q.number)) throw new Error(`${label}: expected integer for “number”.`);
  if (!nonempty(q.prompt)) throw new Error(`${label}: missing required field “prompt”.`);
  if (isText(q)) { if (!Array.isArray(q.acceptedAnswers) || !q.acceptedAnswers.length || !q.acceptedAnswers.every(nonempty)) throw new Error(`${label}: expected non-empty string array for “acceptedAnswers”.`); }
  else {
    if (!Array.isArray(q.choices) || !q.choices.length) throw new Error(`${label}: multiple choice requires a “choices” array.`);
    if (q.choices.some(c => !nonempty(c.id) || !nonempty(c.text)) || new Set(q.choices.map(c => c.id)).size !== q.choices.length) throw new Error(`${label}: choices need unique IDs and non-empty text.`);
    if (!nonempty(q.correctChoiceID)) throw new Error(`${label}: multiple choice requires “correctChoiceID”.`);
    if (!q.choices.some(choice => choice.id === q.correctChoiceID)) throw new Error(`${label}: “correctChoiceID” does not match a choice.`);
  }
}
function normalized(value) { return String(value).replace(/[\s,]/g, '').replace(/−/g, '-').toLowerCase(); }
function numeric(value) { const clean = normalized(value); if (clean.includes('/')) { const [a,b,...rest] = clean.split('/'); const top = Number(a), bottom = Number(b); return !rest.length && Number.isFinite(top) && Number.isFinite(bottom) && bottom !== 0 ? top / bottom : null; } const result = Number(clean); return Number.isFinite(result) ? result : null; }
function correct(question, answer) { if (!nonempty(answer)) return false; if (!isText(question)) return answer === question.correctChoiceID; const entered = normalized(answer); return question.acceptedAnswers.some(expected => { const a = numeric(expected), b = numeric(entered); return a !== null && b !== null ? Math.abs(a-b) < 1e-9 : normalized(expected) === entered; }); }
function answerDisplay(question, answer) { if (!answer) return 'Not answered'; if (isText(question)) return answer; return question.choices.find(choice => choice.id === answer)?.id || answer; }
function correctDisplay(question) { return isText(question) ? question.acceptedAnswers.join(' or ') : question.correctChoiceID; }

async function bootstrap() {
  app.innerHTML = '<main class="content"><p>Loading CommonStudy…</p></main>';
  try {
    const sources = await Promise.all(BUILTIN_PACKS.map(async path => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`${path} could not be loaded.`);
      return decodePack(await response.text());
    }));
    sources.forEach(pack => builtinIDs.add(pack.id));
    packs = sources.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
    const imports = await PackDB.all();
    imports.forEach(record => { try { const pack = decodePack(record.text); if (!packs.some(item => item.id === pack.id)) packs.push(pack); } catch (error) { console.warn(`Skipped saved QPACK ${record.id}:`, error); } });
  } catch (error) { toast(error.message); }
  render();
  await openSharedSet();
}

function shell(body) {
  return `<div class="shell"><aside class="sidebar"><div class="brand"><strong>CommonStudy</strong><small>SAT & calculus practice</small></div><nav class="nav">
    <button data-route="home" class="${route === 'home' ? 'active' : ''}">Practice sets</button>
    <button data-route="library" class="${route === 'library' ? 'active' : ''}">Question library</button>
    <button data-route="history" class="${route === 'history' ? 'active' : ''}">Recent results</button>
    <button data-route="settings" class="${route === 'settings' ? 'active' : ''}">Settings</button>
  </nav><div class="privacy">Your study record<br>Imports and results stay in this browser. Use Share to send a set.</div></aside><main class="content">${body}</main></div>`;
}
function render() {
  window.scrollTo(0, 0);
  clearInterval(timerHandle); timerHandle = null;
  if (route === 'exam') { renderExam(); return; }
  if (route === 'review') { renderReview(); return; }
  if (route === 'study') { renderStudy(); return; }
  if (route === 'home') app.innerHTML = shell(home());
  if (route === 'mode') app.innerHTML = shell(modePicker());
  if (route === 'library') app.innerHTML = shell(library());
  if (route === 'history') app.innerHTML = shell(history());
  if (route === 'settings') app.innerHTML = shell(settingsView());
}
function home() {
  return `<header class="top"><div><div class="eyebrow">Practice index / SAT · Calculus · Your sets</div><h1>Choose a practice set.</h1><p class="lede">SAT practice tests 4–11. Three calculus sets with worked explanations. Import your own questions.</p></div><button class="primary" data-action="pick">Import a set</button></header>
  <section class="section"><div class="section-head"><h2>Practice sets</h2><span>${packs.length} packs available</span></div><div class="test-index">${packs.map(packCard).join('')}</div></section>`;
}
function chooseSet(packID, setID) {
  const pack = packs.find(item => item.id === packID);
  const set = pack?.sets.find(item => item.id === setID);
  if (!set) return toast('That module could not be found.');
  pendingSet = { pack, set };
  route = 'mode';
  render();
  document.querySelector('#mode-heading').focus();
}
function modePicker() {
  const { pack, set } = pendingSet;
  if (!isSATSet(pack, set)) return studySetup(pack, set);
  return `<button class="quiet" data-route="home">‹ Back to sets</button>
  <header class="top section"><div><div class="eyebrow">${esc(pack.title)}</div><h1 id="mode-heading" tabindex="-1">How do you want to practice?</h1><p class="lede">${esc([set.section, set.title].filter(Boolean).join(' · '))} · ${set.questions.length} questions</p></div></header>
  <section class="section" aria-label="Question modes"><div class="mode-grid">${Object.entries(MODES).map(([key, mode]) => `<button class="mode" data-mode="${key}"><strong>${esc(mode.name)}</strong><small>${esc(mode.description)}</small></button>`).join('')}</div><p class="mode-hint">Choose a mode to start this set.</p></section>`;
}
function packCard(pack, index) { const number = pack.title.match(/(?:Test|test)\s*(\d+)/)?.[1]; return `<article class="index-entry"><div class="test-number">${number ? number.padStart(2,'0') : String(index+1).padStart(2,'0')}</div><div class="test-body"><div class="pack-meta"><span>${esc(pack.source || 'Imported set')}</span><span>${packCount(pack)} questions</span></div><h3>${esc(pack.title)}</h3>${pack.sets.map(set => `<div class="module-row"><button class="module" data-action="start" data-pack="${id(pack.id)}" data-set="${id(set.id)}"><strong>${esc(set.title)}</strong><span>${esc([set.section, `${set.questions.length} questions`].filter(Boolean).join(' · '))}</span></button><button class="share" data-action="share" data-pack="${id(pack.id)}" data-set="${id(set.id)}" aria-label="Share ${esc(set.title)}">Share</button></div>`).join('')}</div></article>`; }
function library() { return `<header class="top"><div><div class="eyebrow">Source material</div><h1>Question library</h1><p class="lede">Import QPACK files or plain-text study sets. Imports are saved in this browser.</p></div><button class="primary" data-action="pick">Import a set</button></header><section class="section import-help"><h2>Text file format</h2><p>Use question blocks with answers and optional passages, or one term and definition per line separated by a tab. Files are validated before they are saved.</p><p><a href="examples/questions.txt" download>Download question template</a> · <a href="examples/terms.txt" download>Download term template</a></p></section><section class="section"><div class="library-list">${packs.map(pack => `<div class="list-row"><div><strong>${esc(pack.title)}</strong><span>${pack.sets.length} modules · ${packCount(pack)} questions</span></div>${builtinIDs.has(pack.id) ? '<span>Included</span>' : `<button data-action="remove" data-pack="${id(pack.id)}">Remove</button>`}</div>`).join('')}</div></section>`; }
function history() { const items = readJSON(STORE.history, []); return `<header class="top"><div><div class="eyebrow">Study record</div><h1>Recent results</h1><p class="lede">Completed module results are saved in this browser.</p></div></header><section class="section">${items.length ? `<div class="history">${items.map(item => `<div class="list-row"><div><strong>${esc(item.setTitle)}</strong><span>${new Date(item.completedAt).toLocaleString()}${item.flagged ? ` · ${item.flagged} flagged` : ''}</span></div><strong>${item.correct} / ${item.total}</strong></div>`).join('')}</div>` : '<div class="empty">No completed modules yet. Finish a set to create a local result history.</div>'}</section>`; }
function settingsView() { return `<header class="top settings"><div><div class="eyebrow">Personalize CommonStudy</div><h1>Settings</h1><p class="lede">These options are saved locally in this browser.</p></div></header><section class="section settings"><div class="setting"><label>Show countdown in timed mode <input type="checkbox" data-setting="timer" ${settings.showTimer ? 'checked' : ''}></label><p>Hides or shows the SAT-style clock; it does not stop timed sessions.</p></div><div class="setting"><label>Question text size <span id="font-size">${Math.round(settings.fontScale * 100)}%</span></label><input type="range" min="0.85" max="1.35" step="0.05" value="${settings.fontScale}" data-setting="font"><p>Changes the readable size of questions and explanations.</p></div></section>`; }

function startSession(packID, setID) {
  const pack = packs.find(item => item.id === packID); const set = pack?.sets.find(item => item.id === setID); if (!set) return toast('That module could not be found.');
  const minutes = Number.isInteger(set.timeLimitMinutes) ? set.timeLimitMinutes : Math.max(10, Math.ceil(set.questions.length * 1.2));
  session = { packTitle: pack.title, set, index: 0, answers: {}, flagged: [], checked: [], seconds: minutes * 60, minutes, deadline: Date.now() + minutes * 60000 };
  route = 'exam'; render();
}
function renderExam() {
  const q = session.set.questions[session.index]; const response = session.answers[q.id] || ''; const checked = session.checked.includes(q.id) || selectedMode === 'review';
  const source = q.figureDataBase64 ? `<img alt="Question source figure" src="data:image/png;base64,${q.figureDataBase64}">` : q.figurePath ? `<img alt="Question source image" src="${esc(q.figurePath)}">` : q.passage ? esc(q.passage) : '<div class="no-passage">This question has no separate passage or figure.</div>';
  const options = isText(q) ? `<label class="label" for="typed-answer">Your answer</label><input id="typed-answer" class="text-answer" data-answer="typed" value="${esc(response)}" placeholder="Enter a number or fraction" ${checked && selectedMode !== 'review' ? 'disabled' : ''}>` : q.choices.map(choice => `<button aria-pressed="${response === choice.id}" class="choice ${response === choice.id ? 'selected' : ''}" data-choice="${id(choice.id)}" ${checked && selectedMode !== 'review' ? 'disabled' : ''}><span class="letter">${esc(choice.id)}</span><span>${esc(choice.text)}</span></button>`).join('');
  const feedback = checked ? feedbackCard(q, response) : '';
  app.innerHTML = `<div class="exam"><header class="exam-header"><button class="back" data-action="quit">Exit</button><div><div class="exam-title">${esc(session.set.section || 'SAT Practice')} · ${esc(session.set.title)}</div><div class="exam-subtitle">${esc(MODES[selectedMode].name)} · Question ${session.index + 1} of ${session.set.questions.length}</div></div>${settings.showTimer && selectedMode === 'timed' ? `<div id="timer" class="timer">${clock(session.seconds)}</div>` : ''}<button class="flag" data-action="flag">${session.flagged.includes(q.id) ? 'Flagged' : 'Flag'}</button><button class="flag" data-action="finish">End set</button></header><div class="exam-body"><section class="stimulus"><div class="stimulus-inner" style="font-size:${17 * settings.fontScale}px">${source}</div></section><section class="question"><div class="question-inner"><span class="q-number">${q.number}</span>${q.domain ? `<span class="domain">${esc(q.domain)}</span>` : ''}<div class="prompt" style="font-size:${19 * settings.fontScale}px">${esc(q.prompt)}</div>${options}${selectedMode === 'feedback' && !checked ? '<button class="primary" data-action="check">Check answer</button>' : ''}${feedback}</div></section></div><footer class="exam-footer"><button class="quiet" data-action="previous" ${session.index === 0 ? 'disabled' : ''}>‹ Back</button><span class="progress">${answeredCount()} answered · ${session.flagged.length} flagged</span>${session.index < session.set.questions.length - 1 ? '<button class="primary" data-action="next">Next ›</button>' : '<button class="primary" data-action="finish">Finish & review</button>'}</footer></div>`;
  if (selectedMode === 'timed') startTimer();
}
function feedbackCard(q, response) { const ok = correct(q, response); return `<div class="feedback ${ok ? '' : 'bad'}"><strong>${ok ? 'Correct' : `Correct answer: ${esc(correctDisplay(q))}`}</strong>${q.explanation ? `<div>${esc(q.explanation)}</div>` : '<div>No explanation was supplied for this question.</div>'}</div>`; }
function clock(seconds) { const s = Math.max(0, seconds); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function startTimer() { clearInterval(timerHandle); timerHandle = setInterval(() => { if (!session || route !== 'exam') return clearInterval(timerHandle); session.seconds = Math.max(0, Math.ceil((session.deadline - Date.now()) / 1000)); const timer = document.querySelector('#timer'); if (timer) { timer.textContent = clock(session.seconds); timer.classList.toggle('warning', session.seconds <= 300); } if (session.seconds <= 0) finishSession(); }, 1000); }
function answeredCount() { return Object.values(session.answers).filter(nonempty).length; }
function finishSession() { clearInterval(timerHandle); session.checked = session.set.questions.map(q => q.id); const result = { id: crypto.randomUUID(), setTitle: session.set.title, correct: session.set.questions.filter(q => correct(q, session.answers[q.id])).length, total: session.set.questions.length, flagged: session.flagged.length, completedAt: new Date().toISOString() }; const history = readJSON(STORE.history, []); history.unshift(result); saveJSON(STORE.history, history.slice(0, 100)); route = 'review'; render(); }
function renderReview() { const total = session.set.questions.length; const correctCount = session.set.questions.filter(q => correct(q, session.answers[q.id])).length; app.innerHTML = `<div class="exam"><header class="exam-header"><div class="exam-title">CommonStudy · Module review</div></header><main class="end-review"><header class="review-head"><div><h1>Review your answers.</h1><p>${esc(session.set.title)}</p><div class="exam-subtitle">${esc(session.packTitle)} · ${total} questions</div></div><div class="score">${correctCount} / ${total}<small>correct</small></div></header>${session.set.questions.map(q => { const ok = correct(q, session.answers[q.id]); return `<details class="review-question"><summary><span class="${ok ? 'ok' : 'wrong'}">${ok ? 'Correct' : 'Incorrect'}</span> Question ${q.number}${session.flagged.includes(q.id) ? '<span class="flagged">Flagged</span>' : ''}</summary><div class="review-detail"><strong>${esc(q.prompt)}</strong><p>Your answer: ${esc(answerDisplay(q, session.answers[q.id]))}</p><p class="ok">Correct answer: ${esc(correctDisplay(q))}</p>${q.explanation ? `<p>${esc(q.explanation)}</p>` : ''}</div></details>`; }).join('')}<div class="review-head"><button class="primary" data-action="done">Back to home</button></div></main></div>`; }

app.addEventListener('click', async event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.dataset.route) { pendingSet = null; route = target.dataset.route; render(); return; }
  if (target.dataset.mode) {
    if (route !== 'mode' || !pendingSet || !MODES[target.dataset.mode]) return;
    selectedMode = target.dataset.mode;
    const { pack, set } = pendingSet;
    pendingSet = null;
    startSession(pack.id, set.id);
    return;
  }
  const action = target.dataset.action;
  if (action === 'pick') picker.click();
  if (action === 'share') { await shareSet(decodeURIComponent(target.dataset.pack), decodeURIComponent(target.dataset.set)); return; }
  if (action === 'start') { chooseSet(decodeURIComponent(target.dataset.pack), decodeURIComponent(target.dataset.set)); return; }
  if (action === 'remove') { const packID = decodeURIComponent(target.dataset.pack); await PackDB.remove(packID); packs = packs.filter(pack => pack.id !== packID); render(); toast('Pack removed.'); }
  if (action === 'done') { route = 'home'; session = null; render(); return; }
  if (route !== 'exam') return;
  const q = session.set.questions[session.index];
  if (target.dataset.choice !== undefined) { if (!session.checked.includes(q.id) || selectedMode === 'review') { session.answers[q.id] = decodeURIComponent(target.dataset.choice); renderExam(); document.querySelectorAll('[data-choice]').forEach(button => { if (button.dataset.choice === target.dataset.choice) button.focus(); }); } }
  if (action === 'flag') { session.flagged = session.flagged.includes(q.id) ? session.flagged.filter(item => item !== q.id) : [...session.flagged, q.id]; renderExam(); }
  if (action === 'check') { if (!nonempty(session.answers[q.id])) return toast('Enter or choose an answer first.'); if (!session.checked.includes(q.id)) session.checked.push(q.id); renderExam(); }
  if (action === 'previous' && session.index) { session.index--; renderExam(); }
  if (action === 'next' && session.index < session.set.questions.length - 1) { session.index++; renderExam(); }
  if (action === 'finish') finishSession();
  if (action === 'quit') { route = 'home'; session = null; render(); }
});
app.addEventListener('input', event => { if (event.target.dataset.answer === 'typed' && session) { session.answers[session.set.questions[session.index].id] = event.target.value; } if (event.target.dataset.setting === 'font') { settings.fontScale = Number(event.target.value); saveJSON(STORE.settings, settings); document.querySelector('#font-size').textContent = `${Math.round(settings.fontScale * 100)}%`; } });
app.addEventListener('change', event => { if (event.target.dataset.setting === 'timer') { settings.showTimer = event.target.checked; saveJSON(STORE.settings, settings); } });
picker.addEventListener('change', async () => { const file = picker.files[0]; picker.value = ''; if (!file) return; try { const raw = await file.text(); const pack = raw.trimStart().startsWith('QPACK/1') ? decodePack(raw.trimStart()) : parseTextSet(raw, file.name); const text = 'QPACK/1\n' + JSON.stringify(pack); if (builtinIDs.has(pack.id)) throw new Error('Use a different pack ID; included tests cannot be replaced.'); await PackDB.put({ id: pack.id, text, importedAt: new Date().toISOString() }); packs = [...packs.filter(item => item.id !== pack.id), pack]; route = 'library'; render(); toast(`Imported ${pack.title}.`); } catch (error) { toast(error.message); } });
function toast(message) { const old = document.querySelector('.toast'); old?.remove(); const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = message; document.body.append(el); setTimeout(() => el.remove(), 5200); }
bootstrap();
