let pass='';let editingId=null;let editingSaleOptions=[];let xmlReturnLine=null;let xmlPackContext=null;let xmlProductHistoryStep=false;let returningToXml=false;
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const toNumber=v=>{if(v===undefined||v===null||String(v).trim()==='')return 0;const s=String(v).trim().replace(/\s/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)?n:NaN};
const $=id=>document.getElementById(id);
const api=async(url,opt={})=>{opt.headers={...(opt.headers||{}),'x-admin-password':pass,'Content-Type':'application/json'};const r=await fetch(url,opt);const raw=await r.text();let d;try{d=JSON.parse(raw)}catch(_){throw Error('O servidor respondeu uma página HTML em vez de JSON. Confira a implantação do sistema.')}if(!r.ok)throw Error(d.error||d.message||'Erro');return d};
function login(){const pw=$('pw');pass=pw.value.trim();if(!pass){alert('Digite a senha administrativa.');return}api('/api/admin/orders').then(()=>{$('login').style.display='none';$('app').style.display='block';history.replaceState({adminPanel:true,tab:'orders'},'',location.href);history.pushState({adminPanel:true,tab:'orders'},'',location.href);activeAdminTab='orders';loadAll()}).catch(err=>alert('Erro ao entrar: '+err.message));}
let activeAdminTab='orders',restoringAdminHistory=false;
function tab(id){if(!restoringAdminHistory&&pass&&id!==activeAdminTab){history.pushState({adminPanel:true,tab:id},'',location.href);}activeAdminTab=id;['orders','products','purchases','suppliers','cash','commands','customers','fiado','settings'].forEach(x=>{if($(x))$(x).style.display=x===id?'block':'none'});if(id==='orders')loadOrders();if(id==='products'&&xmlReturnLine===null)loadProducts();if(id==='purchases'){loadPurchaseHistory();}if(id==='suppliers')loadSuppliers();if(id==='cash')loadCash();if(id==='commands')loadCommands();if(id==='customers')loadCustomers();if(id==='fiado')loadFiado();if(id==='settings'){loadSettings().catch(()=>{});loadSandwichCapacity();}}
async function loadAll(){loadOrders();loadCustomerOptions()}
function installCompactOrderStyles(){
  if(document.getElementById('compact-order-card-styles')) return;
  const style=document.createElement('style');
  style.id='compact-order-card-styles';
  style.textContent=`
    #ordersList.order-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));gap:12px;align-items:start}
    #ordersList .order-card{margin:0!important;padding:14px!important;min-width:0;border:1px solid rgba(212,175,55,.35);border-radius:14px;display:flex;flex-direction:column;gap:8px;box-shadow:0 5px 16px rgba(0,0,0,.16)}
    #ordersList .order-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;border-bottom:1px solid rgba(212,175,55,.22);padding-bottom:8px}
    #ordersList .order-card-number{font-weight:800;font-size:1.02rem;line-height:1.25}
    #ordersList .order-card-customer{font-weight:600;overflow-wrap:anywhere}
    #ordersList .order-card-total{font-size:1.25rem;font-weight:900;color:#d9b65d;white-space:nowrap}
    #ordersList .order-card-items{font-size:.9rem;line-height:1.35;overflow-wrap:anywhere}
    #ordersList .order-card-meta{font-size:.88rem;line-height:1.4;overflow-wrap:anywhere}
    #ordersList .order-card-payment{font-weight:700;font-size:.86rem}
    #ordersList .order-card button{width:100%;margin-top:2px}
    #ordersList .order-card-status{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.9rem}
    #ordersList .order-card-status select{flex:1;min-width:125px;max-width:100%}
    @media(max-width:480px){#ordersList.order-card-grid{grid-template-columns:1fr}#ordersList .order-card{padding:12px!important}}
  `;
  document.head.appendChild(style);
}
async function loadOrders(){
  const a=await api('/api/admin/orders');
  const list=$('ordersList');
  installCompactOrderStyles();
  list.classList.add('order-card-grid');
  list.innerHTML=a.map(o=>{
    const items=Array.isArray(o.items)?o.items:[];
    const subtotal=items.reduce((sum,i)=>sum+Number(i.total||0),0);
    const delivery=Math.max(0,Number(o.total||0)-subtotal);
    const paid=o.payment_confirmed===true||o.payment_confirmed===1;
    return `<div class="panel order-card">
      <div class="order-card-head">
        <div><div class="order-card-number">Pedido #${o.id}</div><div class="order-card-customer">${esc(o.customer_name||'Cliente não informado')}</div></div>
        <div class="order-card-total">${money(o.total)}</div>
      </div>
      <div class="order-card-items">${items.map(i=>`${i.qty}x ${esc(i.name)}`).join(', ')||'Itens não informados'}</div>
      <div class="order-card-meta">Subtotal: ${money(subtotal)}${delivery>0?` · Entrega: ${money(delivery)}`:''}</div>
      ${o.type==='entrega'?`<div class="order-card-meta">🛵 ${esc(o.address||'Endereço não informado')}</div>`:''}
      <div class="order-card-payment">${esc(o.payment||'Não informado')} · ${paid?'✅ PAGAMENTO CONFIRMADO':'⏳ AGUARDANDO CONFIRMAÇÃO'}</div>
      <button onclick="confirmOrderPayment(${o.id})" ${paid?'disabled':''}>CONFIRMAR PAGAMENTO E IMPRIMIR COMPROVANTE</button>
      <div class="order-card-status"><span>Status:</span><select onchange="status(${o.id},this.value)">${['novo','confirmado','preparando','pronto','entregando','finalizado','cancelado'].map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}</select></div>
    </div>`;
  }).join('')||'<p>Nenhum pedido.</p>';
}
async function status(id,s){await api('/api/admin/orders/'+id+'/status',{method:'PUT',body:JSON.stringify({status:s})});loadOrders()}
async function downloadProductDiagnostic(){try{const d=await api('/api/admin/products/diagnostic');const cols=['id','internal_code','name','brand','category','barcode','unit','product_type','cost_price','price','stock','min_stock','active','diagnostic_flags'];const csv=[cols.join(';'),...d.products.map(p=>cols.map(k=>{const v=p[k]??'';return '"'+String(v).replace(/"/g,'""')+'"'}).join(';'))].join('\r\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='diagnostico-produtos-espetinho.csv';a.click();URL.revokeObjectURL(url);alert('Diagnóstico gerado. Produtos: '+d.total+' | Grupos com nome repetido: '+d.duplicate_name_groups+' | Grupos com EAN repetido: '+d.duplicate_ean_groups+' | Sem EAN: '+d.without_ean+' | EAN inválido/fora do padrão: '+d.invalid_ean+'\n\nO arquivo é apenas um relatório; nada foi alterado no cadastro.');}catch(e){alert('Não foi possível gerar o diagnóstico: '+e.message)}}
async function downloadDatabaseBackup(){if(!confirm('Gerar e baixar uma cópia de segurança do banco de dados? Nenhum dado será alterado.'))return;try{const r=await fetch('/api/admin/database/backup',{headers:{'x-admin-password':pass}});if(!r.ok){let m='Falha ao gerar backup';try{m=(await r.json()).error||m}catch(_){}throw Error(m)}const blob=await r.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='esp-reinaldo-backup.sqlite';a.click();URL.revokeObjectURL(url);alert('Backup baixado. Guarde esse arquivo em local seguro e não o envie publicamente.');}catch(e){alert('Não foi possível baixar o backup: '+e.message)}}
let cachedProducts=[];function filterProductList(){const term=String($('productSearch')?.value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();const rows=cachedProducts.filter(p=>[p.name,p.brand,p.internal_code,p.barcode,p.category].some(v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(term)));$('productsListTable').innerHTML=rows.map(p=>`<tr><td>${p.image?`<img class="admin-product-thumb" src="${escAttr(p.image)}" alt="${escAttr(p.name)}" loading="lazy" onerror="this.style.display='none'">`:'<span class="admin-product-no-photo">🍢</span>'}</td><td><b>${esc(p.internal_code||'-')}</b><br><span class="small">EAN: ${esc(p.barcode||'-')}</span></td><td><b>${esc(p.name)}</b><br><span class="small">${esc(p.brand||'')}</span></td><td>${esc(p.category)}</td><td>${money(p.cost_price)}</td><td>${money(p.price)}</td><td class="${Number(p.stock)<=Number(p.min_stock)&&Number(p.min_stock)>0?'low':''}">${p.stock} ${esc(p.unit||'un')}</td><td>${p.active?'Ativo':'Inativo'}</td><td><button onclick="editProduct(${p.id})">Editar</button> ${(/^ER000055$|^ER000056$/.test(String(p.internal_code||'')) && (p.product_type||'venda')!=='insumo')?`<button class="danger" onclick="markProductInternal('${p.internal_code}')">Ocultar da vitrine</button>`:(/^ER000003$|^ER000011$|^ER000012$|^ER000060$/.test(String(p.internal_code||'')))?`<button class="danger" onclick="deleteTestProduct('${p.internal_code}')">Excluir</button>`:(p.active?`<button onclick="del(${p.id})">Inativar</button>`:(/^ER00006[4-9]$|^ER00007[01]$/.test(String(p.internal_code||''))?`<button onclick="deleteTestProduct('${p.internal_code}')">Excluir</button>`:'<span class="muted">Inativo</span>'))}</td></tr>`).join('')||'<tr><td colspan=9>Nenhum produto encontrado.</td></tr>'; }async function loadProducts(){cachedProducts=await api('/api/admin/products?type=venda');$('productsList').innerHTML='<div class="table"><table><thead><tr><th>Foto</th><th>Código interno / EAN</th><th>Produto</th><th>Categoria</th><th>Custo</th><th>Venda</th><th>Estoque</th><th>Status</th><th>Ações</th></tr></thead><tbody id="productsListTable"></tbody></table></div>';filterProductList();$('productListScreen').style.display='block';$('productFormArea').style.display='none';}
function newProductForm(){editingId=null;xmlPackContext=null;clearForm();if($('pInternalCode'))$('pInternalCode').value='Gerado automaticamente ao salvar';$('pcost').readOnly=false;$('xmlProductPackBox').style.display='none';$('productListScreen').style.display='none';$('productFormArea').style.display='block';$('productFormTitle').textContent='Cadastrar Produto Novo';}
function cancelProductForm(){
  if(xmlReturnLine!==null && xmlProductHistoryStep){history.back();return;}
  if(xmlReturnLine!==null){returnFromXmlProduct();return;}
  $('productFormArea').style.display='none';$('productListScreen').style.display='block';clearForm();
}
function normalizeXmlPackageUnit(value){
  const s=String(value||'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(/^(UN|UND|UNID|UNIDADE|UNIDADES)$/.test(s))return 'UN';
  if(/^(FD|FDO|FARDO|FARDOS)$/.test(s))return 'FD';
  if(/^(CX|CAIXA|CAIXAS)$/.test(s))return 'CX';
  if(/^(KG|KILO|KILOS|QUILO|QUILOS)$/.test(s))return 'KG';
  if(/^(L|LT|LITRO|LITROS)$/.test(s))return 'L';
  if(/^(PCT|PC|PCTE|PACOTE|PACOTES)$/.test(s))return 'PCT';
  return 'UN';
}
async function startXmlProductRegistration(i){
  if(!purchaseDraft||!purchaseDraft.lines[i])return;
  xmlReturnLine=i;
  const l=purchaseDraft.lines[i];
  tab('products');
  await loadProducts();
  newProductForm();
  $('productFormTitle').textContent='Cadastrar Produto — Item da NF-e';
  $('pn').value=l.product_name||'';$('pb').value=l.barcode||'';$('pbrand').value='';$('pc').value='Bebidas';$('pu').value='un';
  const detected=Number(l.units_per_pack)||detectUnitsPerPack(l.product_name+' '+l.purchase_unit)||1;
  xmlPackContext={lineIndex:i,packageQty:Number(l.purchase_qty)||1,packageUnit:normalizeXmlPackageUnit(l.purchase_unit),lineTotal:Number(l.line_total)||0,unitsPerPack:detected};
  l.units_per_pack=detected;
  $('xmlPackBoxLabel').textContent=`${xmlPackContext.packageQty} ${xmlPackContext.packageUnit} · Total da linha ${money(xmlPackContext.lineTotal)}`;
  $('xmlPackQty').value=xmlPackContext.packageQty;$('xmlPackUnit').value=xmlPackContext.packageUnit;$('xmlUnitsPerPackForm').value=detected;$('xmlPackCost').value=xmlPackContext.lineTotal.toFixed(2);$('xmlTotalUnits').value=xmlPackContext.packageQty*detected;
  $('pcost').value=(xmlPackContext.lineTotal/Math.max(1,xmlPackContext.packageQty*detected)).toFixed(4);$('pcost').readOnly=true;$('pp').value='0';$('pstock').value='0';$('pmin').value='0';$('pd').value='';$('saveBtn').textContent='CADASTRAR E VOLTAR À NOTA';$('xmlProductPackBox').style.display='block';
  updateProductProfitPreview();
  if(!xmlProductHistoryStep){history.pushState({screen:'xml-product-form'},'',location.href);xmlProductHistoryStep=true;}
  window.scrollTo({top:0,behavior:'smooth'});
}
function detectUnitsPerPack(text){
  const s=String(text||'').toUpperCase();
  let m=s.match(/(?:^|\D)(\d{1,3})\s*(?:UN|UND|UNID|U)\b/);
  if(!m)m=s.match(/(?:FD|FARDO|CX|CAIXA|PACK|PCT|PACOTE)\s*(?:C\/|COM)?\s*(\d{1,3})\b/);
  return m?Math.max(1,Number(m[1])):1;
}
function returnFromXmlProduct(){
  $('productFormArea').style.display='none';$('productListScreen').style.display='block';
  xmlReturnLine=null;xmlPackContext=null;xmlProductHistoryStep=false;returningToXml=false;
  tab('purchases');renderPurchaseLines();
}
function updateXmlProductPack(){if(!xmlPackContext)return;const packs=Math.max(1,Number($('xmlPackQty').value)||1),units=Math.max(1,Math.floor(Number($('xmlUnitsPerPackForm').value)||1)),total=packs*units,cost=xmlPackContext.lineTotal/total;xmlPackContext.packageUnit=$('xmlPackUnit').value||'UN';$('xmlTotalUnits').value=total;$('pcost').value=cost.toFixed(4);xmlPackContext.unitsPerPack=units;const l=purchaseDraft?.lines[xmlPackContext.lineIndex];if(l){l.units_per_pack=units;l.purchase_unit=xmlPackContext.packageUnit;l.stock_qty=total;l.stock_unit='un';l.unit_cost=cost;}updateProductProfitPreview();}
function updateProductProfitPreview(){const c=toNumber($('pcost').value),p=toNumber($('pp').value),el=$('productProfitPreview');if(!el)return;if(c>0&&p>0)el.textContent=`Markup: ${((p/c-1)*100).toFixed(1)}% · Margem bruta: ${(((p-c)/p)*100).toFixed(1)}%`;else el.textContent='Markup: — · Margem bruta: —';}


function saleOptionRows(){return [...document.querySelectorAll('#saleOptionsRows .sale-option-row')].map((row,i)=>({key:row.querySelector('.sale-key').value.trim()||('op'+i),label:row.querySelector('.sale-label').value.trim(),factor:toNumber(row.querySelector('.sale-factor').value),price:toNumber(row.querySelector('.sale-price').value)})).filter(x=>x.label&&x.factor>0&&Number.isFinite(x.price)&&x.price>=0)}
function renderSaleOptionRows(options=[]){const box=$('saleOptionsRows');if(!box)return;box.innerHTML=options.map((o,i)=>`<div class="sale-option-row row3" style="grid-template-columns:1.3fr .7fr .8fr .8fr auto;gap:5px;margin:5px 0"><input class="sale-key" value="${escAttr(o.key||('op'+i))}" placeholder="chave" aria-label="Chave"><input class="sale-label" value="${escAttr(o.label||'')}" placeholder="Apresentação (ex.: Fardo 12 un)"><input class="sale-factor" type="number" min="0.001" step="0.001" value="${Number(o.factor??1)}" placeholder="Baixa no estoque"><input class="sale-price" type="number" min="0" step="0.01" value="${Number(o.price||0)}" placeholder="Preço R$"><button type="button" onclick="this.parentElement.remove()">✕</button></div>`).join('')}
function addSaleOptionRow(){const opts=saleOptionRows();opts.push({key:'op'+(opts.length+1),label:'',factor:1,price:0});renderSaleOptionRows(opts)}
function applySalePreset(){const preset=$('salePreset');if(!preset)return;const p=preset.value;let opts=[];if(p==='beer'){ $('pu').value='un';opts=[{key:'un',label:'Unidade',factor:1,price:Number($('pp').value)||0},{key:'fardo',label:'Fardo (12 unidades)',factor:12,price:0},{key:'caixa',label:'Caixa (24 unidades)',factor:24,price:0}]}else if(p==='spirit'){ $('pu').value='ml';opts=[{key:'dose',label:'Dose (50 ml)',factor:50,price:0},{key:'garrafa',label:'Garrafa (informe o volume em ml)',factor:0,price:0}]}else if(p==='cachaça'){ $('pu').value='ml';opts=[{key:'dose',label:'Dose (50 ml)',factor:50,price:0},{key:'garrafa200',label:'Garrafa 200 ml',factor:200,price:0},{key:'garrafa500',label:'Garrafa 500 ml',factor:500,price:0},{key:'garrafa1000',label:'Garrafa 1 litro',factor:1000,price:0}]}else if(p==='custom'){opts=saleOptionRows()}renderSaleOptionRows(opts)}
function inferSalePreset(p){const o=(()=>{try{return Array.isArray(p.sale_options)?p.sale_options:JSON.parse(p.sale_options||'[]')}catch(_){return []}})();if(!o.length)return 'simple';if(o.some(x=>/fardo|caixa/i.test(x.label)))return 'beer';if(o.some(x=>/200 ml/i.test(x.label))&&o.some(x=>/500 ml/i.test(x.label)))return 'cachaça';if(o.some(x=>/dose/i.test(x.label)))return 'spirit';return 'custom'}

function fill(p){editingId=p.id;editingSaleOptions=(()=>{try{return Array.isArray(p.sale_options)?p.sale_options:JSON.parse(p.sale_options||'[]')}catch(_){return []}})();$('pcost').readOnly=false;$('productListScreen').style.display='none';$('productFormArea').style.display='block';$('productFormTitle').textContent='Editar Produto · '+(p.internal_code||'Código será gerado');if($('pInternalCode'))$('pInternalCode').value=p.internal_code||'';$('pfile').value='';$('photoPreview').innerHTML=p.image?`<img src="${escAttr(p.image)}" style="width:90px;height:90px;object-fit:cover;border-radius:10px">`:'Sem foto';$('pb').value=p.barcode||'';$('pn').value=p.name||'';$('pbrand').value=p.brand||'';$('pc').value=p.category||'';$('pu').value=p.unit||'un';$('pcost').value=p.cost_price??0;$('pp').value=p.price??0;$('pstock').value=p.stock??0;$('pmin').value=p.min_stock??0;$('pi').value=p.image||'';$('pd').value=p.description||'';$('psite').checked=p.print_site===undefined||p.print_site===null||p.print_site===true||p.print_site===1;$('pcommand').checked=(p.print_command===true||p.print_command===1)||(p.print_command===undefined&&(p.prepare_kitchen===true||p.prepare_kitchen===1));if($('salePreset'))$('salePreset').value=inferSalePreset(p);renderSaleOptionRows(editingSaleOptions);$('saveBtn').textContent='SALVAR ALTERAÇÕES';window.scrollTo({top:0,behavior:'smooth'});}
async function editProduct(id){const a=await api('/api/admin/products?type=all');const p=a.find(x=>Number(x.id)===Number(id));if(p)fill(p)}
function clearForm(){editingId=null;editingSaleOptions=[];if($('pInternalCode'))$('pInternalCode').value='Gerado automaticamente ao salvar';if($('pcost'))$('pcost').readOnly=false;['pb','pn','pbrand','pc','pcost','pp','pstock','pmin','pi','pd','pfile'].forEach(id=>$(id).value='');$('photoPreview').textContent='';if($('psite'))$('psite').checked=true;if($('pcommand'))$('pcommand').checked=false;$('pu').value='un';if($('salePreset'))$('salePreset').value='simple';renderSaleOptionRows([]);$('saveBtn').textContent='CADASTRAR PRODUTO';}
async function lookupBarcode(){const b=$('pb').value.trim();if(!b)return alert('Passe ou digite o código de barras.');try{const d=await api('/api/admin/products/barcode/'+encodeURIComponent(b)+'/lookup');if(d.found){$('pn').value=d.name||'';$('pbrand').value=d.brand||'';$('pc').value=d.category||'Salgadinhos Chips';$('pu').value=d.unit||'un';$('pd').value=d.description||'';$('pi').value=d.image||'';const preview=$('photoPreview');if(preview)preview.innerHTML=d.image?`<img src="${escAttr(d.image)}" style="width:90px;height:90px;object-fit:cover;border-radius:10px" onerror="this.style.display='none'">`:'Sem foto';}else alert(d.message||'Produto não encontrado.');}catch(e){alert(e.message)}}
$('pb').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();lookupBarcode()}});

function photoFile(input){const f=input.files&&input.files[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const max=700;const scale=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);const data=c.toDataURL('image/jpeg',0.78);$('pi').value=data;$('photoPreview').innerHTML=`<img src="${escAttr(data)}" style="width:90px;height:90px;object-fit:cover;border-radius:10px"><br>Foto pronta para salvar`;};img.src=reader.result;};reader.readAsDataURL(f);}
async function saveProduct(){const body={name:$('pn').value.trim(),barcode:$('pb').value.trim(),brand:$('pbrand').value.trim(),category:$('pc').value.trim()||'Salgadinhos Chips',unit:$('pu').value.trim()||'un',cost_price:toNumber($('pcost').value),price:toNumber($('pp').value),stock:toNumber($('pstock').value),min_stock:toNumber($('pmin').value),image:$('pi').value.trim(),description:$('pd').value.trim(),active:xmlReturnLine===null,print_site:$('psite').checked,print_command:$('pcommand').checked,prepare_kitchen:$('pcommand').checked,sale_options:$('salePreset')?($('salePreset').value==='simple'?[]:saleOptionRows()):(editingId?editingSaleOptions:[])};if(body.sale_options.length)body.price=Number(body.sale_options[0].price)||body.price;if(!body.name)return alert('Informe o nome do produto.');if($('salePreset')&&$('salePreset').value!=='simple'&&(!body.sale_options.length||body.sale_options.some(o=>!o.label||!(o.factor>0)||!Number.isFinite(o.price)||o.price<0)))return alert('Confira as apresentações: informe nome, quantidade baixada no estoque e preço de cada uma.');try{let saved;if(editingId)saved=await api('/api/admin/products/'+editingId,{method:'PUT',body:JSON.stringify(body)});else saved=await api('/api/admin/products',{method:'POST',body:JSON.stringify(body)});if(xmlReturnLine!==null&&purchaseDraft&&purchaseDraft.lines[xmlReturnLine]){const i=xmlReturnLine;purchaseDraft.lines[i].product_id=String(saved.id);purchaseDraft.lines[i].product_name=body.name;const products=await api('/api/admin/products?type=all');purchaseDraft.lines.forEach(l=>l.products=products);xmlReturnLine=null;xmlPackContext=null;xmlProductHistoryStep=false;clearForm();tab('purchases');renderPurchaseLines();const sel=$('purchaseProduct_'+i);if(sel)sel.value=String(saved.id);alert('Produto cadastrado e vinculado à nota. Confira os outros itens e depois confirme a entrada.');}else{clearForm();await loadProducts();$('productListScreen').style.display='block';$('productFormArea').style.display='none';alert('Produto salvo.');}}catch(e){alert(e.message)}}
async function del(id){if(!confirm('Desativar este produto?'))return;await api('/api/admin/products/'+id,{method:'DELETE'});loadProducts()}
async function deleteTestProduct(code){if(!confirm('Excluir definitivamente o cadastro de teste '+code+'? Esta ação não pode ser desfeita.'))return;try{await api('/api/admin/products/test-duplicates/'+encodeURIComponent(code),{method:'DELETE'});await loadProducts();alert(code+' excluído.');}catch(e){alert(e.message)}}
async function markProductInternal(code){if(!confirm('Marcar '+code+' como insumo e ocultá-lo do site de pedidos? O cadastro e o estoque serão mantidos.'))return;try{await api('/api/admin/products/mark-internal/'+encodeURIComponent(code),{method:'POST',body:JSON.stringify({})});await loadProducts();alert(code+' agora é insumo e não aparece na vitrine.');}catch(e){alert(e.message)}}
function csvRows(text){const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return[];const parse=l=>{let a=[],cur='',q=false;for(let i=0;i<l.length;i++){const c=l[i];if(c==='"'){if(q&&l[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){a.push(cur);cur='';}else cur+=c;}a.push(cur);return a.map(x=>x.trim())};const h=parse(lines[0]).map(x=>x.toLowerCase());return lines.slice(1).map(l=>{const v=parse(l);const o={};h.forEach((k,i)=>o[k]=v[i]||'');return o;});}
$('pcost')?.addEventListener('input',updateProductProfitPreview);$('pp')?.addEventListener('input',updateProductProfitPreview);
async function importCsv(){const f=$('csvFile').files[0];if(!f)return alert('Escolha um arquivo CSV.');const rows=csvRows(await f.text());if(!rows.length)return alert('CSV vazio.');let ok=0,fail=[];for(const r of rows){try{await api('/api/admin/products',{method:'POST',body:JSON.stringify({barcode:r.codigo_barras||r.barcode||'',name:r.nome||r.name||'',brand:r.marca||r.brand||'',category:r.categoria||r.category||'Salgadinhos Chips',unit:r.unidade||r.unit||'un',cost_price:r.custo||r.cost_price||0,price:r.venda||r.price||0,stock:r.estoque||r.stock||0,min_stock:r.estoque_minimo||r.min_stock||0,description:r.descricao||r.description||'',image:r.url_foto||r.image||'',print_site:/^(0|nao|não|false)$/i.test(r.imprimir_site||r.print_site||'')?false:true,print_command:/^(1|sim|true|cozinha)$/i.test(r.imprimir_comanda||r.print_command||r.preparar_na_cozinha||r.prepare_kitchen||''),prepare_kitchen:/^(1|sim|true|cozinha)$/i.test(r.imprimir_comanda||r.print_command||r.preparar_na_cozinha||r.prepare_kitchen||''),active:true})});ok++;}catch(e){fail.push((r.codigo_barras||r.nome||'linha')+': '+e.message)}}loadProducts();alert(`Importação concluída. ${ok} produto(s) importado(s).${fail.length?'\nFalhas: '+fail.length+'\n'+fail.slice(0,5).join('\n'):''}`)}
function cashDateKey(v){if(!v)return '';const m=String(v).match(/^(\d{4}-\d{2}-\d{2})/);if(m)return m[1];const d=new Date(v);if(Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function localDateKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function cashToday(){if($('cashDate'))$('cashDate').value=localDateKey();loadCash()}
function toggleCashHistory(){const box=$('cashHistoryFilters');box.style.display=box.style.display==='none'?'flex':'none';if(box.style.display!=='none'){const today=localDateKey();if(!$('cashFrom').value)$('cashFrom').value=today;if(!$('cashTo').value)$('cashTo').value=today;$('cashViewLabel').textContent='Consulta de período';}else{cashToday();}}
async function loadCashHistory(){const from=$('cashFrom').value,to=$('cashTo').value;if(!from||!to)return alert('Informe a data inicial e a data final.');if(from>to)return alert('A data inicial não pode ser posterior à data final.');await loadCash({from,to,history:true})}
async function loadCash(options={}){
 try{
  const [d,debts]=await Promise.all([api('/api/admin/cash'),api('/api/admin/fiado')]);
  const allRows=Array.isArray(d.rows)?d.rows:[];const today=localDateKey();
  if(!options.history&&$('cashDate')&&!$('cashDate').value)$('cashDate').value=today;
  const from=options.history?options.from:(($('cashDate')&&$('cashDate').value)||today);const to=options.history?options.to:from;
  const rows=allRows.filter(x=>{const k=cashDateKey(x.created_at||x.createdAt||x.date);return k&&k>=from&&k<=to});
  const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]/g,'');
  let entradas=0,saidas=0;const totals={dinheiro:0,pix:0,debito:0,credito:0,outros:0};
  for(const x of rows){const value=Number(x.value)||0;if(x.type==='saida'){saidas+=value;continue}if(x.type==='fiado')continue;if(x.type!=='entrada')continue;const pay=normalize(x.payment);if(['fiado','aprazo'].includes(pay)||pay.includes('promissoria'))continue;entradas+=value;if(pay==='dinheiro'||pay==='cash')totals.dinheiro+=value;else if(pay==='pix')totals.pix+=value;else if(['debito','cartaodebito','debit'].includes(pay))totals.debito+=value;else if(['credito','cartaocredito','credit'].includes(pay))totals.credito+=value;else totals.outros+=value}
  const pending=Array.isArray(debts)?debts.reduce((sum,c)=>sum+Math.max(0,Number(c.remaining)||0),0):0;const label=options.history?`Histórico do Caixa · ${from} a ${to}`:`Caixa do dia · ${from}`;
  $('cashViewLabel').textContent=options.history?'Consulta de período':'Movimento diário';
  $('cashSummary').innerHTML=`<h3>${esc(label)}</h3><div class="cash-kpis"><div class="cash-card primary-total"><span>ENTRADAS RECEBIDAS</span><strong>${money(entradas)}</strong></div><div class="cash-card out-total"><span>SAÍDAS</span><strong>${money(saidas)}</strong></div><div class="cash-card"><span>SALDO DO PERÍODO</span><strong>${money(entradas-saidas)}</strong></div></div><h4>Recebimentos por forma de pagamento</h4><div class="cash-methods"><div class="cash-method"><span>Dinheiro</span><strong>${money(totals.dinheiro)}</strong></div><div class="cash-method"><span>Pix</span><strong>${money(totals.pix)}</strong></div><div class="cash-method"><span>Cartão de débito</span><strong>${money(totals.debito)}</strong></div><div class="cash-method"><span>Cartão de crédito</span><strong>${money(totals.credito)}</strong></div><div class="cash-method cash-method-debt"><span>Fiado pendente</span><strong>${money(pending)}</strong></div></div><p class="muted cash-summary-note">${rows.length} movimentação(ões) no período. O saldo considera apenas valores recebidos menos saídas; fiado permanece separado até o pagamento.</p>`;
  $('cashDebtSummary').innerHTML='';
  $('cashList').innerHTML=rows.map(x=>`<div>${x.type==='entrada'?'🟢':x.type==='fiado'?'🟡':'🔴'} <b>${esc(x.description)}</b><br><b>${money(x.value)}</b> ${esc(x.payment||'')}${x.type==='fiado'?' — fiado lançado, ainda não recebido':''}<small>Data: ${esc(cashDateKey(x.created_at||x.createdAt||x.date))}</small></div>`).join('')||'<div class="cash-empty">Nenhuma movimentação encontrada neste período.</div>';
 }catch(e){$('cashSummary').innerHTML=`<p>Erro ao carregar o caixa: ${esc(e.message)}</p>`}
}
async function addCash(){await api('/api/admin/cash',{method:'POST',body:JSON.stringify({type:$('ct').value,description:$('cd').value,value:$('cv').value,payment:$('cp').value})});$('cd').value='';$('cv').value='';loadCash()}
async function loadCustomerOptions(selected=''){
 try{const rows=await api('/api/admin/customers');const select=$('cc');if(!select)return;const current=selected||select.value;const active=rows.filter(c=>c.active===true||c.active===1);select.innerHTML='<option value="">Consumidor não identificado (sem cadastro)</option>'+active.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}${(c.fiado_authorized===true||c.fiado_authorized===1)?' — fiado autorizado':' — sem autorização de fiado'}</option>`).join('');if(current&&active.some(c=>c.name===current))select.value=current;}catch(e){if($('cc'))$('cc').innerHTML='<option value="">Não foi possível carregar clientes</option>';console.error(e)}
}
let currentCommandId=null;
function commandElapsed(createdAt){
 if(!createdAt)return 'Tempo não disponível';
 const d=new Date(createdAt);if(Number.isNaN(d.getTime()))return 'Tempo não disponível';
 const mins=Math.max(0,Math.floor((Date.now()-d.getTime())/60000));
 if(mins<60)return `Aberta há ${mins} min`;
 const hours=Math.floor(mins/60),rest=mins%60;
 if(hours<24)return `Aberta há ${hours}h${rest?` ${rest}min`:''}`;
 const days=Math.floor(hours/24);return `Aberta há ${days}d ${hours%24}h`;
}
async function loadCommands(){
 try{
  await loadCustomerOptions();const [rows,products]=await Promise.all([api('/api/admin/commands'),api('/api/admin/products')]);
  const activeProducts=products.filter(p=>p.active===true||p.active===1);
  const opened=rows.filter(c=>c.status==='aberta').sort((a,b)=>Number(a.number)-Number(b.number));
  const closed=rows.filter(c=>c.status!=='aberta').sort((a,b)=>Number(b.id)-Number(a.id));
  const card=c=>{const emptyOpen=c.status==='aberta'&&(!Array.isArray(c.items)||c.items.length===0)&&Number(c.total||0)<=0.001;return `<article class="command-card ${c.status==='aberta'?'open':'closed'}"><div class="command-meta"><span class="command-status">${c.status==='aberta'?'EM ATENDIMENTO':(String(c.payment||'').toLowerCase()==='fiado'?'FIADO / A RECEBER':String(c.payment||'').toLowerCase()==='pendente'?'AGUARDANDO PAGAMENTO':'FINALIZADA')}</span><h3>Comanda ${esc(c.number)} · ${esc(c.customer||'Sem cadastro')}</h3></div><div class="command-total">${money(c.total)}</div>${(c.waiter_name||c.waiter_number)?`<div class="command-time" style="color:#f0d9a5;font-weight:700">Garçom: ${esc(c.waiter_name||'Não identificado')}${c.waiter_number?` · Nº ${esc(c.waiter_number)}`:''}</div>`:''}${c.status==='aberta'?`<span class="command-time">${esc(commandElapsed(c.created_at))}</span><button class="command-open-btn" onclick="openCommandDetails(${c.id})">ABRIR</button>${emptyOpen?`<button type="button" class="danger" style="display:block;margin-top:7px;background:#b42318!important;color:#fff!important;border:0!important;padding:8px 10px!important;border-radius:7px!important;font-weight:800!important" onclick="deleteEmptyCommand(${c.id})">EXCLUIR COMANDA VAZIA</button>`:''}`:`<span class="command-time">${esc(c.closed_at?new Date(c.closed_at).toLocaleDateString('pt-BR'):'Histórico')}</span>${String(c.payment||'').toLowerCase()==='pendente'?`<button onclick="payClosedCommand(${c.id})">RECEBER</button> <button onclick="openCommandDocument(${c.id},'a4')">COMANDA A4 / PDF</button>`:`<button onclick="printCommand(${c.id},'conferencia')">IMPRIMIR CONFERÊNCIA</button> <button onclick="printCommand(${c.id},'paga')">IMPRIMIR COMPROVANTE</button> <button onclick="openCommandDocument(${c.id},'a4')">COMANDA A4 / PDF</button>`}`}</article>`};
  $('commandsOpenList').innerHTML=`<button type="button" class="command-card command-new" onclick="openNewCommandDialog()"><strong>＋ NOVA COMANDA</strong><span>Escolher cliente</span></button>`+opened.map(card).join('');
  $('commandsClosedList').innerHTML=closed.length?closed.map(card).join(''):'<div class="command-empty">Nenhuma conta finalizada ainda.</div>';
  if(currentCommandId){const stillOpen=opened.some(c=>Number(c.id)===Number(currentCommandId));if(stillOpen)renderCommandDetails(rows.find(c=>Number(c.id)===Number(currentCommandId)),activeProducts);else closeCommandDetails();}
 }catch(e){$('commandsOpenList').innerHTML='<p>Erro ao carregar comandas: '+esc(e.message)+'</p>';$('commandsClosedList').innerHTML='';}
}
async function deleteEmptyCommand(id){if(!confirm('Confirma excluir esta comanda? Esta ação só funciona se ela estiver aberta, sem nenhum produto e com total zero.'))return;try{await api('/api/admin/commands/'+id+'/empty',{method:'DELETE'});await loadCommands();alert('Comanda vazia excluída com sucesso.');}catch(e){alert(e.message)}}
async function openNewCommandDialog(){await loadCustomerOptions();$('newCommandModal').classList.add('show')}
function cancelNewCommand(){$('newCommandModal').classList.remove('show');$('cc').value='';if($('ccName'))$('ccName').value=''}
async function addCommand(){try{const typedName=$('ccName')?$('ccName').value.trim():'';const customer=typedName||$('cc').value||'';const result=await api('/api/admin/commands',{method:'POST',body:JSON.stringify({customer})});cancelNewCommand();await loadCommands();if(result&&result.id)openCommandDetails(result.id);else if(result&&result.number){const rows=await api('/api/admin/commands');const c=rows.find(x=>String(x.number)===String(result.number));if(c)openCommandDetails(c.id);} }catch(e){alert(e.message)}}
async function openCommandDetails(id){
 try{const [rows,products]=await Promise.all([api('/api/admin/commands'),api('/api/admin/products')]);const c=rows.find(x=>Number(x.id)===Number(id));if(!c)throw Error('Comanda não encontrada.');if(c.status!=='aberta')throw Error('Esta comanda já foi finalizada.');currentCommandId=Number(id);renderCommandDetails(c,products.filter(p=>p.active===true||p.active===1));}catch(e){alert(e.message)}
}
function renderCommandDetails(c,activeProducts){
 if(!c)return;window.commandActiveProducts=activeProducts||[];const items=c.items||[];
 const itemHtml=items.length?`<div class="command-detail-items" style="display:grid;gap:9px;margin:8px 0 14px;width:100%;">${items.map(i=>`<div class="command-item-card" style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:11px;border:1px solid #75634a;border-radius:10px;background:#292521;color:#fff;box-sizing:border-box;width:100%;"><div style="min-width:0;"><div style="font-weight:800;overflow-wrap:anywhere;color:#f7e8c5;">${esc(i.name)}</div><div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:5px;font-size:.9rem;color:#fff;"><span>Qtd.: <b>${esc(i.qty)}</b></span><span>Unit.: <b>${money(i.unit_price)}</b></span><span>Total: <b>${money(i.total)}</b></span></div><div style="margin-top:5px;font-size:.82rem;color:#f0d9a5">Lançado por: <b>${esc(i.waiter_name||'Painel administrativo / não informado')}</b>${i.waiter_number?` · Garçom nº ${esc(i.waiter_number)}`:''}${i.notes?` · Obs.: ${esc(i.notes)}`:''}</div></div><button type="button" class="danger command-item-delete" style="display:inline-flex!important;align-items:center;justify-content:center;visibility:visible!important;opacity:1!important;background:#b42318!important;color:#fff!important;border:0!important;padding:11px 13px!important;border-radius:8px!important;font-weight:900!important;white-space:nowrap;min-height:44px;cursor:pointer;" title="Excluir este item da comanda" onclick="deleteCommandItem(${c.id},${i.id})">🗑 EXCLUIR</button></div>`).join('')}</div>`:'<p class="muted">Nenhum produto lançado.</p>';
 $('commandsBoardView').style.display='none';const view=$('commandDetailView');view.style.display='block';
 view.innerHTML=`<div class="command-detail-head"><div><h2>Comanda ${esc(c.number)}</h2><b>${esc(c.customer||'Consumidor não identificado')}</b><div style="margin-top:6px;color:#f0d9a5;font-weight:700">Garçom responsável: ${esc(c.waiter_name||'Não identificado')}${c.waiter_number?` · Nº ${esc(c.waiter_number)}`:''}${c.waiter_table?` · Mesa ${esc(c.waiter_table)}`:''}</div></div><button class="command-save" onclick="closeCommandDetails()">← VOLTAR</button></div><div class="command-detail-total"><span>Total acumulado</span><strong>${money(c.total)}</strong></div><h3>Produtos</h3>${itemHtml}<h3>Adicionar produto</h3><div class="command-product-picker" style="display:block;width:100%;max-width:500px;box-sizing:border-box;margin:0"><div class="command-search-wrap" style="display:block;width:100%;max-width:100%;box-sizing:border-box;margin:0"><input id="cmdProductSearch" class="command-product-search" type="search" placeholder="🔎 Digite o nome, marca ou código..." oninput="filterCommandProducts()" autocomplete="off" aria-label="Pesquisar produtos" style="display:block;width:100%;max-width:100%;box-sizing:border-box"><div id="cmdProductSuggestions" class="command-product-suggestions" role="listbox" hidden></div></div><div id="cmdProductResults" class="command-product-suggestions" style="position:static!important;left:auto!important;right:auto!important;top:auto!important;display:grid;gap:4px;margin-top:6px;width:100%!important;min-width:0!important;max-width:100%!important;max-height:220px;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;align-content:start"></div></div><div class="command-detail-actions"><button class="command-save" onclick="closeCommandDetails()">GUARDAR E VOLTAR</button><button type="button" onclick="openCommandDocument(${c.id},'a4')">COMANDA A4 / PDF</button><button class="command-finalize" type="button" onclick="showCommandPayment()">FINALIZAR E PAGAR</button></div><div id="commandPaymentBox" class="command-payment-box" data-total="${Number(c.total||0).toFixed(2)}"><b>Formas de pagamento</b><p style="margin:4px 0 10px;color:#e8d9b8">Total da comanda: <strong>${money(c.total)}</strong></p><div id="cmdPaymentRows"></div><button type="button" class="command-save" style="width:100%;margin:7px 0" onclick="addCommandPaymentRow()">＋ ADICIONAR OUTRA FORMA</button><div id="cmdPaymentSummary" style="padding:9px;border-radius:8px;background:#211e1a;margin:7px 0;font-weight:700"></div><button class="command-finalize" style="width:100%" onclick="finalizeCommand(${c.id})">CONFIRMAR FINALIZAÇÃO</button></div>`;updateCommandSaleOptions();
 addCommandPaymentRow(Number(c.total||0));
}
async function loadFiadoPaymentCustomers(){
 if(Array.isArray(window.commandFiadoCustomers))return window.commandFiadoCustomers;
 const rows=await api('/api/admin/customers');
 window.commandFiadoCustomers=rows.filter(c=>(c.active===true||c.active===1)&&(c.fiado_authorized===true||c.fiado_authorized===1));
 return window.commandFiadoCustomers;
}
function addCommandPaymentRow(defaultAmount=''){
 const box=$('cmdPaymentRows');if(!box)return;
 const row=document.createElement('div');row.className='cmd-payment-row';row.style.cssText='display:grid;grid-template-columns:minmax(0,1fr) minmax(105px,.8fr) auto;gap:7px;align-items:center;margin:7px 0';
 row.innerHTML='<select class="cmdPayMethod" aria-label="Forma de pagamento"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="debito">Cartão de débito</option><option value="credito">Cartão de crédito</option><option value="fiado">Fiado / promissória</option></select><input class="cmdPayAmount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Valor (R$)" aria-label="Valor do pagamento"><button type="button" class="danger cmdPayRemove" style="padding:8px 10px" aria-label="Remover forma de pagamento">✕</button>';
 const amount=row.querySelector('.cmdPayAmount');if(defaultAmount!==''&&defaultAmount!==null)amount.value=Number(defaultAmount).toFixed(2);
 row.querySelector('.cmdPayRemove').addEventListener('click',()=>{row.remove();updateCommandPaymentTotal()});
 row.querySelector('.cmdPayMethod').addEventListener('change',()=>handleCommandPaymentMethod(row));amount.addEventListener('input',updateCommandPaymentTotal);
 box.appendChild(row);updateCommandPaymentTotal();
}
async function handleCommandPaymentMethod(row){
 const method=row.querySelector('.cmdPayMethod').value;let customerBox=row.querySelector('.cmdFiadoCustomer');
 if(method!=='fiado'){customerBox?.remove();updateCommandPaymentTotal();return;}
 if(customerBox)return;
 try{
  const customers=await loadFiadoPaymentCustomers();
  if(!customers.length){row.querySelector('.cmdPayMethod').value='pix';return alert('Não há clientes ativos e autorizados para comprar no fiado. Cadastre ou autorize um cliente primeiro.');}
  customerBox=document.createElement('div');customerBox.className='cmdFiadoCustomer';customerBox.style.cssText='grid-column:1 / -1';
  customerBox.innerHTML='<label style="display:block;font-size:.9rem;margin-bottom:4px">Cliente responsável pelo fiado</label><select class="cmdFiadoClient" style="width:100%"><option value="">Selecione o cliente</option>'+customers.map(c=>'<option value="'+escAttr(c.name)+'">'+esc(c.name)+' — disponível '+money(c.credit_available||0)+'</option>').join('')+'</select>';
  row.appendChild(customerBox);customerBox.querySelector('select').addEventListener('change',()=>{
   const selected=customerBox.querySelector('select').value;
   if(selected&&[...document.querySelectorAll('.cmdFiadoClient')].filter(el=>el!==customerBox.querySelector('select')).some(el=>el.value===selected)){customerBox.querySelector('select').value='';alert('Este cliente já está selecionado em outro lançamento de fiado. Escolha outro cliente.');}
   updateCommandPaymentTotal();
  });
 }catch(e){row.querySelector('.cmdPayMethod').value='pix';alert('Não foi possível carregar os clientes: '+e.message)}
 updateCommandPaymentTotal();
}
function updateCommandPaymentTotal(){
 const box=$('commandPaymentBox');if(!box)return;
 const expected=Math.round(Number(box.dataset.total||0)*100),sum=[...box.querySelectorAll('.cmdPayAmount')].reduce((n,input)=>n+Math.round((Number(input.value)||0)*100),0),diff=expected-sum;
 const summary=$('cmdPaymentSummary');if(summary){summary.textContent=diff===0?'✓ Pagamento completo: '+money(sum/100):diff>0?'Falta receber: '+money(diff/100):'Valor excedente: '+money(Math.abs(diff)/100);summary.style.color=diff===0?'#8ee0a0':'#ffd08a';}
}
function updateCommandSaleOptions(){const p=window.commandActiveProducts?.find(x=>Number(x.id)===Number($('cmdProductCurrent')?.value));const box=$('cmdSaleOption');if(!box)return;let opts=[];try{opts=Array.isArray(p?.sale_options)?p.sale_options:JSON.parse(p?.sale_options||'[]')}catch(_){}box.innerHTML=opts.length?opts.map(o=>`<option value="${escAttr(o.key)}">${esc(o.label)} — ${money(o.price)}</option>`).join(''):'<option value="">Unidade padrão</option>';box.style.display=opts.length?'':'none';}
function showCommandPayment(){const box=$('commandPaymentBox');if(box)box.classList.toggle('show');}
function commandSearchNormalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim()}
function filterCommandProducts(){
 const input=$('cmdProductSearch'),box=$('cmdProductResults');if(!input||!box)return;
 const q=commandSearchNormalize(input.value);
 if(!q){box.innerHTML='';return}
 const products=(window.commandActiveProducts||[]).filter(p=>[p.name,p.brand,p.internal_code,p.barcode].some(v=>commandSearchNormalize(v).includes(q))).slice(0,20);
 if(!products.length){box.innerHTML='<div class="command-search-empty">Nenhum produto encontrado.</div>';return}
 box.innerHTML=products.map(p=>{
  let opts=[];try{opts=Array.isArray(p.sale_options)?p.sale_options:JSON.parse(p.sale_options||'[]')}catch(_){}
  if(!opts.length)opts=[{key:'',label:'',price:Number(p.price||0)}];
  return opts.map(o=>`<div class="cmd-product-result-row" style="display:grid;grid-template-columns:minmax(0,1fr) auto 28px!important;align-items:center!important;gap:7px!important;padding:4px 7px!important;border:1px solid #75634a;border-radius:5px;width:100%;min-height:36px;box-sizing:border-box"><div style="min-width:0;overflow:hidden"><b style="display:inline;font-size:12px;line-height:1.2;white-space:normal;overflow-wrap:anywhere">${esc(p.name)}${o.label?' — '+esc(o.label):''}</b><small style="display:block;font-size:9px;line-height:1;color:#c9c2b7;margin-top:1px">${esc(p.internal_code||'')}</small></div><strong style="white-space:nowrap;justify-self:end;font-size:11px;line-height:1">${money(o.price)}</strong><button type="button" class="primary" style="display:inline-flex!important;align-items:center!important;justify-content:center!important;width:26px!important;min-width:26px!important;max-width:26px!important;height:26px!important;min-height:26px!important;max-height:26px!important;flex:none!important;padding:0!important;margin:0!important;box-sizing:border-box!important;justify-self:end;background:#176b45!important;color:#fff!important;border:0!important;border-radius:4px!important;font-size:15px!important;line-height:1!important" onclick="addCommandPresentation(${Number(p.id)},'${String(o.key||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">＋</button></div>`).join('');
 }).join('');
}
async function addCommandPresentation(productId,key){
 if(!currentCommandId)return alert('Comanda não selecionada.');
 try{
  await api('/api/admin/commands/'+currentCommandId+'/items',{method:'POST',body:JSON.stringify({product_id:Number(productId),qty:1,sale_option_key:key||''})});
  const [rows,products]=await Promise.all([api('/api/admin/commands'),api('/api/admin/products')]);
  const c=rows.find(x=>Number(x.id)===Number(currentCommandId));
  renderCommandDetails(c,products.filter(p=>p.active===true||p.active===1));
 }catch(e){alert(e.message)}
}
function closeCommandDetails(){currentCommandId=null;$('commandDetailView').style.display='none';$('commandDetailView').innerHTML='';$('commandsBoardView').style.display='block';loadCommands();}
async function addCurrentCommandItem(id){const product_id=Number($('cmdProductCurrent').value),qty=Number($('cmdQtyCurrent').value);if(!product_id)return alert('Cadastre/ative um produto antes de lançar.');if(!Number.isFinite(qty)||qty<=0)return alert('Informe uma quantidade válida.');try{await api('/api/admin/commands/'+id+'/items',{method:'POST',body:JSON.stringify({product_id,qty,sale_option_key:$('cmdSaleOption')?.value||''})});const [rows,products]=await Promise.all([api('/api/admin/commands'),api('/api/admin/products')]);const c=rows.find(x=>Number(x.id)===Number(id));renderCommandDetails(c,products.filter(p=>p.active===true||p.active===1));}catch(e){alert(e.message)}}
async function deleteCommandItem(commandId,itemId){if(!confirm('Confirma excluir este produto da comanda aberta? Se for o último produto, a comanda também será removida automaticamente.'))return;try{const result=await api('/api/admin/commands/'+commandId+'/items/'+itemId,{method:'DELETE'});if(result.commandDeleted){currentCommandId=null;$('commandDetailView').style.display='none';$('commandDetailView').innerHTML='';$('commandsBoardView').style.display='block';await loadCommands();alert('Último produto excluído. A comanda vazia foi removida automaticamente.');return;}const [rows,products]=await Promise.all([api('/api/admin/commands'),api('/api/admin/products')]);const c=rows.find(x=>Number(x.id)===Number(commandId));if(!c){currentCommandId=null;$('commandDetailView').style.display='none';$('commandDetailView').innerHTML='';$('commandsBoardView').style.display='block';await loadCommands();return;}renderCommandDetails(c,products.filter(p=>p.active===true||p.active===1));}catch(e){alert(e.message)}}
async function finalizeCommand(id){
 const box=$('commandPaymentBox');
 const payments=[...box.querySelectorAll('.cmd-payment-row')].map(row=>({payment:row.querySelector('.cmdPayMethod').value,amount:Number(row.querySelector('.cmdPayAmount').value),customer:row.querySelector('.cmdFiadoClient')?.value||''}));
 if(!payments.length||payments.some(p=>!Number.isFinite(p.amount)||p.amount<=0))return alert('Informe um valor maior que zero em cada forma de pagamento.');
 if(payments.some(p=>p.payment==='fiado'&&!p.customer))return alert('Selecione um cliente para cada lançamento de fiado.');
 const fiadoNames=payments.filter(p=>p.payment==='fiado').map(p=>commandSearchNormalize(p.customer));if(new Set(fiadoNames).size!==fiadoNames.length)return alert('Cada lançamento de fiado deve ser para um cliente diferente.');
 const expected=Math.round(Number(box.dataset.total||0)*100),sum=payments.reduce((n,p)=>n+Math.round(p.amount*100),0);
 if(sum!==expected)return alert('A soma dos pagamentos precisa ser exatamente igual ao total da comanda.');
 const summary=payments.map(p=>(p.payment==='fiado'?'Fiado ('+p.customer+')':p.payment)+': '+money(p.amount)).join(' + ');
 if(!confirm('Confirma finalizar a comanda com: '+summary+'?'))return;
 try{await api('/api/admin/commands/'+id+'/close',{method:'PUT',body:JSON.stringify({payments})});currentCommandId=null;$('commandDetailView').style.display='none';$('commandDetailView').innerHTML='';$('commandsBoardView').style.display='block';await loadCommands();if($('cash').style.display!=='none')await loadCash();printCommand(id,'paga');const hasFiado=payments.some(p=>p.payment==='fiado');alert(hasFiado?'Venda finalizada. Os recebimentos foram lançados no caixa e a parcela fiada foi registrada para o cliente.':'Venda finalizada e recebimentos registrados no caixa.');}catch(e){alert(e.message)}
}
async function payClosedCommand(id){const payment=prompt('Forma de pagamento: pix, dinheiro, debito ou credito','pix');if(!payment)return;const normalized=payment.toLowerCase().trim();if(!['pix','dinheiro','debito','credito'].includes(normalized))return alert('Informe pix, dinheiro, debito ou credito.');try{await api('/api/admin/commands/'+id+'/pay',{method:'PUT',body:JSON.stringify({payment:normalized})});await loadCommands();if($('cash').style.display!=='none')await loadCash();printCommand(id,'paga');}catch(e){alert(e.message)}}
async function closeCommand(id){return finalizeCommand(id)}
async function payCommand(id){return payClosedCommand(id)}
async function openCommandDocument(id,mode='a4'){
 let win=null;
 try{
  win=window.open('about:blank','_blank');
  if(!win){alert('O navegador bloqueou a nova janela. Permita pop-ups para este site e tente novamente.');return;}
  const rows=await api('/api/admin/commands');
  const c=rows.find(x=>Number(x.id)===Number(id));
  if(!c)throw Error('Comanda não encontrada.');
  const data={number:c.number,command:c.number,customer:c.customer||'',payment:c.payment||'Pendente',payment_details:Array.isArray(c.payment_details)?c.payment_details:[],status:c.status||'',created_at:c.closed_at||c.created_at||new Date().toISOString(),items:(c.items||[]).map(i=>({name:i.name,qty:Number(i.qty||1),unit_price:Number(i.unit_price||0),total:Number(i.total||0)})),total:Number(c.total||0),notes:c.notes||''};
  const key='esp-reinaldo-command-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
  localStorage.setItem(key,JSON.stringify(data));
  win.location.href='/comanda-fiado.html?key='+encodeURIComponent(key)+'&mode='+encodeURIComponent(mode);
 }catch(e){if(win)win.close();alert('Não foi possível abrir a comanda A4/PDF: '+e.message)}
}
async function printCommand(id,stage){try{await api('/api/admin/print/command/'+id,{method:'POST',body:JSON.stringify({stage:stage==='paga'?'paga':'conferencia'})});alert(stage==='paga'?'Comprovante enviado para a impressora.':'Conferência enviada para a impressora.');}catch(e){alert('Não foi possível enviar para a impressora: '+e.message)}}
async function confirmOrderPayment(id){if(!confirm('Confirma que o pagamento do pedido #'+id+' foi realmente recebido? Será lançado no caixa e o comprovante será impresso uma única vez.'))return;try{await api('/api/admin/orders/'+id+'/confirm-payment',{method:'POST',body:JSON.stringify({})});await loadOrders();if($('cash').style.display!=='none')await loadCash();alert('Pagamento confirmado e comprovante enviado para a impressora.');}catch(e){alert(e.message)}}
async function printOrderReceipt(id){try{await api('/api/admin/print/order-receipt/'+id,{method:'POST',body:JSON.stringify({})});alert('Comprovante enviado para a impressora.');}catch(e){alert('Não foi possível enviar para a impressora: '+e.message)}}

let customerEditingId=null;
async function loadCustomers(){
 try{
  const rows=await api('/api/admin/customers');
  $('customersList').innerHTML=rows.length?'<div class="table"><table><tr><th>Cliente</th><th>Contato</th><th>Limite total</th><th>Utilizado</th><th>Disponível</th><th>Autorização</th><th>Situação</th><th>Ações</th></tr>'+rows.map(c=>`<tr><td><b>${esc(c.name)}</b><br><span class="small">${esc(c.address||'')}</span></td><td>${esc(c.phone||'-')}</td><td>${money(c.credit_limit)}</td><td>${money(c.credit_used||0)}</td><td><b>${money(c.credit_available===undefined?c.credit_limit:c.credit_available)}</b></td><td>${(c.fiado_authorized===true||c.fiado_authorized===1)?'Autorizado':'Não autorizado'}</td><td>${(c.active===true||c.active===1)?'Ativo':'Inativo'}</td><td><button onclick="editCustomer(${c.id})">Editar</button> <button onclick="showCustomerReceipts(${c.id})">Comprovantes</button></td></tr>`).join('')+'</table></div>':'<p>Nenhum cliente cadastrado ainda.</p>';
 }catch(e){$('customersList').innerHTML='<p>Erro ao carregar clientes: '+esc(e.message)+'</p>'}
}

async function showCustomerReceipts(id){try{const rows=await api('/api/admin/customers/'+id+'/receipts');const customer=(await api('/api/admin/customers')).find(c=>Number(c.id)===Number(id));const html=rows.length?rows.map(r=>`<div style="border:1px solid #b99b5b;border-radius:9px;padding:10px;margin:8px 0"><b>Comanda ${esc(r.payload.command||r.command_id)}</b> · ${esc(r.created_at||'')}<br>Fiado original: <b>${money(r.fiado_amount)}</b><br><button onclick="openCommandDocument(${Number(r.command_id)},'a4')">VER COMANDA A4 / PDF</button> <button onclick="reprintCustomerReceipt(${r.id},${id})">REIMPRIMIR COMPROVANTE</button></div>`).join(''):'<p>Nenhum comprovante individual salvo para este cliente.</p>';const box=document.getElementById('customerReceiptsModal')||document.createElement('div');box.id='customerReceiptsModal';box.style.cssText='position:fixed;inset:0;background:#000b;z-index:99999;display:flex;align-items:center;justify-content:center;padding:15px';box.innerHTML=`<div style="background:#292521;color:#fff;border:1px solid #b99b5b;border-radius:12px;padding:18px;max-width:620px;width:100%;max-height:85vh;overflow:auto"><h2>Comprovantes — ${esc(customer?.name||'Cliente')}</h2>${html}<button onclick="document.getElementById('customerReceiptsModal').remove()">FECHAR</button></div>`;document.body.appendChild(box);}catch(e){alert(e.message)}}
async function reprintCustomerReceipt(receiptId,customerId){try{await api('/api/admin/customers/'+customerId+'/receipts/'+receiptId+'/print',{method:'POST',body:JSON.stringify({})});alert('Comprovante enviado para impressão.')}catch(e){alert(e.message)}}

function clearCustomerForm(){customerEditingId=null;['customerId','customerName','customerPhone','customerAddress','customerNotes'].forEach(id=>$(id).value='');$('customerLimit').value='0';$('customerFiado').checked=false;$('customerActive').checked=true;$('customerSaveBtn').textContent='CADASTRAR CLIENTE';}
async function editCustomer(id){
 try{const rows=await api('/api/admin/customers');const c=rows.find(x=>Number(x.id)===Number(id));if(!c)return;customerEditingId=Number(c.id);$('customerId').value=c.id;$('customerName').value=c.name||'';$('customerPhone').value=c.phone||'';$('customerAddress').value=c.address||'';$('customerLimit').value=Number(c.credit_limit||0);$('customerFiado').checked=c.fiado_authorized===true||c.fiado_authorized===1;$('customerActive').checked=c.active===true||c.active===1;$('customerNotes').value=c.notes||'';$('customerSaveBtn').textContent='SALVAR ALTERAÇÕES';window.scrollTo({top:0,behavior:'smooth'});}catch(e){alert(e.message)}
}
async function saveCustomer(){
 const body={name:$('customerName').value.trim(),phone:$('customerPhone').value.trim(),address:$('customerAddress').value.trim(),credit_limit:$('customerLimit').value||0,fiado_authorized:$('customerFiado').checked,active:$('customerActive').checked,notes:$('customerNotes').value.trim()};
 if(!body.name)return alert('Informe o nome completo do cliente.');
 try{if(customerEditingId)await api('/api/admin/customers/'+customerEditingId,{method:'PUT',body:JSON.stringify(body)});else await api('/api/admin/customers',{method:'POST',body:JSON.stringify(body)});clearCustomerForm();await loadCustomers();await loadCustomerOptions();alert('Cadastro de cliente salvo com sucesso.');}catch(e){alert(e.message)}
}

async function loadFiado(){
 try{
  const [rows,history]=await Promise.all([api('/api/admin/fiado'),api('/api/admin/fiado/history')]);
  $('fiadoList').innerHTML=rows.length?'<div class="table"><table><tr><th>Marcar</th><th>Cliente</th><th>Comanda</th><th>Total original</th><th>Já pago</th><th>Saldo pendente</th><th>Valor deste recebimento (R$)</th></tr>'+rows.map((c,i)=>`<tr><td><input type="checkbox" class="fiadoCheck" data-id="${c.id}" data-customer="${escAttr(c.customer||'')}" data-row="${i}" style="width:auto"></td><td>${esc(c.customer||'Cliente não identificado')}</td><td>${esc(c.number)}</td><td>${money(c.fiado_total||c.total)}</td><td>${money(c.paid)}</td><td><b>${money(c.remaining)}</b></td><td><input type="number" min="0.01" max="${Number(c.remaining).toFixed(2)}" step="0.01" id="fiadoAmount${i}" value="${Number(c.remaining).toFixed(2)}" style="width:125px"></td></tr>`).join('')+'</table></div>':'<p>Nenhuma comanda com fiado pendente.</p>';
  $('fiadoHistory').innerHTML=history.length?'<div class="table"><table><tr><th>Data</th><th>Cliente</th><th>Comanda</th><th>Valor recebido</th><th>Forma</th></tr>'+history.map(h=>`<tr><td>${esc(h.created_at||'-')}</td><td>${esc(h.customer||'-')}</td><td>${esc(h.command_number||h.command_id)}</td><td>${money(h.amount)}</td><td>${esc(h.payment||'-')}</td></tr>`).join('')+'</table></div>':'<p>Nenhum recebimento de fiado registrado ainda.</p>';
 }catch(e){$('fiadoList').innerHTML='<p>Erro ao carregar fiado: '+esc(e.message)+'</p>'}
}
async function receiveFiado(){
 const marked=[...document.querySelectorAll('.fiadoCheck:checked')];
 if(!marked.length)return alert('Marque pelo menos uma comanda pendente.');
 const allocations=marked.map(box=>({command_id:Number(box.dataset.id),customer:box.dataset.customer,amount:Number($('fiadoAmount'+box.dataset.row).value)}));
 if(allocations.some(a=>!Number.isFinite(a.amount)||a.amount<=0))return alert('Informe um valor maior que zero para cada comanda marcada.');
 if(!confirm('Confirma registrar o recebimento parcial ou total destas comandas?'))return;
 try{
  const result=await api('/api/admin/fiado/payments',{method:'POST',body:JSON.stringify({payment:$('fiadoPayment').value,allocations})});
  alert('Recebimento registrado: '+money(result.total)+'. O valor foi lançado no caixa.');
  await Promise.all([loadFiado(),loadCustomers(),loadCommands()]);
  if($('cash').style.display!=='none')await loadCash();
 }catch(e){alert(e.message)}
}

async function loadSandwichCapacity(){
 try{
  const s=await api('/api/admin/sandwich-capacity');
  $('sandwichLimitSetting').value=Number(s.sandwich_limit||10);
  $('sandwichCapacitySummary').textContent=s.sandwich_paused
   ? `PAUSADOS AUTOMATICAMENTE — ${s.sandwich_active_orders} de ${s.sandwich_limit} pedidos em andamento.`
   : `RECEBENDO PEDIDOS — ${s.sandwich_active_orders} de ${s.sandwich_limit} pedidos de sanduíches em andamento.`;
 }catch(e){$('sandwichCapacitySummary').textContent='Não foi possível consultar o limite: '+e.message;}
}
async function saveSandwichCapacity(){
 const value=Number($('sandwichLimitSetting').value);
 if(!Number.isInteger(value)||value<1||value>200)return alert('Informe um limite inteiro entre 1 e 200.');
 try{
  const s=await api('/api/admin/sandwich-capacity',{method:'PUT',body:JSON.stringify({sandwich_limit:value})});
  $('sandwichCapacitySummary').textContent=s.sandwich_paused
   ? `LIMITE SALVO. Sanduíches pausados: ${s.sandwich_active_orders} de ${s.sandwich_limit} pedidos em andamento.`
   : `LIMITE SALVO. ${s.sandwich_active_orders} de ${s.sandwich_limit} pedidos em andamento.`;
  alert('Limite de pedidos de sanduíches salvo com sucesso.');
 }catch(e){alert(e.message);}
}
async function loadSettings(){const s=await api('/api/admin/settings');$('deliverySetting').value=Number(s.delivery_fee||0).toFixed(2);}
async function saveSettings(){const d=await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({delivery_fee:$('deliverySetting').value})});$('settingsMsg').textContent='Taxa de entrega salva: '+money(d.delivery_fee);}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function escAttr(s){return esc(s).replace(/`/g,'&#96;')}


// ===== Fornecedores e entrada de estoque por XML =====
let suppliersCache=[];
let purchaseDraft=null;
async function loadSuppliers(){
  const box=$('suppliersList'); if(box) box.innerHTML='<p>Carregando fornecedores...</p>';
  try{
    suppliersCache=await api('/api/admin/suppliers');
    renderSuppliers(suppliersCache);
  }catch(e){if(box)box.innerHTML='<p>Erro ao carregar fornecedores: '+esc(e.message)+'</p>';}
}
function renderSuppliers(rows){
  const box=$('suppliersList'); if(!box)return;
  box.innerHTML='<div class="table"><table><tr><th>Fornecedor</th><th>CNPJ</th><th>Ações</th></tr>'+
    (rows||[]).map(x=>`<tr><td>${esc(x.name||'')}</td><td>${esc(x.cnpj||'')}</td><td><button type="button" onclick="editSupplier(${Number(x.id)})">Editar</button></td></tr>`).join('')+
    '</table></div>'||'<p>Nenhum fornecedor cadastrado.</p>';
  if(!rows||!rows.length)box.innerHTML='<p>Nenhum fornecedor cadastrado.</p>';
}
function filterSuppliers(){
  const q=String($('supplierSearch')?.value||'').toLowerCase().replace(/\D/g,'') ;
  const term=String($('supplierSearch')?.value||'').toLowerCase().trim();
  renderSuppliers(suppliersCache.filter(x=>String(x.name||'').toLowerCase().includes(term)||String(x.cnpj||'').replace(/\D/g,'').includes(q)));
}
function editSupplier(id){
  const x=suppliersCache.find(v=>Number(v.id)===Number(id));if(!x)return;
  $('supplierEditId').value=x.id;$('supplierName').value=x.name||'';$('supplierCnpj').value=x.cnpj||'';
  $('supplierMsg').textContent='Editando fornecedor. Altere os dados e salve.';
}
function clearSupplierForm(){
  ['supplierEditId','supplierName','supplierCnpj'].forEach(id=>{if($(id))$(id).value='';});
  if($('supplierMsg'))$('supplierMsg').textContent='';
}
async function saveSupplierFromPanel(){
  const id=$('supplierEditId').value;
  const body={name:$('supplierName').value.trim(),cnpj:$('supplierCnpj').value.replace(/\D/g,'')};
  if(!body.name||body.cnpj.length!==14){$('supplierMsg').textContent='Informe a razão social e um CNPJ válido com 14 dígitos.';return;}
  try{
    const d=await api(id?'/api/admin/suppliers/'+id:'/api/admin/suppliers',{method:id?'PUT':'POST',body:JSON.stringify(body)});
    $('supplierMsg').textContent=d.message||'Fornecedor salvo.';
    clearSupplierForm();await loadSuppliers();
  }catch(e){$('supplierMsg').textContent=e.message;}
}
function xmlText(node,tag){
  const el=Array.from(node.getElementsByTagName('*')).find(x=>x.localName===tag);
  return el?String(el.textContent||'').trim():'';
}
function parsePurchaseXml(input){
  const file=input.files&&input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      const doc=new DOMParser().parseFromString(reader.result,'text/xml');
      if(doc.querySelector('parsererror'))throw Error('O arquivo não é um XML válido.');
      const inf=doc.getElementsByTagName('infNFe')[0];if(!inf)throw Error('Não encontrei os dados de uma NF-e neste XML.');
      const ide=doc.getElementsByTagName('ide')[0],emit=doc.getElementsByTagName('emit')[0],total=doc.getElementsByTagName('ICMSTot')[0];
      const key=(inf.getAttribute('Id')||'').replace(/^NFe/,'');
      if(!/^\d{44}$/.test(key))throw Error('Não encontrei a chave de acesso de 44 dígitos. Use o XML autorizado da NF-e.');
      const products=await api('/api/admin/products?type=all');
      const dets=Array.from(doc.getElementsByTagName('det'));
      purchaseDraft={access_key:key,xml_content:String(reader.result||''),invoice_number:xmlText(ide,'nNF'),series:xmlText(ide,'serie'),supplier_name:xmlText(emit,'xNome'),supplier_cnpj:xmlText(emit,'CNPJ')||xmlText(emit,'CPF'),issue_date:xmlText(ide,'dhEmi')||xmlText(ide,'dEmi'),total:Number(xmlText(total,'vNF'))||0,lines:[]};
      purchaseDraft.lines=dets.map((det,i)=>{
        const prod=det.getElementsByTagName('prod')[0],qty=Number(xmlText(prod,'qCom'))||0,unit=xmlText(prod,'uCom')||'un',unitPrice=Number(xmlText(prod,'vUnCom'))||0,lineTotal=Number(xmlText(prod,'vProd'))||qty*unitPrice;
        return {index:i,product_name:xmlText(prod,'xProd'),code:xmlText(prod,'cProd'),barcode:(xmlText(prod,'cEAN')||xmlText(prod,'cEANTrib')||'').replace(/\D/g,''),purchase_qty:qty,purchase_unit:unit,purchase_unit_price:unitPrice,line_total:lineTotal,stock_qty:qty,stock_unit:unit,units_per_pack:detectUnitsPerPack(xmlText(prod,'xProd')+' '+unit),unit_cost:lineTotal/Math.max(1,qty),product_id:'',products};
      });
      for(const line of purchaseDraft.lines){const match=await api('/api/admin/products/xml-match',{method:'POST',body:JSON.stringify({supplier_cnpj:purchaseDraft.supplier_cnpj,supplier_code:line.code,barcode:line.barcode,name:line.product_name})});if(match.found){line.product_id=String(match.product.id);line.match_reason=match.reason;}}
      $('purchaseInvoiceInfo').innerHTML=`<b>NF-e ${esc(purchaseDraft.invoice_number)}</b> · ${esc(purchaseDraft.supplier_name)} · Total: ${money(purchaseDraft.total)}<br><small>Produtos reconhecidos automaticamente aparecem pré-selecionados. Confira todos antes de confirmar.</small>`;
      renderPurchaseLines();$('receivePurchaseBtn').disabled=!purchaseDraft.lines.length;
    }catch(e){purchaseDraft=null;$('receivePurchaseBtn').disabled=true;$('purchaseInvoiceInfo').textContent='Erro ao ler XML: '+e.message;alert(e.message);}
  };
  reader.readAsText(file);
}
function installXmlCompactStyles(){if($('xmlCompactStyles'))return;const s=document.createElement('style');s.id='xmlCompactStyles';s.textContent=`#purchaseInvoiceInfo{padding:8px 10px!important;margin:8px 0!important;font-size:.88rem}#purchaseInvoiceInfo br+*{display:none}.xml-compact-wrap{overflow-x:auto;border:1px solid rgba(255,255,255,.12);border-radius:10px}.xml-compact-table{width:100%;border-collapse:collapse;min-width:850px;font-size:.82rem}.xml-compact-table th,.xml-compact-table td{padding:7px 8px!important;vertical-align:middle;border-bottom:1px solid rgba(255,255,255,.1);white-space:nowrap}.xml-compact-table th{font-size:.72rem;letter-spacing:.03em}.xml-product-desc{white-space:normal!important;min-width:210px;max-width:270px}.xml-product-desc small{display:block;opacity:.72;font-size:.72rem;margin-top:3px}.xml-units-input{width:66px!important;min-width:66px!important;padding:6px!important}.xml-product-select{width:175px!important;min-width:175px!important;padding:6px!important}.xml-register-btn{padding:6px 8px!important;margin-left:4px;font-size:.72rem!important;white-space:nowrap}#purchases>p.muted{display:none}#productFormArea>.hint{display:none}`;document.head.appendChild(s);}
function renderPurchaseLines(){
  installXmlCompactStyles();
  const box=$('purchaseLines');if(!box||!purchaseDraft)return;
  const products=purchaseDraft.lines[0]?.products||[];
  box.innerHTML='<div class="xml-compact-wrap"><table class="xml-compact-table"><thead><tr><th>Produto da nota</th><th>Qtd. embalagens</th><th>Unid./emb.</th><th>Total un.</th><th>Valor total</th><th>Custo/un.</th><th>Produto cadastrado</th></tr></thead><tbody>'+purchaseDraft.lines.map((l,i)=>{
    const packs=Math.max(1,Number(l.purchase_qty)||1),units=Math.max(1,Number(l.units_per_pack)||1),total=packs*units,cost=(Number(l.line_total)||0)/total;
    return `<tr><td class="xml-product-desc"><b>${esc(l.product_name)}</b><small>Cód. ${esc(l.code||'-')} · ${esc(l.purchase_unit||'un')} · ${money(l.purchase_unit_price)} por embalagem</small></td><td>${packs}</td><td><input class="xml-units-input" id="xmlUnitsPerPack_${i}" type="number" min="1" step="1" value="${units}" onchange="setXmlUnitsPerPack(${i},this.value)"></td><td><b id="xmlTotalUnits_${i}">${total}</b></td><td>${money(l.line_total)}</td><td><b id="xmlUnitCost_${i}">${cost.toLocaleString('pt-BR',{minimumFractionDigits:4,maximumFractionDigits:4})}</b></td><td><select class="xml-product-select" id="purchaseProduct_${i}" onchange="setPurchaseLine(${i},'product_id',this.value)"><option value="">Selecione...</option>${products.map(p=>`<option value="${p.id}">${esc(p.internal_code||'')} · ${esc(p.name)}</option>`).join('')}</select><button type="button" class="xml-register-btn" onclick="startXmlProductRegistration(${i})">+ Cadastrar</button></td></tr>`;
  }).join('')+'</tbody></table></div>';
  purchaseDraft.lines.forEach((l,i)=>{const sel=$('purchaseProduct_'+i);if(sel)sel.value=String(l.product_id||'');updateXmlCostPreview(i);});
}
function setPurchaseLine(i,k,v){if(purchaseDraft&&purchaseDraft.lines[i])purchaseDraft.lines[i][k]=k==='stock_qty'?Number(v):v;}
function setXmlUnitsPerPack(i,v){
  if(!purchaseDraft||!purchaseDraft.lines[i])return;
  const totalUnits=Math.max(1,Math.floor(Number(v)||1));
  purchaseDraft.lines[i].units_per_pack=totalUnits;
  updateXmlCostPreview(i);updateXmlMarkup(i);
}
function updateXmlCostPreview(i){
  if(!purchaseDraft||!purchaseDraft.lines[i])return;
  const l=purchaseDraft.lines[i],totalUnits=Math.max(1,Number(l.purchase_qty)||1)*Math.max(1,Number(l.units_per_pack)||1);
  l.stock_qty=totalUnits;l.stock_unit='un';l.unit_cost=(Number(l.line_total)||0)/totalUnits;
  const el=$('xmlUnitCost_'+i);
  if(el)el.textContent=Number(l.unit_cost).toLocaleString('pt-BR',{minimumFractionDigits:4,maximumFractionDigits:4});const totalEl=$('xmlTotalUnits_'+i);if(totalEl)totalEl.textContent=totalUnits;
  const cost=$('newXmlCost_'+i);if(cost&&!cost.dataset.touched)cost.value=l.unit_cost.toFixed(4);
  updateXmlMarkup(i);
}
function updateXmlMarkup(i){
  const cost=Number($('newXmlCost_'+i)?.value||purchaseDraft?.lines[i]?.unit_cost||0);
  const sale=Number($('newXmlPrice_'+i)?.value||0);
  const el=$('newXmlMarkup_'+i);if(!el)return;
  if(cost>0&&sale>0){
    const markup=(sale/cost-1)*100,margin=((sale-cost)/sale)*100;
    el.textContent='Markup: '+markup.toFixed(1)+'% · Margem bruta: '+margin.toFixed(1)+'%';
  }else el.textContent='Markup: — · Margem: —';
}
async function receivePurchaseXml(){
  if(!purchaseDraft)return alert('Carregue primeiro o XML da NF-e.');
  if(purchaseDraft.lines.some(l=>!Number(l.product_id)||!(Number(l.stock_qty)>0)||!String(l.stock_unit||'').trim()))return alert('Vincule todos os itens a um produto cadastrado e confira as quantidades.');
  if(!confirm('Confirma a entrada desta NF-e? O estoque dos produtos vinculados será atualizado.'))return;
  const payload={...purchaseDraft,lines:purchaseDraft.lines.map(({products,index,...l})=>{const product=(products||[]).find(p=>Number(p.id)===Number(l.product_id));const baseUnit=String(product?.unit||l.stock_unit||'un');const received=Math.max(1,Number(l.purchase_qty)||1)*Math.max(1,Number(l.units_per_pack)||1);return {...l,package_qty:Number(l.purchase_qty)||0,package_unit:l.purchase_unit,total_units:received,units_per_pack:Math.max(1,Number(l.units_per_pack)||1),stock_qty:received,stock_unit:baseUnit,unit_cost:(Number(l.line_total)||0)/received}})};
  try{const d=await api('/api/admin/purchases/receive',{method:'POST',body:JSON.stringify(payload)});alert(d.message||'Entrada registrada.');purchaseDraft=null;$('purchaseLines').innerHTML='';$('purchaseInvoiceInfo').textContent='Nota recebida com sucesso.';$('receivePurchaseBtn').disabled=true;await loadPurchaseHistory();await loadProducts();}
  catch(e){alert(e.message);}
}
function danfeText(node,tag){const el=Array.from(node?.getElementsByTagName?.('*')||[]).find(x=>x.localName===tag);return el?String(el.textContent||'').trim():'';}
function danfeMoney(v){return money(Number(v)||0);}
function renderDanfeHtml(inv,lines){
  const raw=String(inv.xml_content||'');
  if(!raw){
    return `<div class="danfe-paper"><div class="danfe-top"><b>DANFE · DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA</b><span>NF-e ${esc(inv.invoice_number||'')} · Série ${esc(inv.series||'')}</span></div><div class="danfe-grid"><section><b>EMITENTE / FORNECEDOR</b><h3>${esc(inv.supplier_name||'Fornecedor não identificado')}</h3><p>CNPJ: ${esc(inv.supplier_cnpj||'Não armazenado')}</p></section><section><b>IDENTIFICAÇÃO DA NOTA</b><p>Número: ${esc(inv.invoice_number||'—')} · Série: ${esc(inv.series||'—')}</p><p>Emissão: ${esc(inv.issue_date||'—')}</p><p>Chave de acesso: ${esc(inv.access_key||'—')}</p></section></div><div class="danfe-total">VALOR TOTAL DA NOTA <strong>${danfeMoney(inv.total)}</strong></div><h4>PRODUTOS / SERVIÇOS</h4>${renderDanfeLines(lines)}<p class="danfe-note">Esta nota foi recebida antes da gravação do XML original no histórico. Os dados fiscais detalhados não estão disponíveis para esta nota antiga.</p></div>`;
  }
  const doc=new DOMParser().parseFromString(raw,'text/xml');
  const by=(parent,tag)=>danfeText(parent,tag);
  const inf=doc.getElementsByTagName('infNFe')[0],ide=doc.getElementsByTagName('ide')[0],emit=doc.getElementsByTagName('emit')[0],dest=doc.getElementsByTagName('dest')[0],total=doc.getElementsByTagName('ICMSTot')[0],transp=doc.getElementsByTagName('transp')[0],pag=doc.getElementsByTagName('pag')[0];
  const addr=(n)=>[by(n,'xLgr'),by(n,'nro'),by(n,'xBairro'),by(n,'xMun'),by(n,'UF'),by(n,'CEP')].filter(Boolean).join(', ');
  const fiscalLines=Array.from(doc.getElementsByTagName('det')).map(d=>{const pr=d.getElementsByTagName('prod')[0],tax=d.getElementsByTagName('imposto')[0];return {code:by(pr,'cProd'),name:by(pr,'xProd'),ncm:by(pr,'NCM'),cfop:by(pr,'CFOP'),unit:by(pr,'uCom'),qty:by(pr,'qCom'),unitPrice:by(pr,'vUnCom'),total:by(pr,'vProd'),tax:tax?by(tax,'vTotTrib'):''};});
  const totals=['vProd','vDesc','vFrete','vSeg','vOutro','vBC','vICMS','vIPI','vPIS','vCOFINS','vNF'].map(k=>[k,by(total,k)]);
  const labels={vProd:'Produtos',vDesc:'Desconto',vFrete:'Frete',vSeg:'Seguro',vOutro:'Outras despesas',vBC:'Base ICMS',vICMS:'ICMS',vIPI:'IPI',vPIS:'PIS',vCOFINS:'COFINS',vNF:'TOTAL DA NOTA'};
  const key=(inf?.getAttribute('Id')||'').replace(/^NFe/,'')||inv.access_key||'';
  return `<div class="danfe-paper"><div class="danfe-top"><b>DANFE</b><span>Documento Auxiliar da Nota Fiscal Eletrônica</span><strong>0 · ENTRADA</strong><span>NF-e ${esc(by(ide,'nNF')||inv.invoice_number)} · Série ${esc(by(ide,'serie')||inv.series)} · Folha 1/1</span></div><div class="danfe-grid"><section><b>IDENTIFICAÇÃO DO EMITENTE</b><h3>${esc(by(emit,'xNome'))}</h3><p>${esc(addr(emit))}</p><p>CNPJ: ${esc(by(emit,'CNPJ')||by(emit,'CPF'))} · IE: ${esc(by(emit,'IE'))}</p><p>Telefone: ${esc(by(emit,'fone'))}</p></section><section><b>CONTROLE DO FISCO</b><div class="danfe-barcode">${esc(key)}</div><p>Chave de acesso: ${esc(key)}</p><p>Protocolo: ${esc(by(doc,'nProt'))}</p></section></div><div class="danfe-grid"><section><b>NATUREZA DA OPERAÇÃO</b><p>${esc(by(ide,'natOp'))}</p><b>DESTINATÁRIO / REMETENTE</b><h3>${esc(by(dest,'xNome'))}</h3><p>CNPJ/CPF: ${esc(by(dest,'CNPJ')||by(dest,'CPF'))}</p><p>${esc(addr(dest))}</p><p>Emissão: ${esc(by(ide,'dhEmi')||by(ide,'dEmi'))}</p></section><section><b>INFORMAÇÕES COMPLEMENTARES</b><p>${esc(by(doc,'infCpl')||'—')}</p><b>TRANSPORTADOR</b><p>${esc(by(transp,'xNome')||'Não informado')}</p></section></div><h4>DADOS DOS PRODUTOS / SERVIÇOS</h4><div class="danfe-table-wrap"><table class="danfe-table"><thead><tr><th>Código</th><th>Descrição</th><th>NCM</th><th>CFOP</th><th>Qtd.</th><th>Un.</th><th>Valor un.</th><th>Valor total</th></tr></thead><tbody>${fiscalLines.map(l=>`<tr><td>${esc(l.code)}</td><td>${esc(l.name)}</td><td>${esc(l.ncm)}</td><td>${esc(l.cfop)}</td><td>${esc(l.qty)}</td><td>${esc(l.unit)}</td><td>${danfeMoney(l.unitPrice)}</td><td>${danfeMoney(l.total)}</td></tr>`).join('')}</tbody></table></div><div class="danfe-totals">${totals.filter(x=>x[1]!==''&&Number(x[1])!==0).map(([k,v])=>`<span>${esc(labels[k])}: <b>${danfeMoney(v)}</b></span>`).join('')}<strong>VALOR TOTAL DA NF-e: ${danfeMoney(by(total,'vNF')||inv.total)}</strong></div><div class="danfe-stock"><b>CONFERÊNCIA DE ESTOQUE</b>${renderDanfeLines(lines)}</div><div class="danfe-foot">Documento de conferência gerado a partir do XML autorizado. Os valores fiscais originais foram preservados.</div></div>`;
}
function renderDanfeLines(lines){return `<div class="danfe-table-wrap"><table class="danfe-table"><thead><tr><th>Produto vinculado</th><th>Qtd. comprada</th><th>Embalagem</th><th>Valor da linha</th><th>Estoque recebido</th><th>Custo unitário</th></tr></thead><tbody>${(lines||[]).map(l=>{const qty=Number(l.stock_qty)||0,cost=qty>0?(Number(l.line_total)||0)/qty:0;return `<tr><td>${esc(l.current_product_name||l.product_name||'Produto')}<small>${esc(l.code||'')}</small></td><td>${esc(l.purchase_qty||0)}</td><td>${esc(l.purchase_unit||'-')}</td><td>${money(l.line_total)}</td><td>${esc(l.stock_qty||0)} ${esc(l.stock_unit||'un')}</td><td>${cost.toLocaleString('pt-BR',{minimumFractionDigits:4,maximumFractionDigits:4})}</td></tr>`}).join('')}</tbody></table></div>`;}
async function togglePurchaseInvoice(id){
  const history=$('purchaseHistory'),detail=$('purchaseInvoiceDetail');
  if(detail){detail.remove();history.style.display='block';return;}
  history.style.display='none';
  let screen=$('purchaseInvoiceScreen');if(!screen){screen=document.createElement('div');screen.id='purchaseInvoiceScreen';screen.className='purchase-invoice-screen';$('purchases').appendChild(screen);}
  screen.style.display='block';screen.innerHTML='<p>Carregando DANFE...</p>';
  try{const data=await api('/api/admin/purchases/'+encodeURIComponent(id));const inv=data.invoice||{},lines=data.lines||[];screen.innerHTML=`<div class="purchase-detail-actions"><button type="button" onclick="closePurchaseInvoice()">← VOLTAR AO HISTÓRICO</button><button type="button" onclick="window.print()">IMPRIMIR / SALVAR PDF</button></div>${renderDanfeHtml(inv,lines)}`;screen.scrollIntoView({behavior:'smooth',block:'start'});}catch(e){screen.innerHTML=`<button onclick="closePurchaseInvoice()">← VOLTAR AO HISTÓRICO</button><p>Não foi possível abrir a nota: ${esc(e.message)}</p>`;}
}
function closePurchaseInvoice(){const screen=$('purchaseInvoiceScreen');if(screen)screen.style.display='none';$('purchaseHistory').style.display='block';$('purchaseHistory').scrollIntoView({behavior:'smooth',block:'start'});}
async function loadPurchaseHistory(){
  try{const invoices=await api('/api/admin/purchases');$('purchaseHistory').innerHTML=(invoices||[]).map(x=>`<button type="button" class="purchase-history-row" data-purchase-row="${x.id}" onclick="togglePurchaseInvoice(${Number(x.id)})"><span><b>${esc(x.supplier_name||'Fornecedor não identificado')}</b><small>${esc(x.issue_date||x.created_at||'')}</small></span><span>NF-e ${esc(x.invoice_number||'—')}</span><strong>${money(x.total)}</strong><span class="purchase-history-open">VER NOTA ▸</span></button>${String(x.invoice_number||'').trim()==='2776027'?`<button type="button" class="purchase-test-reset" onclick="event.stopPropagation();resetTestPurchase2776027()">EXCLUIR LANÇAMENTO DE TESTE</button>`:''}`).join('')||'<p>Nenhuma nota recebida.</p>';const oldScreen=$('purchaseInvoiceScreen');if(oldScreen)oldScreen.style.display='none';$('purchaseHistory').style.display='block';installPurchaseHistoryStyles();}
  catch(e){$('purchaseHistory').innerHTML='<p>Erro ao carregar histórico: '+esc(e.message)+'</p>';}
}

async function resetTestPurchase2776027(){
 if(!confirm('Confirma excluir o lançamento de TESTE da NF-e 2776027 e estornar as quantidades que ela acrescentou ao estoque? Os produtos cadastrados e os vínculos com o fornecedor serão preservados.'))return;
 try{const result=await api('/api/admin/purchases/test-reset/2776027',{method:'DELETE'});alert(result.message||'Lançamento de teste excluído.');await loadPurchaseHistory();await loadProducts();}
 catch(e){alert('Não foi possível excluir o lançamento: '+e.message);}
}
function installPurchaseHistoryStyles(){
  if(document.getElementById('purchaseHistoryStyles'))return;
  const s=document.createElement('style');s.id='purchaseHistoryStyles';
  s.textContent=`#inventoryHistory{display:none!important}#purchases>h3:nth-of-type(2){display:none!important}#purchases{padding:12px!important}#purchases>h2{margin:0 0 8px!important;font-size:1.15rem}#purchases>.row{gap:8px!important;margin:6px 0!important}#purchaseLines{margin-top:6px!important}.xml-compact-table th,.xml-compact-table td{padding:5px 6px!important}.purchase-invoice-screen{margin-top:10px}.purchase-detail-actions{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:8px 0}.danfe-paper{background:#fff;color:#171717;padding:16px;border:1px solid #bbb;border-radius:4px;font:12px Arial,sans-serif}.danfe-top{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;border:2px solid #333;padding:8px;margin-bottom:8px}.danfe-top b{font-size:22px}.danfe-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0}.danfe-grid section{border:1px solid #777;padding:7px;min-width:0}.danfe-grid section>b,.danfe-paper h4{font-size:10px;letter-spacing:.04em}.danfe-paper h3{margin:5px 0;font-size:14px}.danfe-paper p{margin:4px 0;overflow-wrap:anywhere}.danfe-barcode{font-family:monospace;word-break:break-all;padding:8px;background:#f1f1f1}.danfe-table-wrap{overflow:auto}.danfe-table{width:100%;border-collapse:collapse;font-size:10px}.danfe-table th,.danfe-table td{border:1px solid #777;padding:5px;text-align:left;vertical-align:top}.danfe-table small{display:block}.danfe-totals{display:flex;gap:8px;flex-wrap:wrap;border:1px solid #777;padding:8px;margin:8px 0}.danfe-totals span{padding:3px 7px;background:#f3f3f3}.danfe-totals strong{width:100%;text-align:right;font-size:15px}.danfe-stock{margin-top:12px;border-top:2px solid #333;padding-top:8px}.danfe-note,.danfe-foot{font-size:10px;color:#555;margin-top:10px}@media print{body *{visibility:hidden!important}#purchaseInvoiceScreen,#purchaseInvoiceScreen *{visibility:visible!important}#purchaseInvoiceScreen{position:absolute;left:0;top:0;width:100%;margin:0}.purchase-detail-actions{display:none!important}.danfe-paper{border:0;padding:0}}@media(max-width:700px){.danfe-grid{grid-template-columns:1fr}.danfe-paper{padding:8px}.danfe-table{font-size:9px}}.purchase-history-row{display:grid;grid-template-columns:minmax(180px,1.5fr) minmax(90px,.7fr) minmax(90px,.6fr) auto;align-items:center;gap:12px;width:100%;text-align:left;padding:11px 13px;margin:4px 0;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:rgba(255,255,255,.035);color:inherit;cursor:pointer}.purchase-history-row span:first-child{display:flex;flex-direction:column;gap:3px}.purchase-history-row small{opacity:.7}.purchase-history-row strong{white-space:nowrap}.purchase-history-open{font-size:.72rem;opacity:.8;white-space:nowrap}.purchase-test-reset{grid-column:1/-1;justify-self:start;background:#9b2525;color:#fff;border:0;border-radius:6px;padding:7px 10px;font-weight:700;cursor:pointer}@media(max-width:650px){.purchase-history-row{grid-template-columns:1fr auto;gap:6px}.purchase-history-row span:nth-child(2){grid-column:1}.purchase-history-row strong{grid-column:2;grid-row:1}.purchase-history-open{grid-column:2;grid-row:2;text-align:right}}`;
  document.head.appendChild(s);
}


window.addEventListener('popstate',function(event){
  if(xmlReturnLine!==null){returnFromXmlProduct();return;}
  const state=event.state||{};
  if(state.adminPanel&&state.tab){restoringAdminHistory=true;try{tab(state.tab);}finally{restoringAdminHistory=false;}return;}
  /* Mantém o painel como destino seguro: a seta do navegador não deve encerrar a sessão administrativa. */
  if(pass&&$('app')&&$('app').style.display!=='none'){history.pushState({adminPanel:true,tab:activeAdminTab},'',location.href);}
});



// Fichas técnicas — editor flexível de ingredientes, sem linhas predefinidas.
let recipeDraft=[];let recipeCatalog={products:[],ingredients:[]};
async function openTechnicalRecipes(){
  const box=$('technicalRecipeArea');if(!box)return;
  box.style.display='block';$('salesProductArea').style.display='none';$('insumoArea').style.display='none';
  try{const data=await api('/api/admin/recipes');recipeCatalog=data;const sel=$('recipeProduct');sel.innerHTML='<option value="">Selecione o produto final</option>'+data.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');$('recipeIngredient').innerHTML='<option value="">Selecione um insumo</option>'+data.ingredients.map(i=>`<option value="${i.id}" data-unit="${esc(i.unit||'un')}">${esc(i.name)} · ${esc(i.unit||'un')} · estoque ${Number(i.stock||0)}</option>`).join('');$('recipeEditor').innerHTML='<p class="muted">Selecione um produto final para consultar ou montar sua ficha técnica.</p>';}catch(e){$('recipeMsg').textContent=e.message;}
}
async function loadTechnicalRecipe(){const id=Number($('recipeProduct').value);if(!id){recipeDraft=[];$('recipeEditor').innerHTML='';return;}try{const data=await api('/api/admin/recipes?product_id='+id);recipeCatalog.ingredients=data.ingredients;recipeDraft=data.items.map(x=>({ingredient_id:Number(x.ingredient_id),quantity:Number(x.quantity),unit:x.unit,notes:x.notes||''}));renderTechnicalRecipe();}catch(e){$('recipeMsg').textContent=e.message;}}
function addTechnicalRecipeIngredient(){const id=Number($('recipeIngredient').value),ingredient=recipeCatalog.ingredients.find(x=>Number(x.id)===id);if(!ingredient){$('recipeMsg').textContent='Selecione um insumo cadastrado.';return;}if(recipeDraft.some(x=>Number(x.ingredient_id)===id)){ $('recipeMsg').textContent='Este insumo já está na ficha. Altere a quantidade na linha existente.';return;}recipeDraft.push({ingredient_id:id,quantity:0,unit:ingredient.unit||'un',notes:''});renderTechnicalRecipe();}
function renderTechnicalRecipe(){const box=$('recipeEditor');if(!box)return;const ingredients=recipeCatalog.ingredients||[];box.innerHTML=recipeDraft.length?`<div class="table-wrap"><table><thead><tr><th>Ingrediente</th><th>Quantidade por produto</th><th>Unidade</th><th>Custo estimado</th><th></th></tr></thead><tbody>${recipeDraft.map((r,n)=>{const ing=ingredients.find(x=>Number(x.id)===Number(r.ingredient_id))||{};const cost=Number(r.quantity||0)*Number(ing.cost_price||0);return `<tr><td>${esc(ing.name||'Insumo')}</td><td><input type="number" min="0.0001" step="0.0001" value="${Number(r.quantity)||''}" onchange="recipeDraft[${n}].quantity=toNumber(this.value);renderTechnicalRecipe()" style="width:130px"></td><td>${esc(r.unit||ing.unit||'un')}</td><td>${money(cost)}</td><td><button type="button" onclick="recipeDraft.splice(${n},1);renderTechnicalRecipe()">REMOVER</button></td></tr>`}).join('')}</tbody></table></div><div class="hint"><b>Custo estimado da ficha:</b> ${money(recipeDraft.reduce((sum,r)=>{const ing=ingredients.find(x=>Number(x.id)===Number(r.ingredient_id))||{};return sum+Number(r.quantity||0)*Number(ing.cost_price||0)},0))}</div>`:'<p class="muted">Nenhum ingrediente adicionado. Use “Adicionar ingrediente” para começar.</p>';}
async function saveTechnicalRecipe(){const id=Number($('recipeProduct').value);if(!id){$('recipeMsg').textContent='Selecione o produto final.';return;}if(recipeDraft.some(x=>!(Number(x.quantity)>0))){$('recipeMsg').textContent='Informe uma quantidade maior que zero para cada ingrediente.';return;}try{const result=await api('/api/admin/recipes/'+id,{method:'PUT',body:JSON.stringify({items:recipeDraft})});recipeDraft=(result.items||[]).map(x=>({ingredient_id:Number(x.ingredient_id),quantity:Number(x.quantity),unit:x.unit,notes:x.notes||''}));renderTechnicalRecipe();$('recipeMsg').textContent=result.message||'Ficha técnica salva.';}catch(e){$('recipeMsg').textContent=e.message;}}
function closeTechnicalRecipes(){const box=$('technicalRecipeArea');if(box)box.style.display='none';$('salesProductArea').style.display='block';}

// Cadastro funcional de insumos usando o mesmo cadastro de produtos e o mesmo estoque-base.
let cachedInsumos=[];
function setProductMode(mode){
  const sales=$('salesProductArea'),ins=$('insumoArea'),recipes=$('technicalRecipeArea');if(recipes)recipes.style.display='none';
  if(sales)sales.style.display=mode==='venda'?'block':'none';if(ins)ins.style.display=mode==='insumo'?'block':'none';
  $('productModeBtn')?.classList.toggle('primary',mode==='venda');$('insumoModeBtn')?.classList.toggle('primary',mode==='insumo');
  if(mode==='insumo')loadInsumos();else loadProducts();
}
async function loadInsumos(){
 try{cachedInsumos=await api('/api/admin/products?type=insumo');
  const rows=cachedInsumos.map(x=>`<tr><td><b>${esc(x.internal_code||'')}</b></td><td>${esc(x.name)}</td><td>${esc(x.brand||'')}</td><td>${esc(x.unit||'un')}</td><td>${money(x.cost_price)}</td><td>${Number(x.stock||0)} ${esc(x.unit||'un')}</td><td>${Number(x.min_stock||0)}</td><td>${x.active?'Ativo':'Inativo'}</td><td><button type="button" onclick="editInsumo(${Number(x.id)})">Editar</button></td></tr>`).join('');
  $('insumosList').innerHTML='<div class="table"><table><thead><tr><th>Código</th><th>Insumo</th><th>Marca</th><th>Unidade</th><th>Custo por unidade</th><th>Estoque</th><th>Mínimo</th><th>Status</th><th>Ação</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  const suppliers=await api('/api/admin/suppliers').catch(()=>[]);$('insumoSupplier').innerHTML='<option value="">Fornecedor preferencial (opcional)</option>'+suppliers.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
 }catch(e){$('insumoMsg').textContent='Erro ao carregar insumos: '+e.message;}
}
function clearInsumoForm(){['insumoEditId','insumoName','insumoBarcode','insumoBrand','insumoCost','insumoDescription'].forEach(id=>$(id).value='');$('insumoCategory').value='Outros insumos';$('insumoSupplier').value='';$('insumoUnit').value='un';$('insumoStock').value='0';$('insumoMin').value='0';$('insumoSecondaryQty').value='0';$('insumoSecondaryUnit').value='';$('saveInsumoBtn').textContent='CADASTRAR INSUMO';$('insumoMsg').textContent='';}
function editInsumo(id){const p=cachedInsumos.find(x=>Number(x.id)===Number(id));if(!p)return;$('insumoEditId').value=p.id;$('insumoName').value=p.name||'';$('insumoCategory').value=p.category||'Outros insumos';$('insumoSupplier').value=p.supplier_id||'';$('insumoBarcode').value=p.barcode||'';$('insumoBrand').value=p.brand||'';$('insumoUnit').value=p.unit||'un';$('insumoCost').value=p.cost_price||0;$('insumoStock').value=p.stock||0;$('insumoMin').value=p.min_stock||0;$('insumoSecondaryQty').value=p.stock_secondary||0;$('insumoSecondaryUnit').value=p.stock_secondary_unit||'';$('insumoDescription').value=p.description||'';$('saveInsumoBtn').textContent='SALVAR ALTERAÇÕES';$('insumoName').scrollIntoView({behavior:'smooth',block:'center'});}
async function saveInsumo(){const name=$('insumoName').value.trim(),unit=$('insumoUnit').value.trim();if(!name||!unit){$('insumoMsg').textContent='Informe o nome e a unidade-base do insumo.';return;}const payload={name,category:$('insumoCategory').value,description:$('insumoDescription').value,product_type:'insumo',supplier_id:$('insumoSupplier').value||null,barcode:$('insumoBarcode').value,brand:$('insumoBrand').value,unit,cost_price:toNumber($('insumoCost').value),stock:toNumber($('insumoStock').value),min_stock:toNumber($('insumoMin').value),stock_secondary:toNumber($('insumoSecondaryQty').value),stock_secondary_unit:$('insumoSecondaryUnit').value,price:0,active:true};if(![payload.cost_price,payload.stock,payload.min_stock,payload.stock_secondary].every(Number.isFinite)||[payload.cost_price,payload.stock,payload.min_stock,payload.stock_secondary].some(x=>x<0)){$('insumoMsg').textContent='Confira os valores de custo e estoque.';return;}try{const id=Number($('insumoEditId').value);await api(id?'/api/admin/products/'+id:'/api/admin/products',{method:id?'PUT':'POST',body:JSON.stringify(payload)});$('insumoMsg').textContent='Insumo salvo com sucesso.';clearInsumoForm();await loadInsumos();}catch(e){$('insumoMsg').textContent='Não foi possível salvar: '+e.message;}}
