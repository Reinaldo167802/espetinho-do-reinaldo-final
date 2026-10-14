const express=require('express');
const path=require('path');
const crypto=require('crypto');
const app=express();
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));

const PORT=process.env.PORT||3000;
const ADMIN_PASSWORD=String(process.env.SENHA_DE_ADMINISTRADOR||process.env.ADMIN_PASSWORD||'reinaldo123').trim();
const DELIVERY_FEE=Number(process.env.TAXA_ENTREGA||process.env.DELIVERY_FEE||process.env.TAXA_DE_ENTREGA||0);
let db;
let isPg=!!process.env.DATABASE_URL;

function initSqlite(){
 const Database=require('better-sqlite3');
 db=new Database(process.env.SQLITE_PATH||path.join(__dirname,'data.sqlite'));
 db.pragma('journal_mode = WAL');
 const q=(sql)=>db.prepare(sql);
 db.exec(`CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'Outros',description TEXT DEFAULT '',price REAL NOT NULL DEFAULT 0,image TEXT DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,customer_name TEXT NOT NULL,phone TEXT DEFAULT '',type TEXT NOT NULL DEFAULT 'balcao',address TEXT DEFAULT '',payment TEXT DEFAULT '',notes TEXT DEFAULT '',status TEXT NOT NULL DEFAULT 'novo',total REAL NOT NULL DEFAULT 0,command_no TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER,name TEXT NOT NULL,qty REAL NOT NULL,unit_price REAL NOT NULL,total REAL NOT NULL);
 CREATE TABLE IF NOT EXISTS cash(id INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL,description TEXT NOT NULL,value REAL NOT NULL,payment TEXT DEFAULT '',order_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS commands(id INTEGER PRIMARY KEY AUTOINCREMENT,number TEXT UNIQUE NOT NULL,customer TEXT DEFAULT '',status TEXT DEFAULT 'aberta',payment TEXT DEFAULT '',total REAL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,closed_at TEXT);
 CREATE TABLE IF NOT EXISTS command_items(id INTEGER PRIMARY KEY AUTOINCREMENT,command_id INTEGER NOT NULL,product_id INTEGER,name TEXT NOT NULL,qty REAL NOT NULL,unit_price REAL NOT NULL,total REAL NOT NULL);
 CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT DEFAULT '',address TEXT DEFAULT '',credit_limit REAL NOT NULL DEFAULT 0,fiado_authorized INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
 if(q('SELECT COUNT(*) c FROM products').get().c===0){
  const ins=q('INSERT INTO products(name,category,description,price,active) VALUES(?,?,?,?,1)');
  [['Espetinho de Carne','Espetinhos','Espetinho tradicional da casa',10],['Espetinho de Frango','Espetinhos','Temperado da casa',9],['X-Tudo','Hambúrgueres','Hambúrguer completo',25],['Super Espetinho Burguer','Hambúrgueres','Especial da casa',30],['Porção de Tilápia','Porções','Tilápia na panela de pedra',35],['Copa Lombo','Porções','Porção de copa lombo',30],['Pastel frito na hora','Salgados','Consulte sabores',7],['Açaí 300 ml','Açaí','Complementos à parte',10],['Açaí 500 ml','Açaí','Complementos à parte',14],['Suco de laranja 300 ml','Bebidas','Natural',8],['Cerveja Brahma Latão','Bebidas','473 ml',8]].forEach(x=>ins.run(...x));
 }
 return;
}
async function initPg(){
 const {Pool}=require('pg'); db=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('railway')?{rejectUnauthorized:false}:undefined});
 await db.query(`CREATE TABLE IF NOT EXISTS products(id SERIAL PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'Outros',description TEXT DEFAULT '',price NUMERIC(12,2) NOT NULL DEFAULT 0,image TEXT DEFAULT '',active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY,customer_name TEXT NOT NULL,phone TEXT DEFAULT '',type TEXT NOT NULL DEFAULT 'balcao',address TEXT DEFAULT '',payment TEXT DEFAULT '',notes TEXT DEFAULT '',status TEXT NOT NULL DEFAULT 'novo',total NUMERIC(12,2) NOT NULL DEFAULT 0,command_no TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS order_items(id SERIAL PRIMARY KEY,order_id INTEGER NOT NULL,product_id INTEGER,name TEXT NOT NULL,qty NUMERIC(12,2) NOT NULL,unit_price NUMERIC(12,2) NOT NULL,total NUMERIC(12,2) NOT NULL);
 CREATE TABLE IF NOT EXISTS cash(id SERIAL PRIMARY KEY,type TEXT NOT NULL,description TEXT NOT NULL,value NUMERIC(12,2) NOT NULL,payment TEXT DEFAULT '',order_id INTEGER,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS commands(id SERIAL PRIMARY KEY,number TEXT UNIQUE NOT NULL,customer TEXT DEFAULT '',status TEXT DEFAULT 'aberta',payment TEXT DEFAULT '',total NUMERIC(12,2) DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,closed_at TIMESTAMP);
 CREATE TABLE IF NOT EXISTS command_items(id SERIAL PRIMARY KEY,command_id INTEGER NOT NULL,product_id INTEGER,name TEXT NOT NULL,qty NUMERIC(12,2) NOT NULL,unit_price NUMERIC(12,2) NOT NULL,total NUMERIC(12,2) NOT NULL);
 CREATE TABLE IF NOT EXISTS customers(id SERIAL PRIMARY KEY,name TEXT NOT NULL,phone TEXT DEFAULT '',address TEXT DEFAULT '',credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0,fiado_authorized BOOLEAN NOT NULL DEFAULT FALSE,active BOOLEAN NOT NULL DEFAULT TRUE,notes TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
 const c=await db.query('SELECT COUNT(*) c FROM products');
 if(Number(c.rows[0].c)===0){for(const x of [['Espetinho de Carne','Espetinhos','Espetinho tradicional da casa',10],['Espetinho de Frango','Espetinhos','Temperado da casa',9],['X-Tudo','Hambúrgueres','Hambúrguer completo',25],['Super Espetinho Burguer','Hambúrgueres','Especial da casa',30],['Porção de Tilápia','Porções','Tilápia na panela de pedra',35],['Copa Lombo','Porções','Porção de copa lombo',30],['Pastel frito na hora','Salgados','Consulte sabores',7],['Açaí 300 ml','Açaí','Complementos à parte',10],['Açaí 500 ml','Açaí','Complementos à parte',14],['Suco de laranja 300 ml','Bebidas','Natural',8],['Cerveja Brahma Latão','Bebidas','473 ml',8]]) await db.query('INSERT INTO products(name,category,description,price,active) VALUES($1,$2,$3,$4,true)',x);}
}
function auth(req,res,next){const supplied=String(req.headers['x-admin-password']||req.headers['x-senha-admin']||'').trim();if(!supplied||supplied!==ADMIN_PASSWORD)return res.status(401).json({error:'Senha administrativa inválida'});next();}
function normRows(r){return r.rows||r;}
async function q(sql,args=[]){if(isPg)return normRows(await db.query(sql,args)); return db.prepare(sql).all(...args);}
async function one(sql,args=[]){if(isPg){const r=await db.query(sql,args);return r.rows[0];}return db.prepare(sql).get(...args);}
async function run(sql,args=[]){if(isPg){const r=await db.query(sql,args);return {lastID:r.rows[0]?.id,changes:r.rowCount};}const r=db.prepare(sql).run(...args);return {lastID:r.lastInsertRowid,changes:r.changes};}
function placeholders(n,start=1){return Array.from({length:n},(_,i)=>'$'+(i+start)).join(',');}

app.get('/api/health',(req,res)=>res.json({ok:true,version:'4.0.0',database:isPg?'postgres':'sqlite',adminConfigured:Boolean(process.env.SENHA_DE_ADMINISTRADOR||process.env.ADMIN_PASSWORD)}));
app.get('/api/config',(req,res)=>res.json({delivery_fee:DELIVERY_FEE}));
app.get('/api/products',async(req,res)=>{try{const rows=await q('SELECT * FROM products WHERE active = '+(isPg?'true':'1')+' ORDER BY category,name');res.json(rows);}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/admin/products',auth,async(req,res)=>{res.json(await q('SELECT * FROM products ORDER BY category,name'));});
app.post('/api/admin/products',auth,async(req,res)=>{const {name,category='Outros',description='',price=0,image='',active=true}=req.body;if(!name)return res.status(400).json({error:'Nome obrigatório'});const sql=isPg?'INSERT INTO products(name,category,description,price,image,active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *':'INSERT INTO products(name,category,description,price,image,active) VALUES(?,?,?,?,?,?)';const r=await run(sql,[name,category,description,Number(price),image,!!active]);res.json(isPg?r.lastID:await one('SELECT * FROM products WHERE id=?',[r.lastID]));});
app.put('/api/admin/products/:id',auth,async(req,res)=>{const {name,category,description,price,image,active}=req.body;const id=Number(req.params.id);if(isPg){const r=await db.query('UPDATE products SET name=$1,category=$2,description=$3,price=$4,image=$5,active=$6 WHERE id=$7 RETURNING *',[name,category,description,Number(price),image,!!active,id]);return res.json(r.rows[0]);}await run('UPDATE products SET name=?,category=?,description=?,price=?,image=?,active=? WHERE id=?',[name,category,description,Number(price),image,active?1:0,id]);res.json(await one('SELECT * FROM products WHERE id=?',[id]));});
app.delete('/api/admin/products/:id',auth,async(req,res)=>{await run('UPDATE products SET active='+(isPg?'false':'0')+' WHERE id='+(isPg?'$1':'?'),[Number(req.params.id)]);res.json({ok:true});});

app.get('/api/admin/customers',auth,async(req,res)=>{
 try{const rows=await q('SELECT * FROM customers ORDER BY name');res.json(rows)}catch(e){res.status(500).json({error:'Não foi possível carregar os clientes.'})}
});
app.post('/api/admin/customers',auth,async(req,res)=>{
 try{
  const name=String(req.body.name||'').trim();
  const phone=String(req.body.phone||'').trim();
  const address=String(req.body.address||'').trim();
  const notes=String(req.body.notes||'').trim();
  const creditLimit=Number(req.body.credit_limit||0);
  const authorized=!!req.body.fiado_authorized;
  if(!name)return res.status(400).json({error:'Informe o nome do cliente.'});
  if(!Number.isFinite(creditLimit)||creditLimit<0)return res.status(400).json({error:'O limite de fiado deve ser zero ou maior.'});
  const sql=isPg
   ? 'INSERT INTO customers(name,phone,address,credit_limit,fiado_authorized,active,notes) VALUES($1,$2,$3,$4,$5,TRUE,$6) RETURNING *'
   : 'INSERT INTO customers(name,phone,address,credit_limit,fiado_authorized,active,notes) VALUES(?,?,?,?,?,1,?)';
  const result=await run(sql,[name,phone,address,creditLimit,authorized?1:0,notes]);
  const row=isPg?await one('SELECT * FROM customers WHERE id=$1',[result.lastID]):await one('SELECT * FROM customers WHERE id=?',[result.lastID]);
  res.json(row);
 }catch(e){console.error('Erro ao cadastrar cliente:',e);res.status(500).json({error:'Não foi possível cadastrar o cliente.'})}
});
app.put('/api/admin/customers/:id',auth,async(req,res)=>{
 try{
  const id=Number(req.params.id);const name=String(req.body.name||'').trim();
  const phone=String(req.body.phone||'').trim();const address=String(req.body.address||'').trim();const notes=String(req.body.notes||'').trim();
  const creditLimit=Number(req.body.credit_limit||0);const authorized=!!req.body.fiado_authorized;const active=req.body.active!==false;
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Cliente inválido.'});
  if(!name)return res.status(400).json({error:'Informe o nome do cliente.'});
  if(!Number.isFinite(creditLimit)||creditLimit<0)return res.status(400).json({error:'O limite de fiado deve ser zero ou maior.'});
  if(isPg){const r=await db.query('UPDATE customers SET name=$1,phone=$2,address=$3,credit_limit=$4,fiado_authorized=$5,active=$6,notes=$7 WHERE id=$8 RETURNING *',[name,phone,address,creditLimit,authorized,active,notes,id]);if(!r.rows.length)return res.status(404).json({error:'Cliente não encontrado.'});return res.json(r.rows[0]);}
  const r=await run('UPDATE customers SET name=?,phone=?,address=?,credit_limit=?,fiado_authorized=?,active=?,notes=? WHERE id=?',[name,phone,address,creditLimit,authorized?1:0,active?1:0,notes,id]);
  if(!r.changes)return res.status(404).json({error:'Cliente não encontrado.'});res.json(await one('SELECT * FROM customers WHERE id=?',[id]));
 }catch(e){console.error('Erro ao atualizar cliente:',e);res.status(500).json({error:'Não foi possível atualizar o cliente.'})}
});

app.post('/api/orders',async(req,res)=>{try{const {customer_name,phone='',type='balcao',address='',payment='',notes='',items=[]}=req.body;if(!customer_name||!items.length)return res.status(400).json({error:'Nome e itens são obrigatórios'});let total=0,products=[];for(const it of items){const p=await one('SELECT * FROM products WHERE id='+(isPg?'$1':'?'),[Number(it.product_id)]);if(!p||!(p.active===true||p.active===1))return res.status(400).json({error:'Produto indisponível'});const qty=Number(it.qty)||1;const line=Number(p.price)*qty;total+=line;products.push({p,qty,line});}
 const deliveryFee=type==='entrega'?DELIVERY_FEE:0;
 total+=deliveryFee;
 let orderId,commandNo=String(req.body.command_no||'');if(isPg){const r=await db.query('INSERT INTO orders(customer_name,phone,type,address,payment,notes,status,total,command_no) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[customer_name,phone,type,address,payment,notes,'novo',total,commandNo]);orderId=r.rows[0].id;for(const x of products)await db.query('INSERT INTO order_items(order_id,product_id,name,qty,unit_price,total) VALUES($1,$2,$3,$4,$5,$6)',[orderId,x.p.id,x.p.name,x.qty,x.p.price,x.line]);}else{const r=await run('INSERT INTO orders(customer_name,phone,type,address,payment,notes,status,total,command_no) VALUES(?,?,?,?,?,?,?,?,?)',[customer_name,phone,type,address,payment,notes,'novo',total,commandNo]);orderId=r.lastID;for(const x of products)await run('INSERT INTO order_items(order_id,product_id,name,qty,unit_price,total) VALUES(?,?,?,?,?,?)',[orderId,x.p.id,x.p.name,x.qty,x.p.price,x.line]);}
 res.json({ok:true,order_id:orderId,total,delivery_fee:deliveryFee,command_no:commandNo});}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/orders/:id/status',async(req,res)=>{
  try{
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Pedido inválido'});
    const o=await one('SELECT id,customer_name,phone,type,total,status,created_at FROM orders WHERE id='+(isPg?'$1':'?'),[id]);
    if(!o)return res.status(404).json({error:'Pedido não encontrado'});
    res.json({id:o.id,customer_name:o.customer_name,phone:o.phone||'',type:o.type,total:Number(o.total||0),status:o.status,created_at:o.created_at});
  }catch(e){res.status(500).json({error:e.message})}
});
app.get('/api/orders/:id',async(req,res)=>{
  try{
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Pedido inválido'});
    const o=await one('SELECT id,customer_name,phone,type,total,status,created_at FROM orders WHERE id='+(isPg?'$1':'?'),[id]);
    if(!o)return res.status(404).json({error:'Pedido não encontrado'});
    res.json({id:o.id,customer_name:o.customer_name,phone:o.phone||'',type:o.type,total:Number(o.total||0),status:o.status,created_at:o.created_at});
  }catch(e){res.status(500).json({error:e.message})}
});
app.get('/api/admin/orders',auth,async(req,res)=>{const orders=await q('SELECT * FROM orders ORDER BY id DESC');for(const o of orders)o.items=await q('SELECT * FROM order_items WHERE order_id='+(isPg?'$1':'?')+' ORDER BY id',[o.id]);res.json(orders);});
app.put('/api/admin/orders/:id/status',auth,async(req,res)=>{const status=req.body.status;const allowed=['novo','confirmado','preparando','pronto','entregando','finalizado','cancelado'];if(!allowed.includes(status))return res.status(400).json({error:'Status inválido'});await run('UPDATE orders SET status='+(isPg?'$1':'?')+' WHERE id='+(isPg?'$2':'?'),[status,Number(req.params.id)]);if(status==='finalizado'){const o=await one('SELECT * FROM orders WHERE id='+(isPg?'$1':'?'),[Number(req.params.id)]);if(o){const exists=await one('SELECT id FROM cash WHERE description='+(isPg?'$1':'?'),['Pedido #'+o.id]);if(!exists)await run('INSERT INTO cash(type,description,value,payment) VALUES('+(isPg?'$1,$2,$3,$4)':'?,?,?,?)'),['entrada','Pedido #'+o.id,Number(o.total),o.payment||'']);}}res.json({ok:true});});

app.get('/api/admin/cash',auth,async(req,res)=>{
 try{
  // Garante que comandas antigas fechadas no fiado também apareçam no movimento.
  const fiadoCommands=await q("SELECT * FROM commands WHERE status='fechada' AND LOWER(payment)='fiado'");
  for(const command of fiadoCommands){
   const description='Comanda '+command.number+' - Fiado';
   const exists=await one('SELECT id FROM cash WHERE description='+(isPg?'$1':'?'),[description]);
   if(!exists)await run('INSERT INTO cash(type,description,value,payment) VALUES('+(isPg?'$1,$2,$3,$4':'?,?,?,?)'),['fiado',description,Number(command.total)||0,'fiado']);
  }
  // Mantém os lançamentos e os totais históricos existentes para não quebrar a tela atual.
  const rows=await q('SELECT * FROM cash ORDER BY id DESC');
  // Fiado/promissória é pendência, não dinheiro recebido; fica fora das entradas e do saldo.
  const normalizePayment=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]/g,'');
  let totalEntradas=0,totalSaidas=0;
  for(const row of rows){
   const value=Number(row.value)||0;
   if(row.type==='entrada'){
    const payment=normalizePayment(row.payment);
    if(!(payment==='fiado'||payment==='aprazo'||payment.includes('promissoria')))totalEntradas+=value;
   }else if(row.type==='saida')totalSaidas+=value;
  }

  // O dia é calculado no fuso de Brasília, tanto no PostgreSQL quanto no SQLite.
  const todayRows=isPg
   ? await q("SELECT type,value,payment FROM cash WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date")
   : await q("SELECT type,value,payment FROM cash WHERE date(created_at, '-3 hours') = date('now', '-3 hours')");

  const dailyPayments={dinheiro:0,pix:0,debito:0,credito:0,fiado:0,outros:0};
  let todayEntradas=0,todaySaidas=0;
  for(const row of todayRows){
   const value=Number(row.value)||0;
   if(row.type==='fiado'){
    dailyPayments.fiado+=value;
   }else if(row.type==='entrada'){
    const payment=normalizePayment(row.payment);
    const isFiado=payment==='fiado'||payment==='aprazo'||payment.includes('promissoria');
    if(!isFiado)todayEntradas+=value;
    if(payment==='dinheiro'||payment==='cash')dailyPayments.dinheiro+=value;
    else if(payment==='pix')dailyPayments.pix+=value;
    else if(payment==='debito'||payment==='cartaodebito'||payment==='debitoautomatico')dailyPayments.debito+=value;
    else if(payment==='credito'||payment==='cartaocredito')dailyPayments.credito+=value;
    else if(isFiado)dailyPayments.fiado+=value;
    else dailyPayments.outros+=value;
   }else if(row.type==='saida')todaySaidas+=value;
  }
  const today={entradas:todayEntradas,saidas:todaySaidas,saldo:todayEntradas-todaySaidas};
  res.json({
   rows,
   totals:{entradas:totalEntradas,saidas:totalSaidas,saldo:totalEntradas-totalSaidas},
   today,
   dailyPayments,
   paymentTotals:dailyPayments
  });
 }catch(e){res.status(500).json({error:e.message||'Erro ao carregar o caixa'})}
});
app.post('/api/admin/cash',auth,async(req,res)=>{const {type='entrada',description,value,payment=''}=req.body;if(!description||!value)return res.status(400).json({error:'Descrição e valor obrigatórios'});await run('INSERT INTO cash(type,description,value,payment) VALUES('+(isPg?'$1,$2,$3,$4)':'?,?,?,?)'),[type,description,Number(value),payment]);res.json({ok:true});});

app.get('/api/admin/commands',auth,async(req,res)=>{const rows=await q('SELECT * FROM commands ORDER BY id DESC');for(const c of rows)c.items=await q('SELECT * FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[c.id]);res.json(rows);});
app.post('/api/admin/commands',auth,async(req,res)=>{
 try{
  const customer=String(req.body.customer||'').trim();
  const existing=await q('SELECT number FROM commands');
  const numericNumbers=existing.map(c=>String(c.number||'').trim()).filter(n=>/^\d+$/.test(n)).map(Number).filter(Number.isSafeInteger);
  const number=String((numericNumbers.length?Math.max(...numericNumbers):0)+1);
  await run('INSERT INTO commands(number,customer) VALUES('+(isPg?'$1,$2':'?,?')+')',[number,customer]);
  res.json({ok:true,number});
 }catch(e){
  console.error('Erro ao cadastrar comanda automaticamente:',e);
  res.status(500).json({error:'Não foi possível abrir a comanda. Tente novamente.'});
 }
});

app.post('/api/admin/commands/:id/items',auth,async(req,res)=>{
 try{
  const commandId=Number(req.params.id);
  const command=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[commandId]);
  if(!command)return res.status(404).json({error:'Comanda não encontrada'});
  if(command.status!=='aberta')return res.status(400).json({error:'Esta comanda não está aberta'});
  const productId=Number(req.body.product_id);
  const qty=Number(req.body.qty);
  if(!Number.isInteger(productId)||productId<=0||!Number.isFinite(qty)||qty<=0)return res.status(400).json({error:'Produto e quantidade válidos são obrigatórios'});
  const product=await one('SELECT * FROM products WHERE id='+(isPg?'$1':'?'),[productId]);
  if(!product||!(product.active===true||product.active===1))return res.status(400).json({error:'Produto indisponível'});
  const line=Number(product.price)*qty;
  if(isPg){
   await db.query('INSERT INTO command_items(command_id,product_id,name,qty,unit_price,total) VALUES($1,$2,$3,$4,$5,$6)',[commandId,product.id,product.name,qty,Number(product.price),line]);
   await db.query('UPDATE commands SET total=COALESCE(total,0)+$1 WHERE id=$2',[line,commandId]);
  }else{
   await run('INSERT INTO command_items(command_id,product_id,name,qty,unit_price,total) VALUES(?,?,?,?,?,?)',[commandId,product.id,product.name,qty,Number(product.price),line]);
   await run('UPDATE commands SET total=COALESCE(total,0)+? WHERE id=?',[line,commandId]);
  }
  const updated=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[commandId]);
  const items=await q('SELECT * FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[commandId]);
  res.json({ok:true,command:updated,items});
 }catch(e){res.status(500).json({error:e.message||'Erro ao lançar produto na comanda'})}
});

app.put('/api/admin/commands/:id/close',auth,async(req,res)=>{
 try{
  const id=Number(req.params.id);
  const c=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[id]);
  if(!c)return res.status(404).json({error:'Comanda não encontrada'});
  if(c.status==='fechada')return res.status(400).json({error:'Esta comanda já foi fechada'});
  if(!Number(c.total)||Number(c.total)<=0)return res.status(400).json({error:'Lance pelo menos um produto antes de fechar a comanda'});
  const payment=String(req.body.payment||'').trim();
  if(!['pix','dinheiro','debito','credito','fiado'].includes(payment))return res.status(400).json({error:'Escolha uma forma de pagamento válida'});
  await run('UPDATE commands SET status='+(isPg?'$1':'?')+',payment='+(isPg?'$2':'?')+',closed_at=CURRENT_TIMESTAMP WHERE id='+(isPg?'$3':'?'),['fechada',payment,id]);
  const description=payment==='fiado'?'Comanda '+c.number+' - Fiado':'Comanda '+c.number;
  const exists=await one('SELECT id FROM cash WHERE description='+(isPg?'$1':'?'),[description]);
  if(!exists){
   if(payment==='fiado')await run('INSERT INTO cash(type,description,value,payment) VALUES('+(isPg?'$1,$2,$3,$4':'?,?,?,?)'),['fiado',description,Number(c.total),'fiado']);
   else await run('INSERT INTO cash(type,description,value,payment) VALUES('+(isPg?'$1,$2,$3,$4':'?,?,?,?)'),['entrada',description,Number(c.total),payment]);
  }
  const updated=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[id]);
  res.json({ok:true,command:updated});
 }catch(e){res.status(500).json({error:e.message||'Erro ao fechar comanda'})}
});

app.use(express.static(path.join(__dirname,'public')));
app.get('/*splat',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
(async()=>{if(isPg)await initPg();else initSqlite();app.listen(PORT,()=>console.log('Espetinho V4 rodando na porta '+PORT));})().catch(e=>{console.error(e);process.exit(1)});
