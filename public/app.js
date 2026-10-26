/* Espetinho do Reinaldo - app.js atualizado
   Mantém catálogo, carrinho, envio e acompanhamento de pedidos.
   Salva o último número do pedido neste navegador e permite retomá-lo.
*/
'use strict';

let products = [];
let cart = [];
let deliveryFee = 0;
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
      }
    } catch (configError) {
      console.warn('Não foi possível carregar a taxa de entrega:', configError);
    }

    renderCats();
    renderProducts();
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

function renderProducts(category = '') {
  const box = $('products');
  if (!box) return;
  const list = category ? products.filter(product => product.category === category) : products;
  box.innerHTML = list.map(product => `
    <article class="card">
      <div class="photo">${product.image ? `<img src="${escAttr(product.image)}" alt="${escAttr(product.name)}" loading="lazy" onerror="this.style.display='none';this.parentElement.textContent='🍢'">` : '🍢'}</div>
      <h3>${esc(product.name)}</h3>
      <small>${esc(product.description || '')}</small>
      <strong>${money(product.price)}</strong>
      <button onclick="add(${Number(product.id)})">Adicionar</button>
    </article>
  `).join('') || '<p>Nenhum produto disponível nesta categoria.</p>';
}

function add(id) {
  const product = products.find(item => Number(item.id) === Number(id));
  if (!product) return;
  const index = cart.findIndex(item => Number(item.id) === Number(id));
  if (index >= 0) cart[index].qty++;
  else cart.push({id:Number(product.id), name:product.name, price:Number(product.price), qty:1});
  update();
  toast('Adicionado ao pedido');
}

function update() {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const type = $('type')?.value || 'balcao';
  const fee = type === 'entrega' ? deliveryFee : 0;
  const total = subtotal + fee;

  if ($('cartCount')) $('cartCount').textContent = cart.reduce((sum, item) => sum + item.qty, 0);
  if ($('cartItems')) {
    $('cartItems').innerHTML = cart.length ? cart.map(item => `
      <div class="line">
        <div><b>${esc(item.name)}</b><small>${money(item.price)} cada</small></div>
        <div><button onclick="chg(${item.id},-1)">−</button><span>${item.qty}</span><button onclick="chg(${item.id},1)">+</button></div>
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
function openCart() { $('cart')?.classList.remove('hidden'); update(); }
function closeCart() { $('cart')?.classList.add('hidden'); }

async function sendOrder() {
  if (!cart.length) return toast('Adicione algum produto');
  const name = $('name')?.value.trim() || '';
  if (!name) return toast('Informe seu nome');
  const type = $('type')?.value || 'balcao';
  const address = $('address')?.value || '';
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
    if (!response.ok) return toast(result.error || 'Não foi possível enviar o pedido');

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
