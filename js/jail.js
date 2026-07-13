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
    if (isGamePaused()) return;
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

// ---------- Yard Time ----------
const btnJailWorkout = document.getElementById('btnJailWorkout');
const btnJailFight = document.getElementById('btnJailFight');
const jailContrabandGrid = document.getElementById('jailContrabandGrid');
const jailActivityLog = document.getElementById('jailActivityLog');

function doJailWorkout() {
  character.cooldowns.jailWorkout = Date.now();
  const atkGain = round2(randFloat(JAIL_WORKOUT_GAIN_MIN, JAIL_WORKOUT_GAIN_MAX));
  const defGain = round2(randFloat(JAIL_WORKOUT_GAIN_MIN, JAIL_WORKOUT_GAIN_MAX));
  character.stats.attack = clampStat(character.stats.attack + atkGain);
  character.stats.defense = clampStat(character.stats.defense + defGain);
  return { message: `Yard workout: +${atkGain.toFixed(2)} Attack, +${defGain.toFixed(2)} Defense.`, cls: 'gain' };
}

btnJailWorkout.addEventListener('click', () => {
  if (getRemainingCooldown('jailWorkout', JAIL_WORKOUT_COOLDOWN_MS) > 0) return;
  const result = doJailWorkout();
  logTo(jailActivityLog, result.message, result.cls);
  save();
  renderAll();
});

function doJailFight() {
  character.cooldowns.jailFight = Date.now();
  const myPower = character.stats.attack + character.stats.defense + gearStatBonus('attack') + gearStatBonus('defense');
  const inmatePower = 20;
  const winChance = Math.max(0.2, Math.min(0.85, 0.5 + (myPower - inmatePower) * 0.01));

  if (Math.random() < winChance) {
    const stat = Math.random() < 0.5 ? 'attack' : 'defense';
    const amount = round2(randFloat(JAIL_FIGHT_STAT_GAIN_MIN, JAIL_FIGHT_STAT_GAIN_MAX));
    character.stats[stat] = clampStat(character.stats[stat] + amount);
    const label = stat === 'attack' ? 'Attack' : 'Defense';
    return { won: true, message: `You won the yard fight! +${amount.toFixed(2)} ${label}.`, cls: 'gain' };
  }
  const lost = Math.min(character.cash, randInt(JAIL_FIGHT_LOSS_MIN, JAIL_FIGHT_LOSS_MAX));
  character.cash -= lost;
  return { won: false, message: `You lost the yard fight and got shaken down for $${lost}.`, cls: 'loss' };
}

btnJailFight.addEventListener('click', () => {
  if (getRemainingCooldown('jailFight', JAIL_FIGHT_COOLDOWN_MS) > 0) return;
  const result = doJailFight();
  logTo(jailActivityLog, result.message, result.cls);
  save();
  renderAll();
});

function jailContrabandItems() {
  return [...MELEE_ITEMS, ...DRUG_ITEMS];
}

function jailContrabandCost(item) {
  return round2((item.cost !== undefined ? item.cost : item.wholesaleCost) * JAIL_CONTRABAND_MARKUP);
}

function buildJailContrabandGrid() {
  if (!jailContrabandGrid) return;
  jailContrabandGrid.innerHTML = jailContrabandItems().map((item) => `
    <div class="hustle-card">
      <h3>${item.name}</h3>
      <p>${item.type === 'drug' ? 'Smuggled product.' : `+${item.atkBonus} Attack in a fight.`}</p>
      <button data-contraband="${item.id}">Buy ($${jailContrabandCost(item).toFixed(2)})</button>
    </div>
  `).join('');

  jailContrabandGrid.querySelectorAll('[data-contraband]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const result = doBuyContraband(btn.dataset.contraband);
      if (!result.ok) { alert(result.reason); return; }
      logTo(jailActivityLog, result.message, result.cls);
      save();
      renderAll();
    });
  });
}

function doBuyContraband(itemId) {
  const item = jailContrabandItems().find((i) => i.id === itemId);
  if (!item) return { ok: false };
  const cost = jailContrabandCost(item);
  if (character.cash < cost) return { ok: false, reason: 'Not enough Floydbucks.' };
  character.cash = round2(character.cash - cost);
  addToInventory(item.id, 1);
  return { ok: true, message: `Smuggled in ${item.name} for $${cost.toFixed(2)}.`, cls: 'gain' };
}

function tickJailActivityUI() {
  if (!btnJailWorkout || pageJail.classList.contains('hidden')) return;
  const workoutRemaining = getRemainingCooldown('jailWorkout', JAIL_WORKOUT_COOLDOWN_MS);
  btnJailWorkout.disabled = workoutRemaining > 0;
  btnJailWorkout.textContent = workoutRemaining > 0 ? `Work Out (${Math.ceil(workoutRemaining / 1000)}s)` : 'Work Out';

  const fightRemaining = getRemainingCooldown('jailFight', JAIL_FIGHT_COOLDOWN_MS);
  btnJailFight.disabled = fightRemaining > 0;
  btnJailFight.textContent = fightRemaining > 0 ? `Start a Fight (${Math.ceil(fightRemaining / 1000)}s)` : 'Start a Fight';
}

// ---------- reset ----------
document.getElementById('btnReset').addEventListener('click', () => {
  if (!confirm('This will permanently delete your character. Continue?')) return;
  if (serveInterval) clearInterval(serveInterval);
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

