// ---------------------------------------------------------------------------
// Task 72: delivery and partner companies (Blueprint 15.1).
//
// Free delivery: send any product to a reachable company. The products and the
// shipping cost (gold) are used up; the company's score grows.
// Order: a company's next order asks for a fixed product and quantity. Sending
// exactly that completes it and pays reputation (permanent.totalPrestige, which
// mult() already reads, and permanent.reputationPoints, which is spendable —
// the spending is a later Task). Nothing here touches the DOM except log().
//
// Progress per company lives in permanent.companies (see state.js).
// Regular trade (score >= company.regularScore) is only reported here
// (isRegularTrade); the trade itself is a later Task.
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

function recipeByKey(key){
  return RECIPES.find(r => r.key === key) || null;
}

function shippingCost(key, productKey, qty){
  const def = companyDef(key), recipe = recipeByKey(productKey);
  if(!def || !recipe || !Number.isInteger(qty) || qty <= 0) return 0;
  return Math.ceil(qty * recipe.sell * BALANCE.delivery.SHIPPING_RATE * def.distance);
}

// Score a delivery of `qty` units would add right now (fractional is fine).
function deliveryScore(key, productKey, qty){
  const def = companyDef(key), recipe = recipeByKey(productKey), p = companyProgress(key);
  if(!def || !recipe || !p || !Number.isInteger(qty) || qty <= 0) return 0;
  const b = BALANCE.delivery;
  const weight = Math.max(b.REPEAT_MIN_WEIGHT, 1 - (p.sent[productKey] || 0) / b.REPEAT_DECAY_UNITS);
  const fav = def.favorites.includes(productKey) ? b.FAVORITE_MULT : 1;
  return qty * recipe.sell * fav * weight;
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
  if(!wasRegular && isRegularTrade(key)) log(def.name + '과(와) 정기 거래를 시작합니다!');
  return gain;
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
  applyDelivery(key, order.product, order.qty);
  p.orderIndex += 1;
  permanent.totalPrestige += rep;
  permanent.reputationPoints += rep;
  log(def.name + '의 수주를 완수했습니다. 명성 +' + rep);
  if(!wasRegular && isRegularTrade(key)) log(def.name + '과(와) 정기 거래를 시작합니다!');
  if(companySlots() > slotsBefore) log('명성이 올라 새 회사와 거래할 수 있게 되었습니다.');
  return rep;
}
