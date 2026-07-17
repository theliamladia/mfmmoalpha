// ---------- API client for mfmmoserver ----------
// Thin fetch wrapper. Work/Slut/Crime are server-authoritative so far -- everything else on
// the client still runs locally until it's ported the same way these were.
const API_BASE = 'https://api.mfmmo.com';
const AUTH_TOKEN_KEY = 'specialUnitsGui.authToken';

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function setAuthToken(token) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function apiRequest(path, options = {}) {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw { reason: 'Could not reach the server. Check your connection and try again.' };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data;
  return data;
}

function apiRegister(username, password, firstName, lastName) {
  return apiRequest('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, firstName, lastName }) });
}

function apiLogin(username, password) {
  return apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

function apiMe() {
  return apiRequest('/me');
}

function apiWork() {
  return apiRequest('/hustle/work', { method: 'POST' });
}

function apiSlut() {
  return apiRequest('/hustle/slut', { method: 'POST' });
}

function apiCrime() {
  return apiRequest('/hustle/crime', { method: 'POST' });
}

function apiWorkout() {
  return apiRequest('/gym/workout', { method: 'POST' });
}

function apiSetSteroidTier(tierId) {
  return apiRequest('/gym/steroid-tier', { method: 'POST', body: JSON.stringify({ tierId }) });
}

function apiRoidEscape() {
  return apiRequest('/gym/roid-escape', { method: 'POST' });
}

function apiBuyFood(itemId) {
  return apiRequest('/market/food', { method: 'POST', body: JSON.stringify({ itemId }) });
}

function apiBuyMaxx(itemId) {
  return apiRequest('/market/maxx', { method: 'POST', body: JSON.stringify({ itemId }) });
}

function apiBuyChips(amount) {
  return apiRequest('/casino/buy-chips', { method: 'POST', body: JSON.stringify({ amount }) });
}

function apiCashOut(amount) {
  return apiRequest('/casino/cash-out', { method: 'POST', body: JSON.stringify({ amount }) });
}

function apiBjDeal(bet) {
  return apiRequest('/casino/blackjack/deal', { method: 'POST', body: JSON.stringify({ bet }) });
}

function apiBjHit() {
  return apiRequest('/casino/blackjack/hit', { method: 'POST' });
}

function apiBjStand() {
  return apiRequest('/casino/blackjack/stand', { method: 'POST' });
}

function apiSlotSpin(bet) {
  return apiRequest('/casino/slots/spin', { method: 'POST', body: JSON.stringify({ bet }) });
}

function apiBankDeposit(amount) {
  return apiRequest('/bank/deposit', { method: 'POST', body: JSON.stringify({ amount }) });
}

function apiBankWithdraw(amount) {
  return apiRequest('/bank/withdraw', { method: 'POST', body: JSON.stringify({ amount }) });
}

function apiBankUpgrade() {
  return apiRequest('/bank/upgrade', { method: 'POST' });
}

function apiBankApplyCredit() {
  return apiRequest('/bank/apply-credit', { method: 'POST' });
}

function apiBankCashAdvance(amount) {
  return apiRequest('/bank/cash-advance', { method: 'POST', body: JSON.stringify({ amount }) });
}

function apiBankPayCredit() {
  return apiRequest('/bank/pay-credit', { method: 'POST' });
}

function apiBuyGun(itemId) {
  return apiRequest('/gunclub/gun', { method: 'POST', body: JSON.stringify({ itemId }) });
}

function apiBuyMelee(itemId) {
  return apiRequest('/gunclub/melee', { method: 'POST', body: JSON.stringify({ itemId }) });
}

function apiBuyAmmo(itemId) {
  return apiRequest('/gunclub/ammo', { method: 'POST', body: JSON.stringify({ itemId }) });
}

function apiApplyConcealedPermit() {
  return apiRequest('/gunclub/concealed-permit', { method: 'POST' });
}

function apiApplyGoodJob(jobId) {
  return apiRequest('/jobs/good/apply', { method: 'POST', body: JSON.stringify({ jobId }) });
}

function apiResignGoodJob() {
  return apiRequest('/jobs/good/resign', { method: 'POST' });
}

function apiGoodJobWork(skillKey) {
  return apiRequest('/jobs/good/work', { method: 'POST', body: JSON.stringify({ skillKey }) });
}

function apiApplyBadJob(jobId) {
  return apiRequest('/jobs/bad/apply', { method: 'POST', body: JSON.stringify({ jobId }) });
}

function apiResignBadJob() {
  return apiRequest('/jobs/bad/resign', { method: 'POST' });
}

function apiBadJobWork(skillKey) {
  return apiRequest('/jobs/bad/work', { method: 'POST', body: JSON.stringify({ skillKey }) });
}

function apiBuyGear(itemId) {
  return apiRequest('/jobs/gear', { method: 'POST', body: JSON.stringify({ itemId }) });
}

function apiDealerQuickDeal(dealerId) {
  return apiRequest('/dealer/quick-deal', { method: 'POST', body: JSON.stringify({ dealerId }) });
}

function apiBuyFromDealer(dealerId, qty) {
  return apiRequest('/dealer/buy', { method: 'POST', body: JSON.stringify({ dealerId, qty }) });
}

function apiSellDrugs(drugId, qty) {
  return apiRequest('/drugs/sell', { method: 'POST', body: JSON.stringify({ drugId, qty }) });
}

function apiRobbery() {
  return apiRequest('/robbery', { method: 'POST' });
}

function apiStartFight() {
  return apiRequest('/combat/start', { method: 'POST' });
}

function apiCombatAction(action) {
  return apiRequest('/combat/action', { method: 'POST', body: JSON.stringify({ action }) });
}

function apiFlee() {
  return apiRequest('/combat/flee', { method: 'POST' });
}

function apiAttemptCrime(tierId) {
  return apiRequest('/crime/attempt', { method: 'POST', body: JSON.stringify({ tierId }) });
}

function apiCommunityService() {
  return apiRequest('/crime/community-service', { method: 'POST' });
}

function apiHireLawyer() {
  return apiRequest('/jail/hire-lawyer', { method: 'POST' });
}

function apiJailWorkout() {
  return apiRequest('/jail/workout', { method: 'POST' });
}

function apiJailFight() {
  return apiRequest('/jail/fight', { method: 'POST' });
}

function apiBuyContraband(itemId) {
  return apiRequest('/jail/contraband', { method: 'POST', body: JSON.stringify({ itemId }) });
}

function apiCityHallRename(first, last) {
  return apiRequest('/cityhall/rename', { method: 'POST', body: JSON.stringify({ first, last }) });
}

function apiMarriagePropose(name) {
  return apiRequest('/cityhall/propose', { method: 'POST', body: JSON.stringify({ name }) });
}

function apiGunSafetyResult(passed) {
  return apiRequest('/cityhall/gun-safety-result', { method: 'POST', body: JSON.stringify({ passed }) });
}

function apiRangeShoot(weaponId) {
  return apiRequest('/range/shoot', { method: 'POST', body: JSON.stringify({ weaponId }) });
}

function apiRangeDraw() {
  return apiRequest('/range/draw', { method: 'POST' });
}

function apiRangeReload() {
  return apiRequest('/range/reload', { method: 'POST' });
}

function apiMtnListings() {
  return apiRequest('/mtn/listings');
}

function apiMtnList(itemId, qty, pricePerUnit) {
  return apiRequest('/mtn/list', { method: 'POST', body: JSON.stringify({ itemId, qty, pricePerUnit }) });
}

function apiMtnCancel(listingId) {
  return apiRequest('/mtn/cancel', { method: 'POST', body: JSON.stringify({ listingId }) });
}

function apiMtnBuy(listingId) {
  return apiRequest('/mtn/buy', { method: 'POST', body: JSON.stringify({ listingId }) });
}

function apiPenitentiarySync() {
  return apiRequest('/penitentiary/sync', { method: 'POST' });
}

function apiPenitentiaryRecords() {
  return apiRequest('/penitentiary/records');
}

function apiPenitentiaryBail(recordId) {
  return apiRequest('/penitentiary/bail', { method: 'POST', body: JSON.stringify({ recordId }) });
}

function apiPenitentiaryCommissary(recordId, amount) {
  return apiRequest('/penitentiary/commissary', { method: 'POST', body: JSON.stringify({ recordId, amount }) });
}

function apiAdminState() {
  return apiRequest('/admin/state');
}

function apiAdminSetPause(paused, adminPassword) {
  return apiRequest('/admin/pause', { method: 'POST', body: JSON.stringify({ paused, adminPassword }) });
}

function apiAdminSetModifier(modifier, adminPassword) {
  return apiRequest('/admin/modifier', { method: 'POST', body: JSON.stringify({ modifier, adminPassword }) });
}

function apiAdminInventory(username, adminPassword) {
  return apiRequest('/admin/inventory', { method: 'POST', body: JSON.stringify({ username, adminPassword }) });
}

function apiResetCharacter() {
  return apiRequest('/character/reset', { method: 'POST' });
}

function apiChatMessages() {
  return apiRequest('/chat/messages');
}

function apiChatSend(titleText, message) {
  return apiRequest('/chat/send', { method: 'POST', body: JSON.stringify({ titleText, message }) });
}

function apiOnlinePlayers() {
  return apiRequest('/players/online');
}

// Decodes the JWT payload client-side (no signature check -- purely for UI logic like "is it my
// turn", never trusted for anything security-relevant; the server independently re-verifies the
// token on every request).
function getMyUserId() {
  const token = getAuthToken();
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1])).sub;
  } catch {
    return null;
  }
}

