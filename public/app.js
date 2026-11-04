/* Espetinho do Reinaldo - app.js atualizado
   Mantém catálogo, carrinho, envio e acompanhamento de pedidos.
   Salva o último número do pedido neste navegador e permite retomá-lo.
*/
'use strict';

let products = [];
let cart = [];
let deliveryFee = 0;
let sandwichPaused = false;
let sandwichLimit = 10;
let sandwichActiveOrders = 0;
let pauseTotal = false;
let pausePartial = false;
let pauseDelivery = false;
let pausePartialUntil = null;
let capacityRefreshTimer = null;
let currentCategory = '';
let orderPollTimer = null;
const LAST_ORDER_KEY = 'espetinhoReinaldoUltimoPedido';

const money = value => Number(value || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
const $ = id => document.getElementById(id);

async function load() {
  const productsBox = $('products');
  setupOrderTracking();
  try {
    const productsResponse = await fetch('/api/products', {cache:'no-store'});
    if (!productsResponse.ok) throw new Error('A API de produtos respondeu HTTP ' + productsResponse.status);
    const productData = await productsResponse.json();
    products = Array.isArray(productData) ? productData : (Array.isArray(productData.products) ? productData.products : []);
    products = products.map(product => ({...product, category: normalizeCustomerCategory(product.category, product.name, product.description)}));

    // A taxa é opcional: se a configuração falhar, o cardápio continua disponível.
    deliveryFee = 0;
    try {
      const configResponse = await fetch('/api/config', {cache:'no-store'});
      if (configResponse.ok) {
        const configData = await configResponse.json();
        deliveryFee = Number(configData.delivery_fee || 0);
        sandwichPaused = Boolean(configData.sandwich_paused);
        sandwichLimit = Number(configData.sandwich_limit || 10);
        sandwichActiveOrders = Number(configData.sandwich_active_orders || 0);
        pauseTotal = Boolean(configData.pause_total);
        pausePartial = Boolean(configData.pause_partial);
        pauseDelivery = Boolean(configData.pause_delivery);
        pausePartialUntil = configData.pause_partial_until || null;
      }
    } catch (configError) {
      console.warn('Não foi possível carregar a taxa de entrega:', configError);
    }

    renderCats();
    renderProducts();
    showOperationalNotice();
    startCapacityRefresh();
    update();
    resumeOrderTracking();
  } catch (error) {
    console.error('Erro ao carregar o cardápio:', error);
    if (productsBox) productsBox.innerHTML = '<p>Não foi possível carregar os produtos. Atualize a página e tente novamente.</p>';
    resumeOrderTracking();
  }
}

function goToProducts() {
  const target = $('cats') || $('products');
  if (target) target.scrollIntoView({behavior:'smooth', block:'start'});
}

function setupOrderTracking() {
  if ($('orderTrackingEntry')) return;

  const box = document.createElement('div');
  box.id = 'orderTrackingEntry';
  box.innerHTML = `
    <button id="openOrderTracking" type="button" class="tracking-compact-button">
      📦 Acompanhar meu pedido
    </button>
  `;

  const productsBox = $('products');
  const catsBox = $('cats');
  const anchor = catsBox || productsBox;
  if (anchor?.parentNode) anchor.parentNode.insertBefore(box, anchor);
  else document.body.appendChild(box);

  $('openOrderTracking').addEventListener('click', () => {
    const queryId = new URLSearchParams(window.location.search).get('pedido');
    const savedId = getSavedOrderId();
    const id = queryId || savedId;
    if (id && /^\d+$/.test(String(id)) && Number(id) > 0) {
      showOrderStatus(id);
    } else {
      toast('Você ainda não tem pedido salvo neste navegador. Após fazer um pedido, poderá acompanhá-lo aqui.');
    }
  });
}
function getSavedOrderId() {
  try { return localStorage.getItem(LAST_ORDER_KEY) || ''; }
  catch (_) { return ''; }
}
function saveOrderId(id) {
  try { localStorage.setItem(LAST_ORDER_KEY, String(id)); }
  catch (error) { console.warn('Não foi possível salvar o pedido neste navegador:', error); }
}
function resumeOrderTracking() {
  const queryId = new URLSearchParams(window.location.search).get('pedido');
  const savedId = getSavedOrderId();
  const id = queryId || savedId;
  if (!id || !/^\d+$/.test(String(id)) || Number(id) < 1) return;
  if ($('trackOrderNumber')) $('trackOrderNumber').value = String(id);
  showOrderStatus(id, false);
}

function normalizeCustomerCategory(category, name = '', description = '') {
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const c = norm(category), n = norm(name), d = norm(description), all = `${c} ${n} ${d}`;
  if (/\b(chips|batata chips|salgadinho|salgadinhos|snack|snacks|doritos|cheetos|ruffles|fandangos|pringles|torcida|baconzitos|pipoca pronta)\b/.test(all) || c === 'outros') return 'Salgadinhos Chips';
  if (/\b(trident|chiclete|chicletes|goma de mascar|pastilha|pastilhas|bala|balas|bombom|bombons|chocolate|chocolates|jujuba|jujubas|trento|pacoca|guloseima|guloseimas|doces|bomboniere)\b/.test(all)) return 'Guloseimas';
  if (/\b(espetinho|espetinhos)\b/.test(all)) return 'Espetinhos';
  if (/\b(hamburguer|hamburgueres|x tudo|sanduiche|sanduiches|lanche|lanches)\b/.test(all)) return 'Hambúrgueres e Sanduíches';
  if (/\b(porcao|porcoes|tilapia|frango a passarinho|copa lombo|costelinha|moela|dobradinha|caldo|canjiquinha|vaca atolada|rabinho|sua)\b/.test(all)) return 'Porções';
  if (/\b(acai|sorvete|picole|cascao|casquinha)\b/.test(all)) return 'Açaí e Sorvetes';
  if (/\b(pastel|salgado|salgados|coxinha|empada|quibe|esfiha)\b/.test(all)) return 'Salgados e Pastéis';
  if (/\b(bebida|bebidas|refrigerante|cerveja|brahma|suco|agua|energetico|destilado|destilados)\b/.test(all)) return 'Bebidas';
  const cats = {'espetinhos':'Espetinhos','hamburgueres':'Hambúrgueres e Sanduíches','sanduiches':'Hambúrgueres e Sanduíches','lanches':'Hambúrgueres e Sanduíches','porcoes':'Porções','bebidas':'Bebidas','acai':'Açaí e Sorvetes','sorvetes':'Açaí e Sorvetes','salgados':'Salgados e Pastéis','pastel':'Salgados e Pastéis','guloseimas':'Guloseimas','salgadinhos chips':'Salgadinhos Chips'};
  return cats[c] || (category && String(category).trim() ? String(category).trim() : 'Guloseimas');
}

function renderCats() {
  const box = $('cats');
  if (!box) return;
  const categories = [...new Set(products.map(product => product.category || 'Outros'))];
  box.innerHTML = '<button class="cat active" onclick="filterCat(\'\')">Todos</button>' +
    categories.map(category => `<button class="cat" onclick="filterCat('${escAttr(category)}')">${esc(category)}</button>`).join('');
}

function filterCat(category) {
  document.querySelectorAll('.cat').forEach(button => button.classList.remove('active'));
  if (typeof event !== 'undefined' && event && event.currentTarget) event.currentTarget.classList.add('active');
  renderProducts(category);
}

function isSandwichItem(item) {
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const category = norm(item?.category || '');
  const name = norm(item?.name || '');
  return /hamburg|sanduich|sanduiche|lanches|lanche/.test(category) || /hamburg|burguer|burger|sanduich|sanduiche|x\s*[- ]?tudo|x\s*[- ]?salada/.test(name);
}
function showOperationalNotice() {
  const anchor = $('products');
  if (!anchor) return;
  let notice = $('operationalPauseNotice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'operationalPauseNotice';
    notice.style.cssText = 'display:none;margin:12px 0;padding:14px 16px;border:1px solid #b45309;border-radius:10px;background:#fff7ed;color:#7c2d12;font-weight:700;line-height:1.5';
    anchor.parentNode.insertBefore(notice, anchor);
  }
  const active = pauseTotal || pausePartial;
  notice.style.display = active ? 'block' : 'none';
  notice.textContent = pauseTotal
    ? '⏸️ Estamos temporariamente sem receber pedidos pelo site. O cardápio continua disponível para consulta.'
    : pausePartial
      ? '⏸️ Estamos em uma pausa temporária de produção. Em breve voltaremos a receber pedidos.'
      : '';
  const submit = $('sendOrderBtn') || $('sendOrder');
  if (submit) {
    submit.disabled = active;
    submit.setAttribute('aria-disabled', active ? 'true' : 'false');
    submit.textContent = active ? 'Pedidos temporariamente pausados' : 'ENVIAR PEDIDO';
  }
}
function showSandwichCapacityNotice() {
  const productsBox = $('products');
  if (!productsBox) return;
  let notice = $('sandwichCapacityNotice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'sandwichCapacityNotice';
    notice.style.cssText = 'display:none;margin:12px 0;padding:12px 14px;border:1px solid #d9a441;border-radius:10px;background:#fff5dc;color:#593b0b;font-weight:600;line-height:1.4';
    productsBox.parentNode.insertBefore(notice, productsBox);
  }
  notice.style.display = sandwichPaused ? 'block' : 'none';
  notice.textContent = sandwichPaused
    ? `No momento atingimos nossa capacidade de produção de sanduíches (${sandwichActiveOrders}/${sandwichLimit} pedidos em andamento). Os sanduíches estão temporariamente indisponíveis. Os demais produtos continuam disponíveis.`
    : '';
}
async function refreshSandwichCapacity() {
  try {
    const response = await fetch('/api/config', {cache:'no-store'});
    if (!response.ok) return;
    const data = await response.json();
    const wasPaused = sandwichPaused;
    const wasTotal = pauseTotal;
    const wasPartial = pausePartial;
    const wasDelivery = pauseDelivery;
    sandwichPaused = Boolean(data.sandwich_paused);
    sandwichLimit = Number(data.sandwich_limit || 10);
    sandwichActiveOrders = Number(data.sandwich_active_orders || 0);
    pauseTotal = Boolean(data.pause_total);
    pausePartial = Boolean(data.pause_partial);
    pauseDelivery = Boolean(data.pause_delivery);
    pausePartialUntil = data.pause_partial_until || null;
    showOperationalNotice();
    showSandwichCapacityNotice();
    if (wasPaused !== sandwichPaused || wasTotal !== pauseTotal || wasPartial !== pausePartial || wasDelivery !== pauseDelivery) { renderProducts(currentCategory); update(); }
  } catch (error) {
    console.warn('Não foi possível atualizar a capacidade de sanduíches:', error);
  }
}
function startCapacityRefresh() {
  if (capacityRefreshTimer) clearInterval(capacityRefreshTimer);
  capacityRefreshTimer = setInterval(refreshSandwichCapacity, 12000);
}

function renderProducts(category = '') {
  currentCategory = category;
  const box = $('products');
  showSandwichCapacityNotice();
  showOperationalNotice();
  if (!box) return;
  const list = category ? products.filter(product => product.category === category) : products;
  box.innerHTML = list.map(product => `
    <article class="card">
      <div class="photo">${product.image ? `<img src="${escAttr(product.image)}" alt="${escAttr(product.name)}" loading="lazy" onerror="this.style.display='none';this.parentElement.textContent='🍢'">` : '🍢'}</div>
      <h3>${esc(product.name)}</h3>
      <small>${esc(product.description || '')}</small>
      <strong>${money(product.price)}</strong>
      <button ${(pauseTotal || pausePartial || (sandwichPaused && isSandwichItem(product))) ? 'disabled aria-disabled="true"' : ''} onclick="add(${Number(product.id)})">${(pauseTotal || pausePartial) ? 'Pedidos pausados' : (sandwichPaused && isSandwichItem(product) ? 'Temporariamente indisponível' : 'Adicionar')}</button>
    </article>
  `).join('') || '<p>Nenhum produto disponível nesta categoria.</p>';
}

function add(id) {
  const product = products.find(item => Number(item.id) === Number(id));
  if (!product) return;
  if (pauseTotal || pausePartial) return toast('O recebimento de pedidos está temporariamente pausado.');
  if (sandwichPaused && isSandwichItem(product)) return toast('Os sanduíches estão temporariamente pausados.');
  const index = cart.findIndex(item => Number(item.id) === Number(id));
  if (index >= 0) cart[index].qty++;
  else cart.push({id:Number(product.id), name:product.name, category:product.category, price:Number(product.price), qty:1});
  update();
  toast('Adicionado ao pedido');
}

function update() {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const typeSelect = $('type');
  const deliveryOption = typeSelect ? Array.from(typeSelect.options).find(option => option.value === 'entrega') : null;
  if (deliveryOption) {
    deliveryOption.disabled = pauseDelivery;
    if (pauseDelivery && typeSelect.value === 'entrega') typeSelect.value = 'balcao';
  }
  const type = $('type')?.value || 'balcao';
  const fee = type === 'entrega' ? deliveryFee : 0;
  const total = subtotal + fee;

  if ($('cartCount')) $('cartCount').textContent = cart.reduce((sum, item) => sum + item.qty, 0);
  if ($('cartItems')) {
    $('cartItems').innerHTML = cart.length ? cart.map(item => `
      <div class="line cart-line">
        <div class="cart-line-info"><b>${esc(item.name)}</b><small>${money(item.price)} cada · Total ${money(item.price * item.qty)}</small></div>
        <div class="cart-line-actions"><button type="button" aria-label="Diminuir quantidade" onclick="chg(${item.id},-1)">−</button><strong>${item.qty}</strong><button type="button" aria-label="Aumentar quantidade" onclick="chg(${item.id},1)">+</button><button type="button" class="cart-remove" aria-label="Excluir produto" title="Excluir produto" onclick="removeCartItem(${item.id})">🗑️</button></div>
      </div>
    `).join('') : '<p>Seu carrinho está vazio.</p>';
  }
  if ($('subtotal')) $('subtotal').textContent = money(subtotal);
  if ($('deliveryFee')) $('deliveryFee').textContent = money(fee);
  if ($('cartTotal')) $('cartTotal').textContent = money(total);
  if ($('deliveryNote')) $('deliveryNote').textContent = type === 'entrega'
    ? (deliveryFee > 0 ? `Taxa de entrega: ${money(deliveryFee)}` : 'Taxa de entrega não configurada')
    : 'Sem taxa de entrega';
  if ($('address')) {
    $('address').required = type === 'entrega';
    $('address').style.display = type === 'entrega' ? 'block' : 'none';
  }
}

function chg(id, amount) {
  const item = cart.find(entry => Number(entry.id) === Number(id));
  if (!item) return;
  item.qty += amount;
  if (item.qty <= 0) cart = cart.filter(entry => Number(entry.id) !== Number(id));
  update();
}
function removeCartItem(id) {
  const item = cart.find(entry => Number(entry.id) === Number(id));
  if (!item) return;
  if (!confirm(`Excluir ${item.name} do seu pedido?`)) return;
  cart = cart.filter(entry => Number(entry.id) !== Number(id));
  update();
}
function openCart() { $('cart')?.classList.remove('hidden'); update(); }
function closeCart() { $('cart')?.classList.add('hidden'); }

function sendOrder() {
  if (pauseTotal || pausePartial) return toast('O recebimento de pedidos está temporariamente pausado.');
  if (!cart.length) return toast('Adicione algum produto');
  const name = $('name')?.value.trim() || '';
  if (!name) return toast('Informe seu nome');
  const type = $('type')?.value || 'balcao';
  const address = $('address')?.value || '';
  if (type === 'entrega' && pauseDelivery) return toast('No momento estamos sem serviço de entrega. Escolha retirada no balcão.');
  if (type === 'entrega' && !address.trim()) return toast('Informe o endereço para entrega');
  openOrderReview();
}

function ensureOrderReviewStyles() {
  if ($('orderReviewStyles')) return;
  const style = document.createElement('style');
  style.id = 'orderReviewStyles';
  style.textContent = `
    .order-review-overlay{position:fixed;inset:0;z-index:10000;background:rgba(5,9,20,.82);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(5px)}
    .order-review-panel{width:min(100%,980px);max-height:94vh;overflow:auto;background:#101827;color:#f8fafc;border:1px solid rgba(218,181,91,.55);border-radius:22px;box-shadow:0 24px 80px #0009;padding:clamp(18px,3vw,32px)}
    .order-review-head{display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:1px solid #ffffff24;padding-bottom:16px;margin-bottom:18px}
    .order-review-head h2{margin:0;color:#e7c778;font-size:clamp(1.5rem,3vw,2.1rem)}.order-review-head p{margin:5px 0 0;color:#cbd5e1}
    .order-review-items{display:grid;gap:10px}.order-review-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;background:#1c2b43;border:1px solid #ffffff20;border-radius:14px;padding:15px}
    .order-review-item-name{font-size:1.12rem;font-weight:800;overflow-wrap:anywhere}.order-review-item-price{color:#d8e1ef;margin-top:5px;font-size:.95rem}
    .order-review-controls{display:flex;align-items:center;gap:8px}.order-review-controls button{min-width:38px;min-height:38px;border:0;border-radius:9px;font-size:1.1rem;font-weight:800;cursor:pointer}.order-review-controls strong{min-width:22px;text-align:center}.order-review-controls .remove{background:#b91c1c;color:white}
    .order-review-summary{margin-top:16px;padding:17px;background:#172338;border:1px solid #ffffff26;border-radius:14px}.order-review-summary div{display:flex;justify-content:space-between;gap:16px;padding:5px 0;color:#dbe4f0}.order-review-summary .grand{margin-top:8px;padding-top:12px;border-top:1px solid #ffffff35;color:#f3d58c;font-size:1.35rem;font-weight:900}
    .order-review-customer{margin-top:17px}.order-review-customer h3{margin:0 0 10px;color:#e7c778}.order-review-data{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.order-review-data div{background:#1c2b43;border-radius:10px;padding:10px 12px;min-width:0;overflow-wrap:anywhere}.order-review-data small{display:block;color:#aebdd0;margin-bottom:4px}.order-review-data b{font-size:.96rem}
    .order-review-buttons{display:flex;gap:12px;margin-top:20px}.order-review-buttons button{flex:1;min-height:48px;border:0;border-radius:12px;font-weight:900;cursor:pointer;padding:12px}.order-review-back{background:#334155;color:#fff}.order-review-confirm{background:linear-gradient(135deg,#c89d43,#f0d58b);color:#20180a}
    @media(max-width:600px){.order-review-overlay{padding:7px;align-items:flex-end}.order-review-panel{max-height:96vh;border-radius:18px 18px 12px 12px;padding:15px}.order-review-item{grid-template-columns:1fr}.order-review-controls{justify-content:flex-end}.order-review-data{grid-template-columns:1fr}.order-review-buttons{flex-direction:column}}
  `;
  document.head.appendChild(style);
}
function openOrderReview() {
  ensureOrderReviewStyles();
  let overlay = $('orderReviewOverlay');
  if (!overlay) { overlay = document.createElement('div'); overlay.id = 'orderReviewOverlay'; overlay.className = 'order-review-overlay'; document.body.appendChild(overlay); }
  const type = $('type')?.value || 'balcao';
  const subtotal = cart.reduce((sum,item)=>sum+Number(item.price)*Number(item.qty),0);
  const fee = type === 'entrega' ? deliveryFee : 0;
  const paymentLabels = {pix:'Pix',dinheiro:'Dinheiro',debito:'Cartão de débito',credito:'Cartão de crédito',fiado:'Fiado / promissória'};
  const typeLabels = {balcao:'Retirar no balcão',mesa:'Consumir no local',entrega:'Entrega'};
  overlay.innerHTML = `<section class="order-review-panel" role="dialog" aria-modal="true" aria-labelledby="orderReviewTitle">
    <header class="order-review-head"><div><h2 id="orderReviewTitle">Confira seu pedido</h2><p>Revise os produtos e os dados antes de enviar.</p></div><button type="button" aria-label="Fechar" onclick="closeOrderReview()">✕</button></header>
    <div class="order-review-items">${cart.map(item=>`<article class="order-review-item"><div><div class="order-review-item-name">${esc(item.name)}</div><div class="order-review-item-price">${item.qty} × ${money(item.price)} = <b>${money(item.qty*item.price)}</b></div></div><div class="order-review-controls"><button type="button" onclick="changeReviewQty(${item.id},-1)">−</button><strong>${item.qty}</strong><button type="button" onclick="changeReviewQty(${item.id},1)">+</button><button type="button" class="remove" title="Excluir" onclick="removeReviewItem(${item.id})">🗑️</button></div></article>`).join('')}</div>
    <section class="order-review-summary"><div><span>Subtotal</span><b>${money(subtotal)}</b></div><div><span>Taxa de entrega</span><b>${money(fee)}</b></div><div class="grand"><span>TOTAL</span><strong>${money(subtotal+fee)}</strong></div></section>
    <section class="order-review-customer"><h3>Dados para o atendimento</h3><div class="order-review-data"><div><small>Nome</small><b>${esc($('name')?.value||'-')}</b></div><div><small>WhatsApp</small><b>${esc($('phone')?.value||'Não informado')}</b></div><div><small>Atendimento</small><b>${esc(typeLabels[type]||type)}</b></div><div><small>Pagamento</small><b>${esc(paymentLabels[$('payment')?.value]||$('payment')?.value||'-')}</b></div>${type==='entrega'?`<div style="grid-column:1/-1"><small>Endereço</small><b>${esc($('address')?.value||'-')}</b></div>`:''}${$('notes')?.value.trim()?`<div style="grid-column:1/-1"><small>Observações</small><b>${esc($('notes').value)}</b></div>`:''}</div></section>
    <div class="order-review-buttons"><button type="button" class="order-review-back" onclick="closeOrderReview()">VOLTAR E EDITAR</button><button type="button" class="order-review-confirm" onclick="submitReviewedOrder()">CONFIRMAR E ENVIAR PEDIDO</button></div>
  </section>`;
  overlay.style.display='flex';
}
function closeOrderReview(){const overlay=$('orderReviewOverlay');if(overlay)overlay.style.display='none';}
function changeReviewQty(id,delta){chg(id,delta);if(!cart.length){closeOrderReview();toast('Seu carrinho está vazio.');return;}openOrderReview();}
function removeReviewItem(id){const item=cart.find(x=>Number(x.id)===Number(id));if(!item)return;cart=cart.filter(x=>Number(x.id)!==Number(id));update();if(!cart.length){closeOrderReview();toast('Seu carrinho está vazio.');return;}openOrderReview();}
async function submitReviewedOrder() {
  closeOrderReview();
  if (pauseTotal || pausePartial) return toast('O recebimento de pedidos está temporariamente pausado.');
  if (!cart.length) return toast('Adicione algum produto');
  const name = $('name')?.value.trim() || '';
  if (!name) return toast('Informe seu nome');
  const type = $('type')?.value || 'balcao';
  const address = $('address')?.value || '';
  if (type === 'entrega' && pauseDelivery) return toast('No momento estamos sem serviço de entrega. Escolha retirada no balcão.');
  if (type === 'entrega' && !address.trim()) return toast('Informe o endereço para entrega');

  const body = {
    customer_name:name,
    phone:$('phone')?.value || '',
    type,
    address,
    payment:$('payment')?.value || '',
    notes:$('notes')?.value || '',
    items:cart.map(item => ({product_id:item.id, qty:item.qty}))
  };

  try {
    const response = await fetch('/api/orders', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 423) {
        pauseTotal = Boolean(result.pause_total);
        pausePartial = Boolean(result.pause_partial);
        pauseDelivery = Boolean(result.pause_delivery);
        showOperationalNotice();
        renderProducts(currentCategory);
        update();
        return toast(result.error || 'Pedidos temporariamente indisponíveis.');
      }
      if (response.status === 409 && result.sandwich_paused) {
        sandwichPaused = true;
        sandwichLimit = Number(result.sandwich_limit || sandwichLimit);
        sandwichActiveOrders = Number(result.sandwich_active_orders || sandwichActiveOrders);
        cart = cart.filter(item => !isSandwichItem(item));
        renderProducts(currentCategory);
        update();
        if (cart.length) return toast('Os sanduíches foram pausados e retirados do carrinho. Os demais produtos continuam no pedido.');
      }
      return toast(result.error || 'Não foi possível enviar o pedido');
    }

    cart = [];
    update();
    closeCart();
    const orderId = result.order_id || result.id;
    if (orderId) saveOrderId(orderId);
    const paymentMethod = body.payment;
    if (paymentMethod === 'pix') {
      showPixPayment(orderId, result.total);
    } else {
      alert('Pedido enviado! Número do pedido: #' + orderId + '\nTotal: ' + money(result.total));
    }
    if (orderId) showOrderStatus(orderId);
  } catch (error) {
    console.error('Erro ao enviar pedido:', error);
    toast('Falha de conexão ao enviar o pedido');
  }
}


