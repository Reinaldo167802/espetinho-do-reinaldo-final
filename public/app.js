/* Espetinho do Reinaldo - app.js corrigido
   Carrega produtos de /api/products e taxa de /api/config.
   Mantém carrinho, envio do pedido e acompanhamento de status.
*/
'use strict';

let products = [];
let cart = [];
let deliveryFee = 0;
let orderPollTimer = null;

const money = value => Number(value || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
const $ = id => document.getElementById(id);

async function load() {
  const productsBox = $('products');
  try {
    const productsResponse = await fetch('/api/products', {cache:'no-store'});
    if (!productsResponse.ok) throw new Error('A API de produtos respondeu HTTP ' + productsResponse.status);
    const productData = await productsResponse.json();
    products = Array.isArray(productData) ? productData : (Array.isArray(productData.products) ? productData.products : []);

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
  } catch (error) {
    console.error('Erro ao carregar o cardápio:', error);
    if (productsBox) productsBox.innerHTML = '<p>Não foi possível carregar os produtos. Atualize a página e tente novamente.</p>';
  }
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
      <div class="photo">${product.image ? `<img src="${escAttr(product.image)}" alt="${escAttr(product.name)}">` : '🍢'}</div>
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
    alert('Pedido enviado! Número do pedido: #' + orderId + '\nTotal: ' + money(result.total));
    if (orderId) showOrderStatus(orderId);
  } catch (error) {
    console.error('Erro ao enviar pedido:', error);
    toast('Falha de conexão ao enviar o pedido');
  }
}

function showOrderStatus(id) {
  let box = $('orderStatusBox');
  if (!box) {
    box = document.createElement('section');
    box.id = 'orderStatusBox';
    box.style.cssText = 'margin:18px auto;padding:16px;max-width:900px;background:#fff;border-radius:12px;box-shadow:0 2px 10px #0001;';
    const productsBox = $('products');
    if (productsBox?.parentNode) productsBox.parentNode.insertBefore(box, productsBox);
    else document.body.appendChild(box);
  }
  box.innerHTML = `<h2>Acompanhe seu pedido #${Number(id)}</h2><div id="orderStatusContent">Consultando status do pedido...</div>`;
  pollOrderStatus(id);
}

async function pollOrderStatus(id) {
  clearTimeout(orderPollTimer);
  const content = $('orderStatusContent');
  if (!content) return;
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
    if (data.status === 'cancelado') {
      content.textContent = 'Este pedido foi cancelado. Entre em contato com o estabelecimento se precisar de ajuda.';
      return;
    }
    const currentIndex = steps.findIndex(step => step[0] === data.status);
    content.innerHTML = steps.map((step, index) => `
      <div style="display:flex;align-items:center;gap:10px;margin:10px 0;opacity:${index <= currentIndex ? '1' : '.45'}">
        <span style="font-size:20px">${index <= currentIndex ? '✅' : '⚪'}</span><span>${esc(step[1])}</span>
      </div>
    `).join('');
    if (data.status !== 'finalizado') orderPollTimer = setTimeout(() => pollOrderStatus(id), 5000);
  } catch (error) {
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
