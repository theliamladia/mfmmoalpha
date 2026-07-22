// ---------- Client-side auth flow ----------
// Replaces the old "load from localStorage or show character creation" init with an
// account-backed flow: log in or register against mfmmoserver, then show the game with
// whatever character the server returns.
const screenAuth = document.getElementById('screen-auth');
const authSubtitle = document.getElementById('authSubtitle');
const authTabBtns = document.querySelectorAll('.auth-tab-btn');
const authLoginForm = document.getElementById('authLoginForm');
const authRegisterForm = document.getElementById('authRegisterForm');

const loginUsernameInput = document.getElementById('loginUsername');
const loginPasswordInput = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const btnLogin = document.getElementById('btnLogin');

const registerUsernameInput = document.getElementById('registerUsername');
const registerPasswordInput = document.getElementById('registerPassword');
const registerFirstNameInput = document.getElementById('registerFirstName');
const registerLastNameInput = document.getElementById('registerLastName');
const registerError = document.getElementById('registerError');
const btnRegister = document.getElementById('btnRegister');

authTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    authTabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    const isLogin = btn.dataset.authTab === 'login';
    authLoginForm.classList.toggle('hidden', !isLogin);
    authRegisterForm.classList.toggle('hidden', isLogin);
    authSubtitle.textContent = isLogin ? 'Log In' : 'Create Account';
  });
});

// Accounts registered before a field existed server-side (e.g. blackjack, added when Casino was
// ported) won't have it in their stored character_json. Patch defaults in on the one chokepoint
// every character passes through on the way into the game; save() then syncs it back.
function migrateServerCharacter(c) {
  if (!c.blackjack) c.blackjack = { phase: 'betting', playerCards: [], dealerCards: [], bet: 0 };
  if (!c.combat) {
    c.combat = { active: false, enemyKey: null, enemyHp: 0, enemyMaxHp: 0, playerHp: 0, playerMaxHp: 0, turn: null, guarding: false };
  }
  if (!c.maxxPurchased) c.maxxPurchased = [];
  if (c.jail && c.jail.contrabandAtkBonus === undefined) c.jail.contrabandAtkBonus = 0;
  if (c.titles && !c.titles.customTitles) c.titles.customTitles = [];
  if (!c.achievements) c.achievements = { foodEaten: 0, slutCount: 0 };
  if (c.gym && c.gym.bodyScore === undefined) c.gym.bodyScore = 0;
  if (c.fatGained === undefined) {
    c.fatGained = c.weightGained || 0;
    c.muscleGained = 0;
    delete c.weightGained;
  }
  if (c.marriage && c.marriage.spouseUserId === undefined) c.marriage.spouseUserId = null;
  return c;
}

function enterGameWithCharacter(serverCharacter) {
  character = migrateServerCharacter(serverCharacter);
  save();
  screenAuth.classList.add('hidden');
  showGame();
  refreshOnlinePlayers();
  refreshServerState();
  refreshChatMessages();
}

btnLogin.addEventListener('click', async () => {
  loginError.textContent = '';
  btnLogin.disabled = true;
  try {
    const result = await apiLogin(loginUsernameInput.value.trim(), loginPasswordInput.value);
    setAuthToken(result.token);
    enterGameWithCharacter(result.character);
  } catch (err) {
    loginError.textContent = err.reason || 'Login failed.';
  } finally {
    btnLogin.disabled = false;
  }
});

btnRegister.addEventListener('click', async () => {
  registerError.textContent = '';
  btnRegister.disabled = true;
  try {
    const result = await apiRegister(
      registerUsernameInput.value.trim(),
      registerPasswordInput.value,
      registerFirstNameInput.value.trim(),
      registerLastNameInput.value.trim()
    );
    setAuthToken(result.token);
    enterGameWithCharacter(result.character);
  } catch (err) {
    registerError.textContent = err.reason || 'Registration failed.';
  } finally {
    btnRegister.disabled = false;
  }
});

// ---------- init ----------
(async function init() {
  const token = getAuthToken();
  if (!token) {
    screenAuth.classList.remove('hidden');
    return;
  }

  try {
    const result = await apiMe();
    enterGameWithCharacter(result.character);
  } catch {
    clearAuthToken();
    screenAuth.classList.remove('hidden');
  }
})();