function pixTlv(id, value) {
  const text = String(value);
  return id + String(text.length).padStart(2, '0') + text;
}

function pixCrc16(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function buildPixPayload(total, orderId) {
  // Pix key registered in the store: CNPJ 48.508.407/0001-50.
  const pixKey = '48508407000150';
  const merchantName = 'ESPETINHO DO REINALDO';
  const merchantCity = 'MARIANA';
  const amount = Number(total);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Valor do pedido inválido para Pix.');

  const merchantAccount = pixTlv('00', 'br.gov.bcb.pix') + pixTlv('01', pixKey);
  const txid = ('PEDIDO' + String(orderId || 'NOVO')).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  let payload = pixTlv('00', '01')
    + pixTlv('01', '12')
    + pixTlv('26', merchantAccount)
    + pixTlv('52', '0000')
    + pixTlv('53', '986')
    + pixTlv('54', amount.toFixed(2))
    + pixTlv('58', 'BR')
    + pixTlv('59', merchantName)
    + pixTlv('60', merchantCity)
    + pixTlv('62', pixTlv('05', txid))
    + '6304';
  payload += pixCrc16(payload);
  return payload;
}

function showPixPayment(orderId, total) {
  const pixKey = '48.508.407/0001-50';
  const whatsappNumber = '31995770730';
  let pixPayload = '';
  try {
    pixPayload = buildPixPayload(total, orderId);
  } catch (error) {
    console.error('Não foi possível montar o Pix:', error);
  }

  let modal = document.getElementById('pixPaymentModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pixPaymentModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0009;display:flex;align-items:center;justify-content:center;padding:18px;overflow-y:auto;';
    modal.innerHTML = `<section style="background:#fff;color:#222;border-radius:16px;padding:22px;max-width:440px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 12px 40px #0004;font-family:Arial,sans-serif;text-align:center"><h2 style="margin-top:0">Pedido recebido!</h2><p id="pixOrderInfo"></p><p><b>Pagamento por Pix</b></p><p style="margin-bottom:8px">Escaneie o QR Code com o aplicativo do seu banco:</p><div id="pixQrCode" style="display:flex;justify-content:center;align-items:center;min-height:220px;margin:10px auto;background:#fff"></div><p id="pixQrFallback" style="display:none;font-size:13px;color:#9b1c1c">Não foi possível carregar o QR Code. Use o código Pix copia e cola abaixo ou copie a chave.</p><button id="copyPixPayload" type="button" style="width:100%;padding:12px;margin-top:8px;border:0;border-radius:8px;background:#6f42c1;color:white;font-weight:bold;cursor:pointer">Copiar Pix copia e cola</button><p style="margin-bottom:6px">Ou use a chave Pix (CNPJ):</p><div id="pixKeyText" style="font-size:18px;font-weight:bold;overflow-wrap:anywhere;background:#f3f3f3;padding:12px;border-radius:8px"></div><button id="copyPixKey" type="button" style="width:100%;padding:12px;margin-top:8px;border:0;border-radius:8px;background:#198754;color:white;font-weight:bold;cursor:pointer">Copiar chave Pix</button><a id="sendPixReceipt" href="#" target="_blank" rel="noopener" style="display:block;box-sizing:border-box;width:100%;padding:13px;margin-top:14px;border-radius:8px;background:#128c7e;color:white;font-weight:bold;text-decoration:none">Já paguei — enviar comprovante pelo WhatsApp</a><p style="font-size:13px;line-height:1.4;text-align:left">Confira o recebedor e o valor no aplicativo do banco antes de pagar. Depois, envie o comprovante pelo WhatsApp. O comprovante não confirma sozinho o recebimento; o estabelecimento verificará o pagamento na conta antes de marcar o pedido como pago.</p><button id="closePixModal" type="button" style="width:100%;padding:11px;border:1px solid #ccc;border-radius:8px;background:white;cursor:pointer">Fechar</button></section>`;
    document.body.appendChild(modal);
    modal.querySelector('#copyPixKey').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pixKey);
        modal.querySelector('#copyPixKey').textContent = 'Chave copiada!';
      } catch (_) {
        window.prompt('Copie sua chave Pix:', pixKey);
      }
    });
    modal.querySelector('#copyPixPayload').addEventListener('click', async () => {
      const payload = modal.dataset.pixPayload || '';
      if (!payload) return window.alert('O código Pix não foi gerado. Use a chave Pix abaixo.');
      try {
        await navigator.clipboard.writeText(payload);
        modal.querySelector('#copyPixPayload').textContent = 'Pix copia e cola copiado!';
      } catch (_) {
        window.prompt('Copie o código Pix copia e cola:', payload);
      }
    });
    modal.querySelector('#closePixModal').addEventListener('click', () => modal.remove());
  }

  modal.querySelector('#pixOrderInfo').textContent = `Pedido #${orderId || '—'} · Total: ${money(total)}`;
  modal.querySelector('#pixKeyText').textContent = pixKey;
  modal.querySelector('#copyPixKey').textContent = 'Copiar chave Pix';
  modal.querySelector('#copyPixPayload').textContent = 'Copiar Pix copia e cola';
  modal.dataset.pixPayload = pixPayload;
  const message = `Olá! Fiz o pedido #${orderId || '—'} no Espetinho do Reinaldo, no valor de ${money(total)}. Estou enviando o comprovante Pix para conferência.`;
  modal.querySelector('#sendPixReceipt').href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

  const qrContainer = modal.querySelector('#pixQrCode');
  qrContainer.innerHTML = '';
  modal.querySelector('#pixQrFallback').style.display = 'none';
  if (pixPayload && window.QRCode) {
    try {
      new QRCode(qrContainer, { text: pixPayload, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
    } catch (error) {
      console.error('Erro ao gerar QR Code Pix:', error);
      modal.querySelector('#pixQrFallback').style.display = 'block';
    }
  } else {
    modal.querySelector('#pixQrFallback').style.display = 'block';
  }
}

function closeOrderTracking() {
  clearTimeout(orderPollTimer);
  const modal = $('orderStatusBox');
  if (modal) modal.remove();
}

function showOrderStatus(id, updateAddress = true) {
  const safeId = String(id || '').trim();
  if (!/^\d+$/.test(safeId) || Number(safeId) < 1) return toast('Número do pedido inválido');
  saveOrderId(safeId);
  if ($('trackOrderNumber')) $('trackOrderNumber').value = safeId;
  if (updateAddress) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('pedido', safeId);
      window.history.replaceState({}, '', url);
    } catch (_) {}
  }
  closeOrderTracking();
  const modal = document.createElement('div');
  modal.id = 'orderStatusBox';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Acompanhamento do pedido ' + safeId);
  modal.dataset.orderId = safeId;
  modal.style.cssText = 'position:fixed;inset:0;z-index:9998;background:#0009;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;';
  modal.innerHTML = `<section style="background:#fff;color:#222;border-radius:16px;padding:18px;width:100%;max-width:430px;max-height:90vh;overflow-y:auto;box-sizing:border-box;box-shadow:0 12px 40px #0004;font-family:Arial,sans-serif"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><h2 style="font-size:20px;margin:0">🛍️ Pedido #${Number(safeId)}</h2><button id="closeOrderTracking" type="button" aria-label="Fechar acompanhamento" style="border:0;background:#f1f1f1;border-radius:8px;padding:9px 12px;cursor:pointer;font-size:18px">✕</button></div><div id="orderStatusContent" style="margin-top:12px">Consultando pedido...</div><button id="closeOrderTrackingBottom" type="button" style="width:100%;margin-top:14px;padding:12px;border:1px solid #ddd;border-radius:9px;background:#f7f7f7;cursor:pointer">Fechar</button></section>`;
  document.body.appendChild(modal);
  modal.querySelector('#closeOrderTracking').onclick = closeOrderTracking;
  modal.querySelector('#closeOrderTrackingBottom').onclick = closeOrderTracking;
  modal.addEventListener('click', event => { if (event.target === modal) closeOrderTracking(); });
  pollOrderStatus(safeId);
}

