// ---------------------------------------------------------------------------
// Task 72: delivery and partner companies (Blueprint 15.1).
//
// Free delivery: send any product to a reachable company. The products and the
// shipping cost (gold) are used up; the company's score grows.
// Order: a company's next order asks for a fixed product and quantity. Sending
// exactly that completes it and pays reputation (permanent.totalPrestige: it
// only grows and is never spent; the reputation effects read it, see below).
// Nothing here touches the DOM except log().
//
// Progress per company lives in permanent.companies (see state.js).
// Regular trade (score >= company.regularScore): tickTrades() buys the
// company's favorite products at a better price on a fixed interval (Task 73).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Task 75: reputation effects (REPUTATION_EFFECTS in data.js).
// ---------------------------------------------------------------------------
function reputationDef(key){
  return REPUTATION_EFFECTS.find(e => e.key === key) || null;
}

// Reputation that counts: never above BALANCE.reputation.MAX.
function reputationPointsCounted(){
  return Math.min(permanent.totalPrestige, BALANCE.reputation.MAX);
}

function isReputationEffectOpen(key){
  const def = reputationDef(key);
  return !!def && permanent.totalPrestige >= def.unlock;
}

// Extra multiplier from reputation: +MULT_PER_POINT per point up to MULT_SOFT_AT,
// then the smaller MULT_PER_POINT_SOFT (Task 76).
function reputationMultiplierBonus(){
  const b = BALANCE.reputation, p = reputationPointsCounted();
  const firstPart = Math.min(p, b.MULT_SOFT_AT);
  return firstPart * b.MULT_PER_POINT + Math.max(0, p - b.MULT_SOFT_AT) * b.MULT_PER_POINT_SOFT;
}

// Size of an effect right now (0 while it is closed). 'multiplier' is read
// through mult(); the others are fractions (0.06 = 6%).
function reputationEffect(key){
  const def = reputationDef(key);
  if(!def || def.unit === 'multiplier' || !isReputationEffectOpen(key)) return 0;
  const size = def.perPoint * reputationPointsCounted();
  return def.max === undefined ? size : Math.min(def.max, size);
}

// ---------------------------------------------------------------------------
// Task 72: delivery and companies.
// ---------------------------------------------------------------------------
function companyDef(key){
  if(typeof key !== 'string') return null;
  return COMPANIES.find(c => c.key === key) || null;
}

// How many companies the current reputation allows (always at least 1).
function companySlots(){
  const t = BALANCE.delivery.SLOT_THRESHOLDS;
  const n = t.filter(need => permanent.totalPrestige >= need).length;
  return Math.max(1, Math.min(n, COMPANIES.length));
}

// A company can be dealt with when delivery is researched, it is inside the
// reputation slots and its own research requirements are done.
function isCompanyOpen(key){
  const def = companyDef(key);
  if(!def || !isDeliveryUnlocked()) return false;
  if(COMPANIES.indexOf(def) >= companySlots()) return false;
  return (def.requires || []).every(isResearchDone);
}

function companyProgress(key){
  return permanent.companies && permanent.companies[key] ? permanent.companies[key] : null;
}

function shippingCost(key, productKey, qty){
  const def = companyDef(key), recipe = recipeByKey(productKey);
  if(!def || !recipe || !Number.isInteger(qty) || qty <= 0) return 0;
  return Math.ceil(qty * recipe.sell * BALANCE.delivery.SHIPPING_RATE * def.distance * (1 - reputationEffect('shippingDiscount')));
}

// Score a delivery of `qty` units would add right now (fractional is fine).
// Each unit counts for max(REPEAT_MIN_WEIGHT, 1 - unitsAlreadySent / REPEAT_DECAY_UNITS),
// where unitsAlreadySent includes the earlier units of the same delivery: one huge
// delivery is worth no more than the same units sent in small pieces (Task 76).
function deliveryScore(key, productKey, qty){
  const def = companyDef(key), recipe = recipeByKey(productKey), p = companyProgress(key);
  if(!def || !recipe || !p || !Number.isInteger(qty) || qty <= 0) return 0;
  const b = BALANCE.delivery;
  const sent = p.sent[productKey] || 0;
  const linearUnits = b.REPEAT_DECAY_UNITS * (1 - b.REPEAT_MIN_WEIGHT); // units before the weight reaches its floor
  const a = Math.min(qty, Math.max(0, linearUnits - sent));              // units still on the slope
  const slope = a * (1 - sent / b.REPEAT_DECAY_UNITS) - a * (a - 1) / (2 * b.REPEAT_DECAY_UNITS);
  const weighted = slope + (qty - a) * b.REPEAT_MIN_WEIGHT;
  const fav = def.favorites.includes(productKey) ? b.FAVORITE_MULT : 1;
  return weighted * recipe.sell * fav;
}

