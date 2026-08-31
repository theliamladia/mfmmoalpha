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

// Tracks the character revision the server last confirmed saving -- every response that includes
// one flows through here automatically (all requests go through this one function), so callers
// never have to thread it through by hand. apiSyncCharacter reads it back out to guard against a
// stale tab/device silently overwriting newer progress -- see /character/sync in server.js.
let characterRev = null;

async function apiRequest(path, options = {}) {
  // Flush any character edit still sitting in save()'s debounce before anything else goes out --
  // otherwise a server-authoritative action fired right after a client-side-only edit (e.g. an
  // admin stat/cash editor) can read/save the character on the server *before* that edit ever arrives,
  // then hand the client back that edit-less version, silently discarding it (or, if the debounced
  // sync fires after, rejecting it as stale). See flushCharacterSync() in js/core.js. A no-op if
  // nothing is pending -- and this request loop is guarded against re-entering itself, since
  // flushCharacterSync() clears serverSyncPending before the sync request it triggers reaches here.
  if (path !== '/character/sync' && typeof flushCharacterSync === 'function') {
    await flushCharacterSync();
  }

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
  // Read the rev BEFORE throwing. An error response still carries the authoritative rev, and
  // dropping it is what made a single conflict permanent: characterRev stayed at the stale value,
  // so every later /character/sync re-sent the same expectedRev and 409'd again, forever. The
  // conflict body reports it as `currentRev` rather than `rev`, so accept either spelling.
  if (typeof data.rev === 'number') characterRev = data.rev;
  else if (typeof data.currentRev === 'number') characterRev = data.currentRev;
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

// `count` is the batch size for the x5 buttons (1 when omitted). The server clamps it -- see
// clampBatchCount in mfmmoserver/gameLogic.js -- so this is a request, not an instruction.
function apiWork(count) {
  return apiRequest('/hustle/work', { method: 'POST', body: JSON.stringify({ count: count || 1 }) });
}

function apiSlut(count) {
  return apiRequest('/hustle/slut', { method: 'POST', body: JSON.stringify({ count: count || 1 }) });
}

function apiCrime(count) {
  return apiRequest('/hustle/crime', { method: 'POST', body: JSON.stringify({ count: count || 1 }) });
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

function apiStretchHeight() {
  return apiRequest('/gym/stretch-height', { method: 'POST' });
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

function apiBjDouble() {
  return apiRequest('/casino/blackjack/double', { method: 'POST' });
}

function apiBjSplit() {
  return apiRequest('/casino/blackjack/split', { method: 'POST' });
}

function apiSlotSpin(machine, bet) {
  return apiRequest('/casino/slots/spin', { method: 'POST', body: JSON.stringify({ machine, bet }) });
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

// ---------- Cribz ----------
function apiCribState() {
  return apiRequest('/crib/state');
}
function apiCribBuyPlot(street) {
  return apiRequest('/crib/plot/buy', { method: 'POST', body: JSON.stringify({ street }) });
}
function apiCribUpgrade() {
  return apiRequest('/crib/upgrade', { method: 'POST' });
}
function apiCribVaultDeposit(amount) {
  return apiRequest('/crib/vault/deposit', { method: 'POST', body: JSON.stringify({ amount }) });
}
function apiCribVaultWithdraw(amount) {
  return apiRequest('/crib/vault/withdraw', { method: 'POST', body: JSON.stringify({ amount }) });
}
function apiCribStashDeposit(itemId, qty) {
  return apiRequest('/crib/stash/deposit', { method: 'POST', body: JSON.stringify({ itemId, qty }) });
}
function apiCribStashWithdraw(itemId, qty) {
  return apiRequest('/crib/stash/withdraw', { method: 'POST', body: JSON.stringify({ itemId, qty }) });
}
function apiCribDisplayAdd(gradedId) {
  return apiRequest('/crib/display/add', { method: 'POST', body: JSON.stringify({ gradedId }) });
}
function apiCribDisplayRemove(gradedId) {
  return apiRequest('/crib/display/remove', { method: 'POST', body: JSON.stringify({ gradedId }) });
}
function apiCribVisionEquip(visionId) {
  return apiRequest('/crib/vision/equip', { method: 'POST', body: JSON.stringify({ visionId }) });
}
function apiCribNeighbourhood() {
  return apiRequest('/crib/neighbourhood');
}
function apiCribVisit(username) {
  return apiRequest(`/crib/visit/${encodeURIComponent(username)}`);
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

function apiBuyArmor(itemId) {
  return apiRequest('/gunclub/armor', { method: 'POST', body: JSON.stringify({ itemId }) });
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

// `count` is the x10 Work Shift batch size (1 when omitted); clamped 1-10 server-side.
function apiGoodJobWork(skillKey, count) {
  return apiRequest('/jobs/good/work', { method: 'POST', body: JSON.stringify({ skillKey, count: count || 1 }) });
}

function apiApplyBadJob(jobId) {
  return apiRequest('/jobs/bad/apply', { method: 'POST', body: JSON.stringify({ jobId }) });
}

function apiResignBadJob() {
  return apiRequest('/jobs/bad/resign', { method: 'POST' });
}

function apiBadJobWork(skillKey, count) {
  return apiRequest('/jobs/bad/work', { method: 'POST', body: JSON.stringify({ skillKey, count: count || 1 }) });
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

function apiMarriageRespond(proposalId, accept) {
  return apiRequest('/cityhall/respond', { method: 'POST', body: JSON.stringify({ proposalId, accept }) });
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

function apiAdminSetPause(paused) {
  return apiRequest('/admin/pause', { method: 'POST', body: JSON.stringify({ paused }) });
}

function apiAdminSetModifier(modifier) {
  return apiRequest('/admin/modifier', { method: 'POST', body: JSON.stringify({ modifier }) });
}

function apiAdminSetMaintenance(maintenance) {
  return apiRequest('/admin/maintenance', { method: 'POST', body: JSON.stringify({ maintenance }) });
}

function apiAdminInventory(username) {
  return apiRequest('/admin/inventory', { method: 'POST', body: JSON.stringify({ username }) });
}

function apiAdminResetAllStats() {
  return apiRequest('/admin/reset-all-stats', { method: 'POST' });
}

function apiAdminSeasonWipe() {
  return apiRequest('/admin/season-wipe', { method: 'POST' });
}

function apiAdminGrantItem(username, itemId, qty) {
  return apiRequest('/admin/grant-item', { method: 'POST', body: JSON.stringify({ username, itemId, qty }) });
}

function apiAdminGrantCash(username, amount) {
  return apiRequest('/admin/grant-cash', { method: 'POST', body: JSON.stringify({ username, amount }) });
}

// Mints a graded slab AND its cert in one go -- see the Slab Granter block in js/admin.js for why
// apiAdminGrantItem can't do this. `subgains` is null to let the server roll them (or for a grader
// that doesn't have them) or { gloss, stitch, aura, drip } to set them exactly; the server validates
// the values and derives blackLabel itself rather than trusting a flag off the wire.
function apiAdminGrantSlab(username, baseId, grader, grade, subgains) {
  return apiRequest('/admin/grant-slab', {
    method: 'POST',
    body: JSON.stringify({ username, baseId, grader, grade, subgains: subgains || null }),
  });
}

// Rebuilds the cert registry from an inventory scan: mints for a slab with no cert, DELETES certs
// for slabs nobody holds any more (a sold slab, in practice), and purges the ghosts the old
// retire-on-drift behaviour left behind. `dryRun` reports the counts and changes nothing.
function apiAdminGradingReconcile(dryRun) {
  return apiRequest('/admin/grading-reconcile', { method: 'POST', body: JSON.stringify({ dryRun: !!dryRun }) });
}

function apiAdminNmgFastForwardAll() {
  return apiRequest('/admin/nmg-fast-forward-all', { method: 'POST' });
}
function apiAdminCosmetixxMarketRegen() {
  return apiRequest('/admin/cosmetixx-market-regen', { method: 'POST' });
}

function apiAdminTransactions({ username, beforeId } = {}) {
  const params = new URLSearchParams();
  if (username) params.set('username', username);
  if (beforeId) params.set('beforeId', beforeId);
  const qs = params.toString();
  return apiRequest(`/admin/transactions${qs ? `?${qs}` : ''}`);
}

function apiAdminTransactionsSummary() {
  return apiRequest('/admin/transactions/summary');
}

function apiResetCharacter() {
  return apiRequest('/character/reset', { method: 'POST' });
}

function apiChatMessages() {
  return apiRequest('/chat/messages');
}

function apiChatSend(titleText, message, titleId) {
  return apiRequest('/chat/send', { method: 'POST', body: JSON.stringify({ titleText, message, titleId }) });
}

function apiOnlinePlayers() {
  return apiRequest('/players/online');
}

function apiAllPlayers() {
  return apiRequest('/players/all');
}

function apiGetProfile(username, page) {
  return apiRequest(`/profile/${encodeURIComponent(username)}?page=${page || 1}`);
}
function apiSetProfileStatus(status) {
  return apiRequest('/profile/status', { method: 'POST', body: JSON.stringify({ status }) });
}
function apiSetProfileBanner(titleId) {
  return apiRequest('/profile/banner', { method: 'POST', body: JSON.stringify({ titleId }) });
}
function apiToggleProfilePrivacy(field) {
  return apiRequest('/profile/privacy/toggle', { method: 'POST', body: JSON.stringify({ field }) });
}
function apiAddShowcaseTitle(titleId) {
  return apiRequest('/profile/showcase/add', { method: 'POST', body: JSON.stringify({ titleId }) });
}
function apiRemoveShowcaseTitle(titleId) {
  return apiRequest('/profile/showcase/remove', { method: 'POST', body: JSON.stringify({ titleId }) });
}
function apiAddSlabShowcase(titleId) {
  return apiRequest('/profile/slab-showcase/add', { method: 'POST', body: JSON.stringify({ titleId }) });
}
function apiRemoveSlabShowcase(titleId) {
  return apiRequest('/profile/slab-showcase/remove', { method: 'POST', body: JSON.stringify({ titleId }) });
}
function apiListSlabForSale(itemId, price) {
  return apiRequest('/profile/slab-market/list', { method: 'POST', body: JSON.stringify({ itemId, price }) });
}
function apiPostWall(targetUsername, text) {
  return apiRequest('/profile/wall/post', { method: 'POST', body: JSON.stringify({ targetUsername, text }) });
}
function apiDeleteWallPost(targetUsername, postId, page) {
  return apiRequest('/profile/wall/delete', { method: 'POST', body: JSON.stringify({ targetUsername, postId, page }) });
}

function apiStocks() {
  return apiRequest('/stocks');
}

function apiStockHistory(symbol, range) {
  return apiRequest(`/stocks/${encodeURIComponent(symbol)}/history?range=${encodeURIComponent(range)}`);
}

function apiBuyStock(symbol, qty) {
  return apiRequest('/stocks/buy', { method: 'POST', body: JSON.stringify({ symbol, qty }) });
}

function apiSellStock(symbol, qty) {
  return apiRequest('/stocks/sell', { method: 'POST', body: JSON.stringify({ symbol, qty }) });
}

function apiInvestorChatMessages() {
  return apiRequest('/investors/chat/messages');
}

function apiInvestorChatSend(titleText, message, titleId) {
  return apiRequest('/investors/chat/send', { method: 'POST', body: JSON.stringify({ titleText, message, titleId }) });
}

function apiInvestorL2Feed() {
  return apiRequest('/investors/l2/feed');
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

// UI-only, same as getMyUserId -- never trusted for anything security-relevant. The server
// independently re-verifies the signed JWT (and its username claim) on every admin request.
function getMyUsername() {
  const token = getAuthToken();
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1])).username;
  } catch {
    return null;
  }
}

function apiSyncCharacter(characterToSync) {
  return apiRequest('/character/sync', { method: 'POST', body: JSON.stringify({ character: characterToSync, expectedRev: characterRev }) });
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

function apiSlimePlayer(targetUsername) {
  return apiRequest('/players/slime', { method: 'POST', body: JSON.stringify({ targetUsername }) });
}

function apiEnjoyPlayer(targetUsername) {
  return apiRequest('/players/enjoy', { method: 'POST', body: JSON.stringify({ targetUsername }) });
}

function apiVarietyState() {
  return apiRequest('/variety/state');
}

function apiVarietyRenounce() {
  return apiRequest('/variety/renounce', { method: 'POST' });
}

function apiSecumaxState() {
  return apiRequest('/secumax/state');
}

function apiSecumaxSubscribe(tier) {
  return apiRequest('/secumax/subscribe', { method: 'POST', body: JSON.stringify({ tier }) });
}

function apiSecumaxCancel() {
  return apiRequest('/secumax/cancel', { method: 'POST' });
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

function apiRouletteSpin(bets) {
  return apiRequest('/casino/roulette/spin', { method: 'POST', body: JSON.stringify({ bets }) });
}

function apiPaymentNotifications() {
  return apiRequest('/notifications/payments');
}

function apiMarkPaymentNotificationsSeen() {
  return apiRequest('/notifications/payments/seen', { method: 'POST' });
}

function apiMtnSaleNotifications() {
  return apiRequest('/notifications/mtn-sales');
}

function apiMarkMtnSaleNotificationsSeen() {
  return apiRequest('/notifications/mtn-sales/seen', { method: 'POST' });
}

function apiReportSubmit(type, message) {
  return apiRequest('/reports/submit', { method: 'POST', body: JSON.stringify({ type, message }) });
}

function apiReportsList(page, type) {
  const params = new URLSearchParams({ page: String(page) });
  if (type) params.set('type', type);
  return apiRequest(`/reports/list?${params.toString()}`);
}

function apiResolveReport(id, comment) {
  return apiRequest(`/reports/${id}/resolve`, { method: 'POST', body: JSON.stringify({ comment }) });
}

function apiReportResolvedNotifications() {
  return apiRequest('/notifications/report-resolved');
}

function apiMarkReportResolvedNotificationsSeen() {
  return apiRequest('/notifications/report-resolved/seen', { method: 'POST' });
}

function apiAdminBankBalances() {
  return apiRequest('/admin/bank-balances');
}

function apiAdminCryptoBalances() {
  return apiRequest('/admin/crypto-balances');
}

function apiRobberyNotifications() {
  return apiRequest('/notifications/robberies');
}

function apiMarkRobberyNotificationsSeen() {
  return apiRequest('/notifications/robberies/seen', { method: 'POST' });
}

function apiSlimeNotifications() {
  return apiRequest('/notifications/slimes');
}

function apiMarkSlimeNotificationsSeen() {
  return apiRequest('/notifications/slimes/seen', { method: 'POST' });
}

function apiLeaderboard() {
  return apiRequest('/leaderboard');
}

// ---------- Milos Outlook Farms ----------
function apiFarmsState() {
  return apiRequest('/farms/state');
}
function apiFarmsBuyPlot() {
  return apiRequest('/farms/plot/buy', { method: 'POST' });
}
function apiFarmsPrepPlot(plotId) {
  return apiRequest('/farms/plot/prep', { method: 'POST', body: JSON.stringify({ plotId }) });
}
function apiFarmsPlantSeed(plotId, drugId, qty) {
  return apiRequest('/farms/plot/plant', { method: 'POST', body: JSON.stringify({ plotId, drugId, qty }) });
}
function apiFarmsCollect(plotId) {
  return apiRequest('/farms/plot/collect', { method: 'POST', body: JSON.stringify({ plotId }) });
}
function apiFarmsBuySecurity() {
  return apiRequest('/farms/security/buy', { method: 'POST' });
}

// ---------- Floydcoin (crypto) ----------
function apiCryptoState() {
  return apiRequest('/crypto/state');
}
function apiCryptoUpgrade(track) {
  return apiRequest('/crypto/upgrade', { method: 'POST', body: JSON.stringify({ track }) });
}
function apiCryptoAdvanceMachine() {
  return apiRequest('/crypto/advance-machine', { method: 'POST' });
}
function apiCryptoPrestige() {
  return apiRequest('/crypto/prestige', { method: 'POST' });
}
function apiCryptoCollect() {
  return apiRequest('/crypto/collect', { method: 'POST' });
}
function apiCryptoSell(amount) {
  return apiRequest('/crypto/sell', { method: 'POST', body: JSON.stringify({ amount }) });
}
function apiCryptoBuy(amount) {
  return apiRequest('/crypto/buy', { method: 'POST', body: JSON.stringify({ amount }) });
}
function apiCryptoColdStorageDeposit(amount) {
  return apiRequest('/crypto/cold-storage/deposit', { method: 'POST', body: JSON.stringify({ amount }) });
}
function apiCryptoColdStorageWithdraw(amount) {
  return apiRequest('/crypto/cold-storage/withdraw', { method: 'POST', body: JSON.stringify({ amount }) });
}
function apiCryptoColdStorageUpgrade() {
  return apiRequest('/crypto/cold-storage/upgrade', { method: 'POST' });
}

// ---------- Bussdowns (PC scam rig) ----------
function apiBussdownsState() {
  return apiRequest('/bussdowns/state');
}
function apiBussdownsStart(taskId) {
  return apiRequest('/bussdowns/start', { method: 'POST', body: JSON.stringify({ taskId }) });
}
function apiBussdownsChoice(optionId) {
  return apiRequest('/bussdowns/choice', { method: 'POST', body: JSON.stringify({ optionId }) });
}
function apiBussdownsAbandon() {
  return apiRequest('/bussdowns/abandon', { method: 'POST' });
}
function apiBussdownsUpgrade(part) {
  return apiRequest('/bussdowns/upgrade', { method: 'POST', body: JSON.stringify({ part }) });
}

// ---------- Altcoins ----------
function apiAltcoinsList() {
  return apiRequest('/altcoins/list');
}
function apiAltcoinsMine() {
  return apiRequest('/altcoins/mine');
}
function apiAltcoinMint(name) {
  return apiRequest('/altcoins/mint', { method: 'POST', body: JSON.stringify({ name }) });
}
function apiAltcoinBuy(altcoinId, qty) {
  return apiRequest('/altcoins/buy', { method: 'POST', body: JSON.stringify({ altcoinId, qty }) });
}
function apiAltcoinDump(altcoinId) {
  return apiRequest('/altcoins/dump', { method: 'POST', body: JSON.stringify({ altcoinId }) });
}
function apiAltcoinBuyout(altcoinId) {
  return apiRequest('/altcoins/buyout', { method: 'POST', body: JSON.stringify({ altcoinId }) });
}

function apiGetCrateStock() {
  return apiRequest('/crates/redblue/stock');
}
function apiSpinRedBlueCrate(crateKey, qty) {
  return apiRequest('/crates/redblue/spin', { method: 'POST', body: JSON.stringify({ crate: crateKey, qty }) });
}

// SHALOM CRATE: same globally-limited-stock mechanic as RED/BLUE, own endpoint/column since it's a
// single crate (not a red/blue pair) -- see mfmmoserver server.js/db.js.
function apiGetShalomCrateStock() {
  return apiRequest('/crates/shalom/stock');
}
function apiSpinShalomCrate(qty) {
  return apiRequest('/crates/shalom/spin', { method: 'POST', body: JSON.stringify({ qty }) });
}

function apiNmgState() {
  return apiRequest('/nmg/state');
}
function apiNmgSubmit(stackId, tier, grader) {
  return apiRequest('/nmg/submit', { method: 'POST', body: JSON.stringify({ stackId, tier, grader }) });
}
function apiNmgReveal(slotId) {
  return apiRequest('/nmg/reveal', { method: 'POST', body: JSON.stringify({ slotId }) });
}
// Regrade reuses the /nmg/reveal flow verbatim -- the server stores the slab's pre-grade id in the
// slot, so revealing it mints `${preGradeId}${graderSuffix}${newGrade}` through the exact same path.
// No `grader` argument: a slab always goes back to the grader that graded it, and the server reads
// that off the slab's own id rather than trusting the request.
function apiNmgRegrade(stackId, tier) {
  return apiRequest('/nmg/regrade', { method: 'POST', body: JSON.stringify({ stackId, tier }) });
}
// Crack moved server-side with the cert registry: a crack RETIRES a cert, and a retirement the
// server never hears about is a permanent, silent Pop Report lie. Replaces the old local mutation.
function apiNmgCrack(stackId) {
  return apiRequest('/nmg/crack', { method: 'POST', body: JSON.stringify({ stackId }) });
}
function apiGradingPopReport() {
  return apiRequest('/grading/pop-report');
}
function apiGradingCert(grader, seriesNo) {
  return apiRequest(`/grading/cert/${encodeURIComponent(grader)}/${encodeURIComponent(seriesNo)}`);
}
// Selling a slab for cash DESTROYS it, so its cert is deleted outright (not retired like a crack).
// Registry-only: the cash and the inventory removal stay client-side like every other title sale.
function apiGradingDestroyCert(gradedId) {
  return apiRequest('/grading/cert/destroy', { method: 'POST', body: JSON.stringify({ gradedId }) });
}

function apiGradingMyCerts() {
  return apiRequest('/grading/my-certs');
}
// Set Registry: your own progress (computed server-side from your inventory + escrowed MTN
// listings) plus the public ranked table of every player's currently-complete sets, per crate.
function apiGradingRegistry() {
  return apiRequest('/grading/registry');
}
function apiFoilAscension(stackId) {
  return apiRequest('/cosmetics/foil-ascension', { method: 'POST', body: JSON.stringify({ stackId }) });
}
function apiCosmetixxMarketState() {
  return apiRequest('/cosmetixx-market/state');
}
function apiCosmetixxMarketBuy(slotId) {
  return apiRequest('/cosmetixx-market/buy', { method: 'POST', body: JSON.stringify({ slotId }) });
}
