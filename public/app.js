let products=[];let cart=[];let deliveryFee=0;
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const $=id=>document.getElementById(id);
async function load(){
 try{const [pr,st]=await Promise.all([fetch('/api/products').then(r=>r.json()),fetch('/api/config').then(r=>r.json())]);products=pr;deliveryFee=Number(st.delivery_fee||st.taxa_entrega||0);renderCats();renderProducts();update();}catch(e){$('products').innerHTML='<p>Não foi possível carregar os produtos.</p>';}
}
function renderCats(){const cats=[...new Set(products.map(p=>p.category))];$('cats').innerHTML='<button class="cat active" onclick="filterCat(\'\')">Todos</button>'+cats.map(c=>`<button class="cat" onclick="filterCat('${esc(c)}')">${esc(c)}</button>`).join('');}
function filterCat(c){document.querySelectorAll('.cat').forEach(b=>b.classList.remove('active'));event?.currentTarget?.classList.add('active');renderProducts(c)}
function renderProducts(c=''){const list=c?products.filter(p=>p.category===c):products;$('products').innerHTML=list.map(p=>`<article class="card"><div class="photo">${p.image?`<img src="${escAttr(p.image)}" alt="${escAttr(p.name)}">`:'🍢'}</div><h3>${esc(p.name)}</h3><small>${esc(p.description||'')}</small><strong>${money(p.price)}</strong><button onclick="add(${p.id})">Adicionar</button></article>`).join('')||'<p>Nenhum produto disponível.</p>';}
function add(id){const p=products.find(x=>x.id===id),i=cart.findIndex(x=>x.id===id);if(!p)return;if(i>=0)cart[i].qty++;else cart.push({id:p.id,name:p.name,price:Number(p.price),qty:1});update();toast('Adicionado ao pedido');}
function update(){const subtotal=cart.reduce((s,x)=>s+x.price*x.qty,0);const type=$('type')?.value||'balcao';const fee=type==='entrega'?deliveryFee:0;const total=subtotal+fee;$('cartCount').textContent=cart.reduce((s,x)=>s+x.qty,0);$('cartItems').innerHTML=cart.length?cart.map(x=>`<div class="line"><div><b>${esc(x.name)}</b><small>${money(x.price)} cada</small></div><div><button onclick="chg(${x.id},-1)">−</button><span>${x.qty}</span><button onclick="chg(${x.id},1)">+</button></div></div>`).join(''):'<p>Seu carrinho está vazio.</p>';$('subtotal').textContent=money(subtotal);$('deliveryFee').textContent=money(fee);$('cartTotal').textContent=money(total);$('deliveryNote').textContent=type==='entrega'?(deliveryFee>0?`Taxa de entrega: ${money(deliveryFee)}`:'Taxa de entrega não configurada'):'Sem taxa de entrega';$('address').required=type==='entrega';$('address').style.display=type==='entrega'?'block':'none';}
function chg(id,n){const x=cart.find(x=>x.id===id);if(x){x.qty+=n;if(x.qty<=0)cart=cart.filter(y=>y.id!==id);}update();}
function openCart(){$('cart').classList.remove('hidden');update()}function closeCart(){$('cart').classList.add('hidden')}
async function sendOrder(){if(!cart.length)return toast('Adicione algum produto');const name=$('name').value.trim();if(!name)return toast('Informe seu nome');if($('type').value==='entrega'&&!$('address').value.trim())return toast('Informe o endereço para entrega');const body={customer_name:name,phone:$('phone').value,type:$('type').value,address:$('address').value,payment:$('payment').value,notes:$('notes').value,items:cart.map(x=>({product_id:x.id,qty:x.qty}))};const r=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)return toast(d.error||'Erro');cart=[];update();closeCart();showOrderStatus(d.order_id);}
function showOrderStatus(id){let box=document.getElementById('orderStatusBox');if(!box){box=document.createElement('div');box.id='orderStatusBox';box.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Arial,sans-serif';document.body.appendChild(box)}box.innerHTML='<div style="background:#fff;border-radius:18px;padding:22px;max-width:430px;width:100%;box-shadow:0 10px 35px rgba(0,0,0,.25)"><h2 style="margin:0 0 6px">Pedido #'+id+'</h2><p style="margin:0 0 16px;color:#666">Acompanhe o andamento do seu pedido</p><div id="orderStatusContent">Carregando...</div><button onclick="document.getElementById(\'orderStatusBox\').remove()" style="width:100%;margin-top:18px;padding:12px;border:0;border-radius:10px;background:#222;color:#fff;font-size:16px">Fechar</button></div>';pollOrderStatus(id)}
let orderPollTimer=null;
async function pollOrderStatus(id){
 clearTimeout(orderPollTimer);
 try{
  const r=await fetch('/api/orders/'+id); const d=await r.json();
  if(!r.ok) throw new Error(d.error||'Erro');
  const steps=[['novo','Pedido recebido'],['confirmado','Pedido confirmado'],['preparando','Preparando seu pedido'],['pronto','Pedido pronto'],['entregando','Saiu para entrega'],['finalizado','Pedido finalizado']];
  const idx=steps.findIndex(x=>x[0]===d.status); const content=document.getElementById('orderStatusContent');
  if(content){
   content.innerHTML=steps.map((x,i)=>'<div style="display:flex;align-items:center;gap:10px;margin:10px 0;opacity:'+(i<=idx?'1':'.35')+';font-weight:'+(i===idx?'700':'400')+'"><span style="width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:'+(i<=idx?'#2e7d32':'#ddd')+';color:#fff">'+(i<idx?'✓':(i===idx?'●':''))+'</span><span>'+x[1]+'</span></div>').join('')+'<hr><b>Total: '+money(d.total)+'</b>'+(d.status==='cancelado'?'<p style="color:#c62828;font-weight:bold">Pedido cancelado.</p>':'');
  }
  if(d.status!=='finalizado'&&d.status!=='cancelado') orderPollTimer=setTimeout(()=>pollOrderStatus(id),5000);
 }catch(e){
  const c=document.getElementById('orderStatusContent'); if(c)c.textContent='Não foi possível atualizar agora. Tentando novamente...';
  orderPollTimer=setTimeout(()=>pollOrderStatus(id),7000);
 }
}

load();