async function pollOrderStatus(id) {
  clearTimeout(orderPollTimer);
  const modal = $('orderStatusBox');
  const content = $('orderStatusContent');
  if (!modal || !content || modal.dataset.orderId !== String(id)) return;
  const steps = [
    ['novo','Pedido recebido'],
    ['confirmado','Pedido confirmado'],
    ['preparando','Preparando seu pedido'],
    ['pronto','Pedido pronto'],
    ['entregando','Saiu para entrega'],
    ['finalizado','Pedido finalizado']
  ];
  try {
    const response = await fetch('/api/orders/' + encodeURIComponent(id), {cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o pedido');
    if ($('orderStatusBox') !== modal) return;
    const items = Array.isArray(data.items) ? data.items : [];
    const paymentLabels = {pix:'Pix',dinheiro:'Dinheiro',debito:'Cartão de débito',credito:'Cartão de crédito',fiado:'Fiado / Promissória'};
    const payment = paymentLabels[String(data.payment||'').toLowerCase()] || String(data.payment||'Não informado');
    const subtotal = Number(data.subtotal || 0);
    const fee = Number(data.delivery_fee || 0);
    const summary = `<div style="background:#f8f8fa;border-radius:10px;padding:12px;margin-bottom:14px"><h3 style="font-size:16px;margin:0 0 10px">Resumo da compra</h3>${items.length ? items.map(item=>`<div style="display:flex;justify-content:space-between;gap:10px;margin:7px 0;font-size:14px"><span>${esc(item.name)} <b>× ${esc(item.qty)}</b></span><span style="white-space:nowrap">${money(item.total)}</span></div>`).join('') : '<p>Itens não disponíveis.</p>'}<hr style="border:0;border-top:1px solid #ddd"><div style="display:flex;justify-content:space-between;margin:6px 0"><span>Subtotal</span><b>${money(subtotal)}</b></div><div style="display:flex;justify-content:space-between;margin:6px 0"><span>Taxa de entrega</span><b>${money(fee)}</b></div><div style="display:flex;justify-content:space-between;margin:9px 0;font-size:17px"><b>Total</b><b>${money(data.total)}</b></div><div style="font-size:13px;margin-top:8px">Pagamento: <b>${esc(payment)}</b></div></div>`;
    if (data.status === 'cancelado') {
      content.innerHTML = summary + '<p>Este pedido foi cancelado. Entre em contato com o estabelecimento se precisar de ajuda.</p>';
      return;
    }
    const currentIndex = steps.findIndex(step => step[0] === data.status);
    content.innerHTML = summary + '<h3 style="font-size:16px;margin:0 0 8px">Acompanhe seu pedido</h3>' + steps.map((step, index) => `
      <div style="display:flex;align-items:center;gap:10px;margin:9px 0;opacity:${index <= currentIndex ? '1' : '.45'}">
        <span style="font-size:19px">${index <= currentIndex ? '✅' : '⚪'}</span><span>${esc(step[1])}</span>
      </div>
    `).join('');
    if (data.status !== 'finalizado') orderPollTimer = setTimeout(() => pollOrderStatus(id), 5000);
  } catch (error) {
    if ($('orderStatusBox') !== modal) return;
    console.warn('Não foi possível atualizar o status do pedido:', error);
    content.textContent = 'Não foi possível atualizar agora. Tentaremos novamente.';
    orderPollTimer = setTimeout(() => pollOrderStatus(id), 7000);
  }
}

function toast(message) {
  const element = $('toast');
  if (!element) { alert(message); return; }
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 1800);
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));
}
function escAttr(value) { return esc(value); }

if ($('cartBtn')) $('cartBtn').onclick = openCart;
if ($('type')) $('type').onchange = update;
load();