function canDeliver(key, productKey, qty){
  if(!isCompanyOpen(key) || !recipeByKey(productKey)) return false;
  if(!Number.isInteger(qty) || qty <= 0) return false;
  if((state.products[productKey] || 0) < qty) return false;
  return state.gold >= shippingCost(key, productKey, qty);
}

function applyDelivery(key, productKey, qty){
  const p = companyProgress(key);
  const gain = deliveryScore(key, productKey, qty);
  state.gold -= shippingCost(key, productKey, qty);
  state.products[productKey] -= qty;
  p.score += gain;
  p.sent[productKey] = (p.sent[productKey] || 0) + qty;
  return gain;
}

// Free delivery. Returns the score gained, or 0 when it could not be done
// (nothing is spent then).
function deliverProducts(key, productKey, qty){
  if(!canDeliver(key, productKey, qty)) return 0;
  const def = companyDef(key), recipe = recipeByKey(productKey);
  const wasRegular = isRegularTrade(key);
  const gain = applyDelivery(key, productKey, qty);
  log(def.name + '에 ' + recipe.name + ' ' + qty + '개를 납품했습니다. (점수 +' + fmt(gain) + ')');
  logRegularTradeStart(def, wasRegular);
  return gain;
}

// Says so once, on the delivery that makes the score cross the company's line.
function logRegularTradeStart(def, wasRegular){
  if(!wasRegular && isRegularTrade(def.key)) log(def.name + '과(와) 정기 거래를 시작합니다!');
}

function isRegularTrade(key){
  const def = companyDef(key), p = companyProgress(key);
  return !!def && !!p && p.score >= def.regularScore;
}

// The company's next order, or null when all are done or it is not open.
function currentOrder(key){
  const def = companyDef(key), p = companyProgress(key);
  if(!def || !p || p.orderIndex >= def.orders.length) return null;
  return def.orders[p.orderIndex];
}

// Reputation an order pays: floor(sqrt(base value / divisor)), at most the cap.
function orderReputation(order){
  const recipe = order && recipeByKey(order.product);
  if(!recipe) return 0;
  const b = BALANCE.delivery;
  const rep = Math.floor(Math.sqrt(order.qty * recipe.sell / b.ORDER_VALUE_DIVISOR));
  return Math.min(b.ORDER_REPUTATION_CAP, Math.max(0, rep));
}

function canCompleteOrder(key){
  const order = currentOrder(key);
  return !!order && isCompanyOpen(key) && canDeliver(key, order.product, order.qty);
}

// Completes the company's current order in one go. Returns the reputation
// gained (0 on failure; nothing is spent then).
function completeOrder(key){
  if(!canCompleteOrder(key)) return 0;
  const def = companyDef(key), p = companyProgress(key), order = currentOrder(key);
  const rep = orderReputation(order);
  const wasRegular = isRegularTrade(key);
  const slotsBefore = companySlots();
  const effectsBefore = REPUTATION_EFFECTS.filter(e => isReputationEffectOpen(e.key));
  applyDelivery(key, order.product, order.qty);
  p.orderIndex += 1;
  permanent.totalPrestige += rep;
  log(def.name + '의 수주를 완수했습니다. 명성 +' + rep);
  logRegularTradeStart(def, wasRegular);
  if(companySlots() > slotsBefore) log('명성이 올라 새 회사와 거래할 수 있게 되었습니다.');
  REPUTATION_EFFECTS.filter(e => isReputationEffectOpen(e.key) && !effectsBefore.includes(e)).forEach(e => log('명성 효과가 열렸습니다: ' + e.name));
  return rep;
}

// Task 73: regular trade. Every TRADE_INTERVAL_SEC a company with a regular
// trade buys up to TRADE_QTY units of the first favorite product in stock and
// pays above the normal price. With nothing in stock it simply waits (no
// penalty); the purchase happens as soon as stock exists.
function tradeProduct(key){
  const def = companyDef(key);
  if(!def) return null;
  return def.favorites.find(k => (state.products[k] || 0) >= 1) || null;
}

function tickTrades(){
  const b = BALANCE.delivery;
  COMPANIES.forEach(def => {
    if(!isRegularTrade(def.key)) return;
    const p = companyProgress(def.key);
    const interval = tradeInterval(); // Task 80: 빠른 거래
    p.tradeTimer = Math.min(interval, p.tradeTimer + 1 / TICKS_PER_SECOND);
    if(p.tradeTimer < interval) return;
    const productKey = tradeProduct(def.key);
    if(!productKey) return;
    const qty = Math.min(tradeQty(),Math.floor(state.products[productKey]));
    const recipe = recipeByKey(productKey);
    const earned = qty * recipe.sell * b.TRADE_PRICE_MULT * (1 + reputationEffect('tradePrice')) * mult();
    state.products[productKey] -= qty;
    state.gold += earned;
    p.tradeTimer = 0;
    log(def.name + '과(와) 정기 거래: ' + recipe.name + ' ' + qty + '개 → +' + fmt(earned) + 'G');
  });
}