function apiSyncCharacter(characterToSync) {
  return apiRequest('/character/sync', { method: 'POST', body: JSON.stringify({ character: characterToSync }) });
}

function apiMilosEnter() {
  return apiRequest('/milos/enter', { method: 'POST' });
}

function apiMilosLeave() {
  return apiRequest('/milos/leave', { method: 'POST' });
}

function apiPayPlayer(targetUsername, amount) {
  return apiRequest('/players/pay', { method: 'POST', body: JSON.stringify({ targetUsername, amount }) });
}

function apiRobPlayer(targetUsername) {
  return apiRequest('/players/rob', { method: 'POST', body: JSON.stringify({ targetUsername }) });
}

function apiDuelChallenge(targetUsername) {
  return apiRequest('/duels/challenge', { method: 'POST', body: JSON.stringify({ targetUsername }) });
}

function apiDuelRespond(duelId, accept) {
  return apiRequest('/duels/respond', { method: 'POST', body: JSON.stringify({ duelId, accept }) });
}

function apiDuelAction(duelId, action) {
  return apiRequest('/duels/action', { method: 'POST', body: JSON.stringify({ duelId, action }) });
}

function apiDuelForfeit(duelId) {
  return apiRequest('/duels/forfeit', { method: 'POST', body: JSON.stringify({ duelId }) });
}

