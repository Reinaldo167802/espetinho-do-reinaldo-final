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
 CREATE TABLE IF NOT EXISTS command_items(id INTEGER PRIMARY KEY AUTOINCREMENT,command_id INTEGER NOT NULL,product_id INTEGER,name TEXT NOT NULL,qty REAL NOT NULL,unit_price REAL NOT NULL,total REAL NOT NULL);`);
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
 CREATE TABLE IF NOT EXISTS command_items(id SERIAL PRIMARY KEY,command_id INTEGER NOT NULL,product_id INTEGER,name TEXT NOT NULL,qty NUMERIC(12,2) NOT NULL,unit_price NUMERIC(12,2) NOT NULL,total NUMERIC(12,2) NOT NULL);`);
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

app.post('/api/orders',async(req,res)=>{try{const {customer_name,phone='',type='balcao',address='',payment='',notes='',items=[]}=req.body;if(!customer_name||!items.length)return res.status(400).json({error:'Nome e itens são obrigatórios'});let total=0,products=[];for(const it of items){const p=await one('SELECT * FROM products WHERE id='+(isPg?'$1':'?'),[Number(it.product_id)]);if(!p||!(p.active===true||p.active===1))return res.status(400).json({error:'Produto indisponível'});const qty=Number(it.qty)||1;const line=Number(p.price)*qty;total+=line;products.push({p,qty,line});}
 const deliveryFee=type==='entrega'?DELIVERY_FEE:0;
 total+=deliveryFee;
 let orderId,commandNo=String(req.body.command_no||'');if(isPg){const r=await db.query('INSERT INTO orders(customer_name,phone,type,address,payment,notes,status,total,command_no) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[customer_name,phone,type,address,payment,notes,'novo',total,commandNo]);orderId=r.rows[0].id;for(const x of products)await db.query('INSERT INTO order_items(order_id,product_id,name,qty,unit_price,total) VALUES($1,$2,$3,$4,$5,$6)',[orderId,x.p.id,x.p.name,x.qty,x.p.price,x.line]);}else{const r=await run('INSERT INTO orders(customer_name,phone,type,address,payment,notes,status,total,command_no) VALUES(?,?,?,?,?,?,?,?,?)',[customer_name,phone,type,address,payment,notes,'novo',total,commandNo]);orderId=r.lastID;for(const x of products)await run('INSERT INTO order_items(order_id,product_id,name,qty,unit_price,total) VALUES(?,?,?,?,?,?)',[orderId,x.p.id,x.p.name,x.qty,x.p.price,x.line]);}
 res.json({ok:true,order_id:orderId,total,delivery_fee:deliveryFee,command_no:commandNo});}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/admin/orders',auth,async(req,res)=>{const orders=await q('SELECT * FROM orders ORDER BY id DESC');for(const o of orders)o.items=await q('SELECT * FROM order_items WHERE order_id='+(isPg?'$1':'?')+' ORDER BY id',[o.id]);res.json(orders);});
app.put('/api/admin/orders/:id/status',auth,async(req,res)=>{const status=req.body.status;const allowed=['novo','confirmado','preparando','pronto','entregando','finalizado','cancelado'];if(!allowed.includes(status))return res.status(400).json({error:'Status inválido'});await run('UPDATE orders SET status='+(isPg?'$1':'?')+' WHERE id='+(isPg?'$2':'?'),[status,Number(req.params.id)]);if(status==='finalizado'){const o=await one('SELECT * FROM orders WHERE id='+(isPg?'$1':'?'),[Number(req.params.id)]);if(o){const exists=await one('SELECT id FROM cash WHERE description='+(isPg?'$1':'?'),['Pedido #'+o.id]);if(!exists)await run('INSERT INTO cash(type,description,value,payment) VALUES('+(isPg?'$1,$2,$3,$4':'?,?,?,?'),['entrada','Pedido #'+o.id,Number(o.total),o.payment||'']);}}res.json({ok:true});});

app.get('/api/admin/cash',auth,async(req,res)=>{const rows=await q('SELECT * FROM cash ORDER BY id DESC');const totals=await one('SELECT COALESCE(SUM(CASE WHEN type=\'entrada\' THEN value ELSE 0 END),0) entradas, COALESCE(SUM(CASE WHEN type=\'saida\' THEN value ELSE 0 END),0) saidas FROM cash');res.json({rows,totals:{entradas:Number(totals.entradas),saidas:Number(totals.saidas),saldo:Number(totals.entradas)-Number(totals.saidas)}})});
app.post('/api/admin/cash',auth,async(req,res)=>{const {type='entrada',description,value,payment=''}=req.body;if(!description||!value)return res.status(400).json({error:'Descrição e valor obrigatórios'});await run('INSERT INTO cash(type,description,value,payment) VALUES('+(isPg?'$1,$2,$3,$4':'?,?,?,?'),[type,description,Number(value),payment]);res.json({ok:true});});

app.get('/api/admin/commands',auth,async(req,res)=>{const rows=await q('SELECT * FROM commands ORDER BY id DESC');for(const c of rows)c.items=await q('SELECT * FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[c.id]);res.json(rows);});
app.post('/api/admin/commands',auth,async(req,res)=>{let {number,customer=''}=req.body;if(!number)return res.status(400).json({error:'Número da comanda obrigatório'});try{await run('INSERT INTO commands(number,customer) VALUES('+(isPg?'$1,$2':'?,?'),[String(number),customer]);res.json({ok:true});}catch(e){res.status(400).json({error:'Comanda já existe'})}});
app.put('/api/admin/commands/:id/close',auth,async(req,res)=>{const c=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[Number(req.params.id)]);if(!c)return res.status(404).json({error:'Comanda não encontrada'});await run('UPDATE commands SET status='+(isPg?'$1':'?')+',payment='+(isPg?'$2':'?')+',closed_at=CURRENT_TIMESTAMP WHERE id='+(isPg?'$3':'?'),['fechada',req.body.payment||'',Number(req.params.id)]);if(Number(c.total)>0)await run('INSERT INTO cash(type,description,value,payment) VALUES('+(isPg?'$1,$2,$3,$4':'?,?,?,?'),['entrada','Comanda '+c.number,Number(c.total),req.body.payment||'']);res.json({ok:true});});

app.use(express.static(path.join(__dirname,'public')));
app.get('/*splat',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
(async()=>{if(isPg)await initPg();else initSqlite();app.listen(PORT,()=>console.log('Espetinho V4 rodando na porta '+PORT));})().catch(e=>{console.error(e);process.exit(1)});
