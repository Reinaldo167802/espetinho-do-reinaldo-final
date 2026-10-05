let products=[];let cart=[];let deliveryFee=0;
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const $=id=>document.getElementById(id);
async function load(){
 try{
  const prRes=await fetch('/api/products',{cache:'no-store'});
  if(!prRes.ok) throw new Error('Falha ao carregar produtos: '+prRes.status);
  const pr=await prRes.json();
  products=Array.isArray(pr)?pr:(Array.isArray(pr.products)?pr.products:[]);
  deliveryFee=0;
  try{
   const stRes=await fetch('/api/config',{cache:'no-store'});
   if(stRes.ok){
    const st=await stRes.json();
    deliveryFee=Number(st.delivery_fee||0);
   }
  }catch(_){deliveryFee=0;}
  renderCats();renderProducts();update();
 }catch(e){console.error(e);$('products').innerHTML='<p>Não foi possível carregar os produtos.</p>';}
}
function renderCats(){const cats=[...new Set(products.map(p=>p.category))];$('cats').innerHTML='<button class="cat active" onclick="filterCat(\'\')">Todos</button>'+cats.map(c=>`<button class="cat" onclick="filterCat('${esc(c)}')">${esc(c)}</button>`).join('');}
function filterCat(c){document.querySelectorAll('.cat').forEach(b=>b.classList.remove('active'));event?.currentTarget?.classList.add('active');renderProducts(c)}
function renderProducts(c=''){const list=c?products.filter(p=>p.category===c):products;$('products').innerHTML=list.map(p=>`<article class="card"><div class="photo">${p.image?`<img src="${escAttr(p.image)}" alt="${escAttr(p.name)}">`:'🍢'}</div><h3>${esc(p.name)}</h3><small>${esc(p.description||'')}</small><strong>${money(p.price)}</strong><button onclick="add(${p.id})">Adicionar</button></article>`).join('')||'<p>Nenhum produto disponível.</p>';}
function add(id){const p=products.find(x=>x.id===id),i=cart.findIndex(x=>x.id===id);if(!p)return;if(i>=0)cart[i].qty++;else cart.push({id:p.id,name:p.name,price:Number(p.price),qty:1});update();toast('Adicionado ao pedido');}
function update(){const subtotal=cart.reduce((s,x)=>s+x.price*x.qty,0);const type=$('type')?.value||'balcao';const fee=type==='entrega'?deliveryFee:0;const total=subtotal+fee;$('cartCount').textContent=cart.reduce((s,x)=>s+x.qty,0);$('cartItems').innerHTML=cart.length?cart.map(x=>`<div class="line"><div><b>${esc(x.name)}</b><small>${money(x.price)} cada</small></div><div><button onclick="chg(${x.id},-1)">−</button><span>${x.qty}</span><button onclick="chg(${x.id},1)">+</button></div></div>`).join(''):'<p>Seu carrinho está vazio.</p>';$('subtotal').textContent=money(subtotal);$('deliveryFee').textContent=money(fee);$('cartTotal').textContent=money(total);$('deliveryNote').textContent=type==='entrega'?(deliveryFee>0?`Taxa de entrega: ${money(deliveryFee)}`:'Taxa de entrega não configurada'):'Sem taxa de entrega';$('address').required=type==='entrega';$('address').style.display=type==='entrega'?'block':'none';}
function chg(id,n){const x=cart.find(x=>x.id===id);if(x){x.qty+=n;if(x.qty<=0)cart=cart.filter(y=>y.id!==id);}update();}
function openCart(){$('cart').classList.remove('hidden');update()}function closeCart(){$('cart').classList.add('hidden')}
async function sendOrder(){if(!cart.length)return toast('Adicione algum produto');const name=$('name').value.trim();if(!name)return toast('Informe seu nome');if($('type').value==='entrega'&&!$('address').value.trim())return toast('Informe o endereço para entrega');const body={customer_name:name,phone:$('phone').value,type:$('type').value,address:$('address').value,payment:$('payment').value,notes:$('notes').value,items:cart.map(x=>({product_id:x.id,qty:x.qty}))};const r=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)return toast(d.error||'Erro');cart=[];update();closeCart();alert('Pedido enviado! Número do pedido: #'+d.order_id+'\nSubtotal: '+money(d.subtotal)+'\nTaxa de entrega: '+money(d.delivery_fee)+'\nTOTAL: '+money(d.total));}
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1800)}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}function escAttr(s){return esc(s)}
$('cartBtn').onclick=openCart;$('type').onchange=update;load();