// ---------- quiz ----------
const quizModal = document.getElementById('quizModal');
const quizTitle = document.getElementById('quizTitle');
const quizQuestionsEl = document.getElementById('quizQuestions');
const quizResultEl = document.getElementById('quizResult');
const btnQuizSubmit = document.getElementById('btnQuizSubmit');
const btnQuizCancel = document.getElementById('btnQuizCancel');

let activeQuiz = null;

function openQuiz(title, questions, passFraction, onResult) {
  activeQuiz = { questions, passFraction, onResult };
  quizTitle.textContent = title;
  quizResultEl.textContent = '';
  btnQuizSubmit.disabled = false;
  quizQuestionsEl.innerHTML = questions.map((q, qi) => `
    <div class="quiz-question">
      <p>${qi + 1}. ${q.q}</p>
      ${q.options.map((opt, oi) => `
        <label class="quiz-option"><input type="radio" name="quiz-q${qi}" value="${oi}"> ${opt}</label>
      `).join('')}
    </div>
  `).join('');
  quizModal.classList.remove('hidden');
}

function doGradeQuiz(answers, questions, passFraction) {
  let correctCount = 0;
  questions.forEach((q, qi) => {
    if (answers[qi] === q.correct) correctCount++;
  });
  const pct = correctCount / questions.length;
  return { correctCount, pct, passed: pct >= passFraction };
}

btnQuizSubmit.addEventListener('click', () => {
  if (!activeQuiz) return;
  const answers = activeQuiz.questions.map((q, qi) => {
    const checked = quizQuestionsEl.querySelector(`input[name="quiz-q${qi}"]:checked`);
    return checked ? +checked.value : null;
  });
  const result = doGradeQuiz(answers, activeQuiz.questions, activeQuiz.passFraction);
  quizResultEl.textContent = `Score: ${result.correctCount}/${activeQuiz.questions.length} (${Math.round(result.pct * 100)}%) — ${result.passed ? 'PASSED' : 'FAILED'}`;
  btnQuizSubmit.disabled = true;
  activeQuiz.onResult(result.passed);
});

btnQuizCancel.addEventListener('click', () => {
  quizModal.classList.add('hidden');
  activeQuiz = null;
});

// ---------- jail ----------
function doRecordArrest() {
  character.arrestRecord.push({ crime: character.jail.crime || 'Crime', years: character.jail.yearsRemaining, ts: Date.now() });
}

function goToJail(switchPageNow, recordArrest = true) {
  if (recordArrest) {
    doRecordArrest();
    save();
  }
  jailNavBtn.disabled = false;
  renderAll();
  if (switchPageNow) switchPage('jail');
}

function doReleaseFromJail() {
  character.jail.inJail = false;
  character.jail.crime = null;
  character.jail.yearsRemaining = 0;
  character.jail.serving = false;
}

function releaseFromJail() {
  if (serveInterval) clearInterval(serveInterval);
  serveInterval = null;
  serveElapsedMs = 0;
  doReleaseFromJail();
  save();
  jailStatus.classList.add('hidden');
  jailProgressEl.style.width = '0%';
  renderAll();
  switchPage('streets');
  logMessage('You were released from jail.', 'gain');
}

function doStartServing() {
  character.jail.serving = true;
}

function doServeTick() {
  character.jail.yearsRemaining -= 1;
  return { released: character.jail.yearsRemaining <= 0 };
}

function startServing(resetElapsed = true) {
  if (serveInterval) clearInterval(serveInterval);
  doStartServing();
  if (resetElapsed) serveElapsedMs = 0;
  save();
  jailStatus.classList.remove('hidden');

  serveInterval = setInterval(() => {
    serveElapsedMs += 100;
    jailProgressEl.style.width = `${(serveElapsedMs / COOLDOWN_MS) * 100}%`;
    if (serveElapsedMs >= COOLDOWN_MS) {
      serveElapsedMs = 0;
      const result = doServeTick();
      if (result.released) {
        releaseFromJail();
        return;
      }
      save();
      renderAll();
    }
  }, 100);
}

function doStopServing() {
  character.jail.serving = false;
}

function stopServing() {
  if (serveInterval) clearInterval(serveInterval);
  serveInterval = null;
  serveElapsedMs = 0;
  doStopServing();
  save();
  jailStatus.classList.add('hidden');
  jailProgressEl.style.width = '0%';
}

btnServe.addEventListener('click', () => startServing());
btnStopServe.addEventListener('click', stopServing);

function doHireLawyer() {
  const cost = character.jail.yearsRemaining * 150;
  if (character.cash < cost) return { ok: false, reason: 'Not enough Floydbucks to hire a lawyer.' };
  character.cash -= cost;
  return { ok: true };
}

btnLawyer.addEventListener('click', () => {
  const result = doHireLawyer();
  if (!result.ok) { alert(result.reason); return; }
  save();
  releaseFromJail();
});

// ---------- reset ----------
document.getElementById('btnReset').addEventListener('click', () => {
  if (!confirm('This will permanently delete your character. Continue?')) return;
  if (serveInterval) clearInterval(serveInterval);
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