function apiGetDuel(duelId) {
  return apiRequest(`/duels/${duelId}`);
}

function apiCoinflipCreate(wager, side) {
  return apiRequest('/coinflip/create', { method: 'POST', body: JSON.stringify({ wager, side }) });
}

function apiCoinflipLobbies() {
  return apiRequest('/coinflip/lobbies');
}

function apiCoinflipJoin(lobbyId) {
  return apiRequest('/coinflip/join', { method: 'POST', body: JSON.stringify({ lobbyId }) });
}

function apiCoinflipCancel(lobbyId) {
  return apiRequest('/coinflip/cancel', { method: 'POST', body: JSON.stringify({ lobbyId }) });
}

function apiCasinoTableJoin(game) {
  return apiRequest('/casino/table/join', { method: 'POST', body: JSON.stringify({ game }) });
}

function apiCasinoTableLeave(tableId) {
  return apiRequest('/casino/table/leave', { method: 'POST', body: JSON.stringify({ tableId }) });
}

function apiCasinoTableGet(tableId) {
  return apiRequest(`/casino/table/${tableId}`);
}

function apiTableBjBet(tableId, bet) {
  return apiRequest('/casino/table/blackjack/bet', { method: 'POST', body: JSON.stringify({ tableId, bet }) });
}

function apiTableBjHit(tableId) {
  return apiRequest('/casino/table/blackjack/hit', { method: 'POST', body: JSON.stringify({ tableId }) });
}

function apiTableBjStand(tableId) {
  return apiRequest('/casino/table/blackjack/stand', { method: 'POST', body: JSON.stringify({ tableId }) });
}

function apiTableRouletteBet(tableId, bets) {
  return apiRequest('/casino/table/roulette/bet', { method: 'POST', body: JSON.stringify({ tableId, bets }) });
}

function apiPaymentNotifications() {
  return apiRequest('/notifications/payments');
}

function apiMarkPaymentNotificationsSeen() {
  return apiRequest('/notifications/payments/seen', { method: 'POST' });
}

function apiLeaderboard() {
  return apiRequest('/leaderboard');
}
