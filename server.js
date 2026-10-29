// ESPETINHO DO REINALDO — integração fornecedores + insumos + entrada XML — V4 2026-10-29
const express=require('express');
const path=require('path');
const crypto=require('crypto');
const app=express();
app.use(express.json({limit:'8mb'}));
app.use(express.urlencoded({extended:true}));

const PORT=process.env.PORT||3000;
const ADMIN_PASSWORD=String(process.env.SENHA_DE_ADMINISTRADOR||process.env.ADMIN_PASSWORD||'reinaldo123').trim();
const DELIVERY_FEE=Number(process.env.TAXA_ENTREGA||process.env.DELIVERY_FEE||process.env.TAXA_DE_ENTREGA||0);
const PRINTER_BRIDGE_TOKEN=String(process.env.PRINTER_BRIDGE_TOKEN||'').trim();
let db;
let isPg=!!process.env.DATABASE_URL;

function initSqlite(){
 const Database=require('better-sqlite3');
 db=new Database(process.env.SQLITE_PATH||path.join(__dirname,'data.sqlite'));
 db.pragma('journal_mode = WAL');
 const q=(sql)=>db.prepare(sql);
 db.exec(`CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'Outros',description TEXT DEFAULT '',price REAL NOT NULL DEFAULT 0,image TEXT DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP,barcode TEXT DEFAULT '',brand TEXT DEFAULT '',unit TEXT DEFAULT 'un',cost_price REAL DEFAULT 0,stock REAL DEFAULT 0,min_stock REAL DEFAULT 0,prepare_kitchen INTEGER NOT NULL DEFAULT 0,product_type TEXT NOT NULL DEFAULT 'venda',supplier_id INTEGER);
 CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,customer_name TEXT NOT NULL,phone TEXT DEFAULT '',type TEXT NOT NULL DEFAULT 'balcao',address TEXT DEFAULT '',payment TEXT DEFAULT '',notes TEXT DEFAULT '',status TEXT NOT NULL DEFAULT 'novo',total REAL NOT NULL DEFAULT 0,command_no TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER,name TEXT NOT NULL,qty REAL NOT NULL,unit_price REAL NOT NULL,total REAL NOT NULL);
 CREATE TABLE IF NOT EXISTS cash(id INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL,description TEXT NOT NULL,value REAL NOT NULL,payment TEXT DEFAULT '',order_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS commands(id INTEGER PRIMARY KEY AUTOINCREMENT,number TEXT UNIQUE NOT NULL,customer TEXT DEFAULT '',status TEXT DEFAULT 'aberta',payment TEXT DEFAULT '',total REAL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,closed_at TEXT);
 CREATE TABLE IF NOT EXISTS command_items(id INTEGER PRIMARY KEY AUTOINCREMENT,command_id INTEGER NOT NULL,product_id INTEGER,name TEXT NOT NULL,qty REAL NOT NULL,unit_price REAL NOT NULL,total REAL NOT NULL);
 CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT DEFAULT '',address TEXT DEFAULT '',credit_limit REAL NOT NULL DEFAULT 0,fiado_authorized INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS fiado_payments(id INTEGER PRIMARY KEY AUTOINCREMENT,command_id INTEGER NOT NULL,customer TEXT NOT NULL,amount REAL NOT NULL,payment TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS print_jobs(id INTEGER PRIMARY KEY AUTOINCREMENT,job_key TEXT UNIQUE NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,claimed_at TEXT,printed_at TEXT,last_error TEXT);
 CREATE TABLE IF NOT EXISTS suppliers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,cnpj TEXT UNIQUE NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS purchase_invoices(id INTEGER PRIMARY KEY AUTOINCREMENT,access_key TEXT UNIQUE NOT NULL,invoice_number TEXT DEFAULT '',series TEXT DEFAULT '',supplier_name TEXT DEFAULT '',supplier_cnpj TEXT DEFAULT '',issue_date TEXT DEFAULT '',total REAL NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS purchase_invoice_lines(id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER NOT NULL,product_id INTEGER,product_name TEXT NOT NULL,code TEXT DEFAULT '',purchase_qty REAL DEFAULT 0,purchase_unit TEXT DEFAULT '',purchase_unit_price REAL DEFAULT 0,line_total REAL DEFAULT 0,stock_qty REAL DEFAULT 0,stock_unit TEXT DEFAULT 'un',secondary_qty REAL DEFAULT 0,secondary_unit TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS inventory_movements(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,invoice_id INTEGER,quantity REAL NOT NULL,unit TEXT DEFAULT 'un',secondary_quantity REAL DEFAULT 0,secondary_unit TEXT DEFAULT '',cost_total REAL DEFAULT 0,description TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
 // Migração segura dos campos usados pelo painel de produtos.
 const productCols=db.prepare('PRAGMA table_info(products)').all().map(c=>c.name);
 for(const [col,def] of [['stock_secondary','REAL DEFAULT 0'],['stock_secondary_unit',"TEXT DEFAULT ''"],['product_type',"TEXT NOT NULL DEFAULT 'venda'"],['supplier_id','INTEGER'],['barcode',"TEXT DEFAULT ''"],['brand',"TEXT DEFAULT ''"],['unit',"TEXT DEFAULT 'un'"],['cost_price','REAL DEFAULT 0'],['stock','REAL DEFAULT 0'],['min_stock','REAL DEFAULT 0'],['prepare_kitchen','INTEGER NOT NULL DEFAULT 0'],['print_site','INTEGER NOT NULL DEFAULT 1'],['print_command','INTEGER NOT NULL DEFAULT 0']]) if(!productCols.includes(col)) db.exec(`ALTER TABLE products ADD COLUMN ${col} ${def}`);
 db.exec('UPDATE products SET print_command=prepare_kitchen WHERE print_command=0 AND prepare_kitchen=1');
 const orderCols=db.prepare('PRAGMA table_info(orders)').all().map(c=>c.name); if(!orderCols.includes('payment_confirmed')) db.exec('ALTER TABLE orders ADD COLUMN payment_confirmed INTEGER NOT NULL DEFAULT 0');
 // Migração segura: bancos antigos podem ter fiado_payments sem a coluna customer.
 const fiadoCols=db.prepare('PRAGMA table_info(fiado_payments)').all().map(c=>c.name);
 if(!fiadoCols.includes('customer')) db.exec("ALTER TABLE fiado_payments ADD COLUMN customer TEXT NOT NULL DEFAULT ''");
 if(q('SELECT COUNT(*) c FROM products').get().c===0){
  const ins=q('INSERT INTO products(name,category,description,price,active) VALUES(?,?,?,?,1)');
  [['Espetinho de Carne','Espetinhos','Espetinho tradicional da casa',10],['Espetinho de Frango','Espetinhos','Temperado da casa',9],['X-Tudo','Hambúrgueres','Hambúrguer completo',25],['Super Espetinho Burguer','Hambúrgueres','Especial da casa',30],['Porção de Tilápia','Porções','Tilápia na panela de pedra',35],['Copa Lombo','Porções','Porção de copa lombo',30],['Pastel frito na hora','Salgados','Consulte sabores',7],['Açaí 300 ml','Açaí','Complementos à parte',10],['Açaí 500 ml','Açaí','Complementos à parte',14],['Suco de laranja 300 ml','Bebidas','Natural',8],['Cerveja Brahma Latão','Bebidas','473 ml',8]].forEach(x=>ins.run(...x));
 }
 return;
}
async function initPg(){
 const {Pool}=require('pg'); db=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('railway')?{rejectUnauthorized:false}:undefined});
 await db.query(`CREATE TABLE IF NOT EXISTS products(id SERIAL PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'Outros',description TEXT DEFAULT '',price NUMERIC(12,2) NOT NULL DEFAULT 0,image TEXT DEFAULT '',active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,barcode TEXT DEFAULT '',brand TEXT DEFAULT '',unit TEXT DEFAULT 'un',cost_price NUMERIC(12,2) DEFAULT 0,stock NUMERIC(12,3) DEFAULT 0,min_stock NUMERIC(12,3) DEFAULT 0,prepare_kitchen BOOLEAN NOT NULL DEFAULT FALSE,product_type TEXT NOT NULL DEFAULT 'venda',supplier_id INTEGER);
 CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY,customer_name TEXT NOT NULL,phone TEXT DEFAULT '',type TEXT NOT NULL DEFAULT 'balcao',address TEXT DEFAULT '',payment TEXT DEFAULT '',notes TEXT DEFAULT '',status TEXT NOT NULL DEFAULT 'novo',total NUMERIC(12,2) NOT NULL DEFAULT 0,command_no TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS order_items(id SERIAL PRIMARY KEY,order_id INTEGER NOT NULL,product_id INTEGER,name TEXT NOT NULL,qty NUMERIC(12,2) NOT NULL,unit_price NUMERIC(12,2) NOT NULL,total NUMERIC(12,2) NOT NULL);
 CREATE TABLE IF NOT EXISTS cash(id SERIAL PRIMARY KEY,type TEXT NOT NULL,description TEXT NOT NULL,value NUMERIC(12,2) NOT NULL,payment TEXT DEFAULT '',order_id INTEGER,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS commands(id SERIAL PRIMARY KEY,number TEXT UNIQUE NOT NULL,customer TEXT DEFAULT '',status TEXT DEFAULT 'aberta',payment TEXT DEFAULT '',total NUMERIC(12,2) DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,closed_at TIMESTAMP);
 CREATE TABLE IF NOT EXISTS command_items(id SERIAL PRIMARY KEY,command_id INTEGER NOT NULL,product_id INTEGER,name TEXT NOT NULL,qty NUMERIC(12,2) NOT NULL,unit_price NUMERIC(12,2) NOT NULL,total NUMERIC(12,2) NOT NULL);
 CREATE TABLE IF NOT EXISTS customers(id SERIAL PRIMARY KEY,name TEXT NOT NULL,phone TEXT DEFAULT '',address TEXT DEFAULT '',credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0,fiado_authorized BOOLEAN NOT NULL DEFAULT FALSE,active BOOLEAN NOT NULL DEFAULT TRUE,notes TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS fiado_payments(id SERIAL PRIMARY KEY,command_id INTEGER NOT NULL,customer TEXT NOT NULL,amount NUMERIC(12,2) NOT NULL,payment TEXT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
 await db.query("CREATE TABLE IF NOT EXISTS print_jobs(id SERIAL PRIMARY KEY,job_key TEXT UNIQUE NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,claimed_at TIMESTAMP,printed_at TIMESTAMP,last_error TEXT)");
 await db.query("CREATE TABLE IF NOT EXISTS suppliers(id SERIAL PRIMARY KEY,name TEXT NOT NULL,cnpj TEXT UNIQUE NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
 await db.query("CREATE TABLE IF NOT EXISTS purchase_invoices(id SERIAL PRIMARY KEY,access_key TEXT UNIQUE NOT NULL,invoice_number TEXT DEFAULT '',series TEXT DEFAULT '',supplier_name TEXT DEFAULT '',supplier_cnpj TEXT DEFAULT '',issue_date TEXT DEFAULT '',total NUMERIC(12,2) NOT NULL DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
 await db.query("CREATE TABLE IF NOT EXISTS purchase_invoice_lines(id SERIAL PRIMARY KEY,invoice_id INTEGER NOT NULL,product_id INTEGER,product_name TEXT NOT NULL,code TEXT DEFAULT '',purchase_qty NUMERIC(12,4) DEFAULT 0,purchase_unit TEXT DEFAULT '',purchase_unit_price NUMERIC(12,4) DEFAULT 0,line_total NUMERIC(12,2) DEFAULT 0,stock_qty NUMERIC(12,4) DEFAULT 0,stock_unit TEXT DEFAULT 'un',secondary_qty NUMERIC(12,4) DEFAULT 0,secondary_unit TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
 await db.query("CREATE TABLE IF NOT EXISTS inventory_movements(id SERIAL PRIMARY KEY,product_id INTEGER NOT NULL,invoice_id INTEGER,quantity NUMERIC(12,4) NOT NULL,unit TEXT DEFAULT 'un',secondary_quantity NUMERIC(12,4) DEFAULT 0,secondary_unit TEXT DEFAULT '',cost_total NUMERIC(12,2) DEFAULT 0,description TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_secondary NUMERIC(12,4) DEFAULT 0");
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_secondary_unit TEXT DEFAULT ''");

 // Migração segura dos campos usados pelo painel de produtos.
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT DEFAULT ''");
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT ''");
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'un'");
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT 0');
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS stock NUMERIC(12,3) DEFAULT 0');
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock NUMERIC(12,3) DEFAULT 0');
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS prepare_kitchen BOOLEAN NOT NULL DEFAULT FALSE');
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS print_site BOOLEAN NOT NULL DEFAULT TRUE');
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS print_command BOOLEAN NOT NULL DEFAULT FALSE');
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'venda'");
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INTEGER');
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_secondary NUMERIC(12,4) DEFAULT 0');
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_secondary_unit TEXT DEFAULT ''");
 await db.query('UPDATE products SET print_command=prepare_kitchen WHERE print_command=FALSE AND prepare_kitchen=TRUE');
 // Migração segura para instalações PostgreSQL já existentes.
 await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed BOOLEAN NOT NULL DEFAULT FALSE');
 await db.query("ALTER TABLE fiado_payments ADD COLUMN IF NOT EXISTS customer TEXT NOT NULL DEFAULT ''");
 const c=await db.query('SELECT COUNT(*) c FROM products');
 if(Number(c.rows[0].c)===0){for(const x of [['Espetinho de Carne','Espetinhos','Espetinho tradicional da casa',10],['Espetinho de Frango','Espetinhos','Temperado da casa',9],['X-Tudo','Hambúrgueres','Hambúrguer completo',25],['Super Espetinho Burguer','Hambúrgueres','Especial da casa',30],['Porção de Tilápia','Porções','Tilápia na panela de pedra',35],['Copa Lombo','Porções','Porção de copa lombo',30],['Pastel frito na hora','Salgados','Consulte sabores',7],['Açaí 300 ml','Açaí','Complementos à parte',10],['Açaí 500 ml','Açaí','Complementos à parte',14],['Suco de laranja 300 ml','Bebidas','Natural',8],['Cerveja Brahma Latão','Bebidas','473 ml',8]]) await db.query('INSERT INTO products(name,category,description,price,active) VALUES($1,$2,$3,$4,true)',x);}
}
function auth(req,res,next){const supplied=String(req.headers['x-admin-password']||req.headers['x-senha-admin']||'').trim();if(!supplied||supplied!==ADMIN_PASSWORD)return res.status(401).json({error:'Senha administrativa inválida'});next();}
function normRows(r){return r.rows||r;}
async function q(sql,args=[]){if(isPg)return normRows(await db.query(sql,args)); return db.prepare(sql).all(...args);}
async function one(sql,args=[]){if(isPg){const r=await db.query(sql,args);return r.rows[0];}return db.prepare(sql).get(...args);}
async function run(sql,args=[]){if(isPg){const r=await db.query(sql,args.map(v=>v===undefined?null:v));return {lastID:r.rows[0]?.id,changes:r.rowCount};}const safeArgs=args.map(v=>v===undefined?null:(typeof v==='boolean'?(v?1:0):(typeof v==='number'&&!Number.isFinite(v)?null:v)));const r=db.prepare(sql).run(...safeArgs);return {lastID:r.lastInsertRowid,changes:r.changes};}
function placeholders(n,start=1){return Array.from({length:n},(_,i)=>'$'+(i+start)).join(',');}
function productNumber(v){if(v===undefined||v===null||String(v).trim()==='')return 0;if(typeof v==='number')return Number.isFinite(v)?v:NaN;const s=String(v).trim().replace(/\s/g,'').replace(',','.');return Number(s);}

app.get('/api/health',(req,res)=>res.json({ok:true,version:'4.0.0',database:isPg?'postgres':'sqlite',adminConfigured:Boolean(process.env.SENHA_DE_ADMINISTRADOR||process.env.ADMIN_PASSWORD)}));
async function enqueuePrint(jobKey,kind,payload){try{const key=String(jobKey),printPayload={companyName:'ESPETINHO DO REINALDO',cnpj:'48.508.407/0001-50',...payload},data=JSON.stringify(printPayload);if(isPg)await db.query('INSERT INTO print_jobs(job_key,kind,payload) VALUES($1,$2,$3) ON CONFLICT(job_key) DO NOTHING',[key,kind,data]);else await run('INSERT OR IGNORE INTO print_jobs(job_key,kind,payload) VALUES(?,?,?)',[key,kind,data]);}catch(e){console.error('Falha ao criar trabalho de impressão:',e)}}
function bridgeAuth(req,res,next){if(!PRINTER_BRIDGE_TOKEN)return res.status(503).json({error:'PRINTER_BRIDGE_TOKEN não configurado no servidor'});if(String(req.headers['x-printer-token']||'')!==PRINTER_BRIDGE_TOKEN)return res.status(401).json({error:'Token da impressora inválido'});next()}
app.get('/api/printer/next',bridgeAuth,async(req,res)=>{try{let job;if(isPg){const r=await db.query("UPDATE print_jobs SET status='printing',attempts=attempts+1,claimed_at=CURRENT_TIMESTAMP WHERE id=(SELECT id FROM print_jobs WHERE status='pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *");job=r.rows[0]}else{const candidate=await one("SELECT * FROM print_jobs WHERE status='pending' ORDER BY id LIMIT 1");if(candidate){await run("UPDATE print_jobs SET status='printing',attempts=attempts+1,claimed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'",[candidate.id]);job=await one("SELECT * FROM print_jobs WHERE id=? AND status='printing'",[candidate.id])}}if(!job)return res.status(204).end();res.json({...job,payload:JSON.parse(job.payload)})}catch(e){console.error('Fila de impressão:',e);res.status(500).json({error:'Falha ao consultar fila'})}});
app.post('/api/printer/:id/ack',bridgeAuth,async(req,res)=>{try{const id=Number(req.params.id),ok=req.body.ok===true,status=ok?'printed':'pending',error=String(req.body.error||'').slice(0,500);if(isPg)await db.query('UPDATE print_jobs SET status=$1,printed_at=CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE printed_at END,last_error=$3 WHERE id=$4',[status,ok,error,id]);else await run('UPDATE print_jobs SET status=?,printed_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE printed_at END,last_error=? WHERE id=?',[status,ok?1:0,error,id]);res.json({ok:true})}catch(e){res.status(500).json({error:'Falha ao confirmar impressão'})}});
app.post('/api/admin/print/command/:id',auth,async(req,res)=>{try{const id=Number(req.params.id),c=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[id]);if(!c)return res.status(404).json({error:'Comanda não encontrada'});const items=await q('SELECT * FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[id]);const stage=String(req.body.stage||'conferencia');const key='command-'+(stage==='paga'?'receipt':'bill')+'-'+id+'-'+Date.now();await enqueuePrint(key,stage==='paga'?'receipt':'bill',{title:stage==='paga'?'COMPROVANTE DE VENDA':'CONFERÊNCIA DE CONTA',stage,command:c.number,customer:c.customer||'',items,total:Number(c.total||0),payment:c.payment||'Pendente',created_at:c.closed_at||c.created_at});res.json({ok:true})}catch(e){console.error(e);res.status(500).json({error:'Não foi possível enfileirar a impressão'})}});
app.post('/api/admin/print/order-receipt/:id',auth,async(req,res)=>{try{const id=Number(req.params.id),o=await one('SELECT * FROM orders WHERE id='+(isPg?'$1':'?'),[id]);if(!o)return res.status(404).json({error:'Pedido não encontrado'});if(!(o.payment_confirmed===true||o.payment_confirmed===1))return res.status(400).json({error:'Confirme o recebimento do pagamento antes de imprimir o comprovante.'});const items=await q('SELECT * FROM order_items WHERE order_id='+(isPg?'$1':'?')+' ORDER BY id',[id]);const subtotal=items.reduce((sum,it)=>sum+Number(it.total||0),0);await enqueuePrint('receipt-order-paid-'+id,'receipt',{title:'COMPROVANTE DE VENDA — PAGAMENTO CONFIRMADO',order:id,customer:o.customer_name,type:o.type,address:o.address,notes:o.notes,items,subtotal,delivery_fee:Math.max(0,Number(o.total||0)-subtotal),total:Number(o.total||0),payment:o.payment||'',created_at:o.created_at});res.json({ok:true})}catch(e){console.error(e);res.status(500).json({error:'Não foi possível enfileirar o comprovante'})}});
app.get('/api/config',(req,res)=>res.json({delivery_fee:DELIVERY_FEE}));
app.get('/api/products',async(req,res)=>{try{const rows=await q('SELECT * FROM products WHERE active = '+(isPg?'true':'1')+" AND COALESCE(product_type,'venda') <> 'insumo' ORDER BY category,name");res.json(rows);}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/admin/suppliers',auth,async(req,res)=>{try{res.json(await q('SELECT * FROM suppliers ORDER BY name'))}catch(e){console.error(e);res.status(500).json({error:'Não foi possível carregar fornecedores.'})}});
app.post('/api/admin/suppliers',auth,async(req,res)=>{try{const name=String(req.body.name||'').trim(),cnpj=String(req.body.cnpj||'').replace(/\D/g,'');if(!name||cnpj.length!==14)return res.status(400).json({error:'Informe a razão social e um CNPJ válido com 14 dígitos.'});let row;if(isPg){const r=await db.query('INSERT INTO suppliers(name,cnpj) VALUES($1,$2) ON CONFLICT(cnpj) DO UPDATE SET name=EXCLUDED.name RETURNING *',[name,cnpj]);row=r.rows[0]}else{await run('INSERT INTO suppliers(name,cnpj) VALUES(?,?) ON CONFLICT(cnpj) DO UPDATE SET name=excluded.name',[name,cnpj]);row=await one('SELECT * FROM suppliers WHERE cnpj=?',[cnpj])}res.json({ok:true,supplier:row,message:'Fornecedor cadastrado/atualizado.'})}catch(e){console.error(e);res.status(500).json({error:'Não foi possível cadastrar o fornecedor.'})}});
app.put('/api/admin/suppliers/:id',auth,async(req,res)=>{try{const id=Number(req.params.id),name=String(req.body.name||'').trim(),cnpj=String(req.body.cnpj||'').replace(/\D/g,'');if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'Fornecedor inválido.'});if(!name||cnpj.length!==14)return res.status(400).json({error:'Informe a razão social e um CNPJ válido com 14 dígitos.'});let result;if(isPg){result=await db.query('UPDATE suppliers SET name=$1,cnpj=$2 WHERE id=$3 RETURNING *',[name,cnpj,id]);if(!result.rows[0])return res.status(404).json({error:'Fornecedor não encontrado.'});res.json({ok:true,supplier:result.rows[0],message:'Fornecedor atualizado com sucesso.'});}else{const existing=await one('SELECT id FROM suppliers WHERE id=?',[id]);if(!existing)return res.status(404).json({error:'Fornecedor não encontrado.'});await run('UPDATE suppliers SET name=?,cnpj=? WHERE id=?',[name,cnpj,id]);res.json({ok:true,supplier:await one('SELECT * FROM suppliers WHERE id=?',[id]),message:'Fornecedor atualizado com sucesso.'});}}catch(e){if(String(e.message||'').toLowerCase().includes('unique')||String(e.message||'').toLowerCase().includes('duplicate'))return res.status(409).json({error:'Já existe outro fornecedor cadastrado com esse CNPJ.'});console.error(e);res.status(500).json({error:'Não foi possível atualizar o fornecedor.'})}});
app.get('/api/admin/purchases',auth,async(req,res)=>{try{res.json(await q('SELECT * FROM purchase_invoices ORDER BY id DESC LIMIT 100'))}catch(e){console.error(e);res.status(500).json({error:'Não foi possível carregar as notas de compra.'})}});
app.get('/api/admin/inventory/movements',auth,async(req,res)=>{try{res.json(await q('SELECT m.*,p.name AS current_product_name FROM inventory_movements m LEFT JOIN products p ON p.id=m.product_id ORDER BY m.id DESC LIMIT 200'))}catch(e){console.error(e);res.status(500).json({error:'Não foi possível carregar o histórico do estoque.'})}});
app.post('/api/admin/purchases/receive',auth,async(req,res)=>{try{
 const b=req.body||{}, key=String(b.access_key||'').trim(), lines=Array.isArray(b.lines)?b.lines:[];
 if(!key||!/^\d{44}$/.test(key))return res.status(400).json({error:'A chave de acesso da NF-e deve conter 44 dígitos.'});
 if(!lines.length)return res.status(400).json({error:'A nota não possui itens para receber.'});
 if(await one('SELECT id FROM purchase_invoices WHERE access_key='+(isPg?'$1':'?'),[key]))return res.status(409).json({error:'Esta nota fiscal já foi recebida. O estoque não foi alterado.'});
 for(const l of lines){if(!Number.isInteger(Number(l.product_id))||Number(l.product_id)<=0||!Number.isFinite(Number(l.stock_qty))||Number(l.stock_qty)<=0||!String(l.stock_unit||'').trim())return res.status(400).json({error:'Confira todos os produtos vinculados e as quantidades de entrada antes de confirmar.'});}
 let invoiceId;const inv={access_key:key,invoice_number:String(b.invoice_number||''),series:String(b.series||''),supplier_name:String(b.supplier_name||''),supplier_cnpj:String(b.supplier_cnpj||''),issue_date:String(b.issue_date||''),total:Number(b.total||0)};
 const supplierCnpj=String(inv.supplier_cnpj||'').replace(/\D/g,'');if(inv.supplier_name&&supplierCnpj.length===14){if(isPg)await db.query('INSERT INTO suppliers(name,cnpj) VALUES($1,$2) ON CONFLICT(cnpj) DO UPDATE SET name=EXCLUDED.name',[inv.supplier_name,supplierCnpj]);else await run('INSERT INTO suppliers(name,cnpj) VALUES(?,?) ON CONFLICT(cnpj) DO UPDATE SET name=excluded.name',[inv.supplier_name,supplierCnpj]);}
 if(isPg){const r=await db.query('INSERT INTO purchase_invoices(access_key,invoice_number,series,supplier_name,supplier_cnpj,issue_date,total) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[inv.access_key,inv.invoice_number,inv.series,inv.supplier_name,inv.supplier_cnpj,inv.issue_date,inv.total]);invoiceId=r.rows[0].id;}else{const r=await run('INSERT INTO purchase_invoices(access_key,invoice_number,series,supplier_name,supplier_cnpj,issue_date,total) VALUES(?,?,?,?,?,?,?)',[inv.access_key,inv.invoice_number,inv.series,inv.supplier_name,inv.supplier_cnpj,inv.issue_date,inv.total]);invoiceId=r.lastID;}
 for(const l of lines){const pid=Number(l.product_id),sq=Number(l.stock_qty),sec=Number(l.secondary_qty||0),cost=Number(l.line_total||0),unit=String(l.stock_unit||'un'),secUnit=String(l.secondary_unit||'');const prod=await one('SELECT * FROM products WHERE id='+(isPg?'$1':'?'),[pid]);if(!prod)throw new Error('Produto vinculado não encontrado (ID '+pid+').');
 if(isPg){await db.query(`UPDATE products SET stock=COALESCE(stock,0)+$1,unit=$2,stock_secondary=COALESCE(stock_secondary,0)+$3,stock_secondary_unit=CASE WHEN $4 <> '' THEN $4 ELSE stock_secondary_unit END,cost_price=$5 WHERE id=$6`,[sq,unit,sec,secUnit,cost/sq,pid]);await db.query('INSERT INTO purchase_invoice_lines(invoice_id,product_id,product_name,code,purchase_qty,purchase_unit,purchase_unit_price,line_total,stock_qty,stock_unit,secondary_qty,secondary_unit) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[invoiceId,pid,String(l.product_name||prod.name),String(l.code||''),Number(l.purchase_qty||0),String(l.purchase_unit||''),Number(l.purchase_unit_price||0),cost,sq,unit,sec,secUnit]);await db.query('INSERT INTO inventory_movements(product_id,invoice_id,quantity,unit,secondary_quantity,secondary_unit,cost_total,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[pid,invoiceId,sq,unit,sec,secUnit,cost,'Entrada NF-e '+inv.invoice_number+' — '+inv.supplier_name]);}
 else{await run(`UPDATE products SET stock=COALESCE(stock,0)+?,unit=?,stock_secondary=COALESCE(stock_secondary,0)+?,stock_secondary_unit=CASE WHEN ? <> '' THEN ? ELSE stock_secondary_unit END,cost_price=? WHERE id=?`,[sq,unit,sec,secUnit,secUnit,cost/sq,pid]);await run('INSERT INTO purchase_invoice_lines(invoice_id,product_id,product_name,code,purchase_qty,purchase_unit,purchase_unit_price,line_total,stock_qty,stock_unit,secondary_qty,secondary_unit) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[invoiceId,pid,String(l.product_name||prod.name),String(l.code||''),Number(l.purchase_qty||0),String(l.purchase_unit||''),Number(l.purchase_unit_price||0),cost,sq,unit,sec,secUnit]);await run('INSERT INTO inventory_movements(product_id,invoice_id,quantity,unit,secondary_quantity,secondary_unit,cost_total,description) VALUES(?,?,?,?,?,?,?,?)',[pid,invoiceId,sq,unit,sec,secUnit,cost,'Entrada NF-e '+inv.invoice_number+' — '+inv.supplier_name]);}
 }
 res.json({ok:true,invoice_id:invoiceId,received_lines:lines.length,message:'Nota recebida e estoque atualizado.'});
 }catch(e){console.error('Erro ao receber NF-e:',e);res.status(500).json({error:'Falha ao receber a nota. Confira o histórico antes de tentar novamente: '+e.message})}});
app.get('/api/admin/products',auth,async(req,res)=>{try{const type=String(req.query.type||'venda');const where=type==='all'?'':' WHERE COALESCE(product_type,\'venda\') = '+(type==='insumo'?"'insumo'":"'venda'");res.json(await q('SELECT * FROM products'+where+' ORDER BY category,name'));}catch(e){res.status(500).json({error:'Não foi possível carregar os produtos.'});}});
app.get('/api/admin/products/barcode/:barcode/lookup',auth,async(req,res)=>{
 try{
  const barcode=String(req.params.barcode||'').replace(/\D/g,'');
  if(!barcode) return res.status(400).json({found:false,message:'Digite um código de barras válido.'});
  // Primeiro procura no cadastro local para reaproveitar os dados já salvos.
  const local=await one('SELECT * FROM products WHERE barcode='+(isPg?'$1':'?')+' LIMIT 1',[barcode]);
  if(local) return res.json({found:true,source:'local',name:local.name,brand:local.brand,category:local.category,unit:local.unit,description:local.description,image:local.image});
  // Consulta externa Open Food Facts. A base é colaborativa e pode não conter todos os produtos.
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),7000);
  try{
   const response=await fetch('https://world.openfoodfacts.org/api/v2/product/'+encodeURIComponent(barcode)+'.json',{headers:{'User-Agent':'EspetinhoDoReinaldo/1.0 (product catalog)'},signal:controller.signal});
   clearTimeout(timeout);
   if(!response.ok) return res.json({found:false,message:'A base externa não respondeu agora. Você pode preencher o cadastro manualmente.'});
   const result=await response.json();
   const x=result && result.status===1 ? result.product : null;
   if(!x) return res.json({found:false,message:'Produto não encontrado na base externa. Preencha os dados manualmente.'});
   const category=String(x.categories||'').split(',')[0].trim()||'Outros';
   const quantity=String(x.quantity||'').trim();
   const unitMatch=quantity.match(/(kg|g|mg|l|ml|un|unidade|unidades)\b/i);
   const unit=unitMatch?unitMatch[1].toLowerCase():'un';
   return res.json({found:true,source:'openfoodfacts',name:String(x.product_name_pt||x.product_name||x.product_name_en||'').trim(),brand:String(x.brands||'').split(',')[0].trim(),category,unit,description:String(x.generic_name_pt||x.generic_name||quantity||'').trim(),image:String(x.image_front_url||x.image_url||'').trim(),quantity});
  }catch(ex){clearTimeout(timeout);return res.json({found:false,message:'Não foi possível consultar a base externa agora. O cadastro manual continua disponível.'});}
 }catch(e){console.error('Erro na consulta do código de barras:',e);res.status(500).json({found:false,error:'Falha ao consultar o código de barras.'});}
});
app.post('/api/admin/products',auth,async(req,res)=>{try{const b=req.body||{};const name=String(b.name||'').trim();if(!name)return res.status(400).json({error:'Nome obrigatório'});const data={name,category:String(b.category||'Outros'),description:String(b.description||''),product_type:b.product_type==='insumo'?'insumo':'venda',supplier_id:b.supplier_id?Number(b.supplier_id):null,stock_secondary:productNumber(b.stock_secondary),stock_secondary_unit:String(b.stock_secondary_unit||''),price:productNumber(b.price),image:String(b.image||''),active:isPg?(b.active!==false):(b.active!==false?1:0),barcode:String(b.barcode||'').trim(),brand:String(b.brand||''),unit:String(b.unit||'un'),cost_price:productNumber(b.cost_price),stock:productNumber(b.stock),min_stock:productNumber(b.min_stock),prepare_kitchen:isPg?!!(b.print_command??b.prepare_kitchen):(b.print_command??b.prepare_kitchen?1:0),print_site:isPg?(b.print_site!==false):(b.print_site!==false?1:0),print_command:isPg?!!(b.print_command??b.prepare_kitchen):(b.print_command??b.prepare_kitchen?1:0)};if(![data.price,data.cost_price,data.stock,data.min_stock].every(Number.isFinite))return res.status(400).json({error:'Preço e estoque devem ser números válidos.'});const cols=Object.keys(data);const vals=Object.values(data);const sql=isPg?`INSERT INTO products(${cols.join(',')}) VALUES(${cols.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`:`INSERT INTO products(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`;const r=await run(sql,vals);const row=isPg?await one('SELECT * FROM products WHERE id=$1',[r.lastID]):await one('SELECT * FROM products WHERE id=?',[r.lastID]);res.json(row);}catch(e){console.error('Erro ao cadastrar produto:',e);res.status(500).json({error:'Não foi possível cadastrar o produto.'});}});
app.put('/api/admin/products/:id',auth,async(req,res)=>{try{const id=Number(req.params.id);const b=req.body||{};const name=String(b.name||'').trim();if(!name)return res.status(400).json({error:'Nome obrigatório'});const existingProduct=await one('SELECT product_type FROM products WHERE id='+(isPg?'$1':'?'),[id]);if(!existingProduct)return res.status(404).json({error:'Produto não encontrado.'});const data={name,category:String(b.category||'Outros'),description:String(b.description||''),product_type:b.product_type==='insumo'?'insumo':(b.product_type==='venda'?'venda':(existingProduct.product_type||'venda')),supplier_id:b.supplier_id?Number(b.supplier_id):null,stock_secondary:productNumber(b.stock_secondary),stock_secondary_unit:String(b.stock_secondary_unit||''),price:productNumber(b.price),image:String(b.image||''),active:isPg?(b.active!==false):(b.active!==false?1:0),barcode:String(b.barcode||'').trim(),brand:String(b.brand||''),unit:String(b.unit||'un'),cost_price:productNumber(b.cost_price),stock:productNumber(b.stock),min_stock:productNumber(b.min_stock),prepare_kitchen:isPg?!!(b.print_command??b.prepare_kitchen):(b.print_command??b.prepare_kitchen?1:0),print_site:isPg?(b.print_site!==false):(b.print_site!==false?1:0),print_command:isPg?!!(b.print_command??b.prepare_kitchen):(b.print_command??b.prepare_kitchen?1:0)};const cols=Object.keys(data);const vals=Object.values(data);if(isPg){const sets=cols.map((c,i)=>c+'=$'+(i+1)).join(',');const r=await db.query(`UPDATE products SET ${sets} WHERE id=$${cols.length+1} RETURNING *`,[...vals,id]);if(!r.rows.length)return res.status(404).json({error:'Produto não encontrado.'});return res.json(r.rows[0]);}await run(`UPDATE products SET ${cols.map(c=>c+'=?').join(',')} WHERE id=?`,[...vals,id]);const row=await one('SELECT * FROM products WHERE id=?',[id]);if(!row)return res.status(404).json({error:'Produto não encontrado.'});res.json(row);}catch(e){console.error('Erro ao atualizar produto:',e);res.status(500).json({error:'Não foi possível atualizar o produto.'});}});


// Desativação segura de produto: mantém o cadastro e o histórico, mas remove do cardápio público.
async function deactivateProductById(id,res){
 try{
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Produto inválido.'});
  let result;
  if(isPg){
   result=await db.query('UPDATE products SET active=FALSE WHERE id=$1 RETURNING *',[id]);
   if(!result.rows.length)return res.status(404).json({error:'Produto não encontrado.'});
   return res.json({ok:true,message:'Produto desativado.',product:result.rows[0]});
  }
  result=await run('UPDATE products SET active=0 WHERE id=?',[id]);
  if(!result.changes)return res.status(404).json({error:'Produto não encontrado.'});
  const product=await one('SELECT * FROM products WHERE id=?',[id]);
  return res.json({ok:true,message:'Produto desativado.',product});
 }catch(e){
  console.error('Erro ao desativar produto:',e);
  return res.status(500).json({error:'Não foi possível desativar o produto.'});
 }
}
// Compatível com botões que enviam DELETE, PATCH ou PUT parcial para desativar.
app.delete('/api/admin/products/:id',auth,async(req,res)=>deactivateProductById(Number(req.params.id),res));
app.patch('/api/admin/products/:id',auth,async(req,res)=>{
 const active=req.body?.active;
 if(active===false || active===0 || String(active).toLowerCase()==='false' || String(active)==='0')
  return deactivateProductById(Number(req.params.id),res);
 return res.status(400).json({error:'Esta rota aceita somente a desativação do produto.'});
});
app.put('/api/admin/products/:id/active',auth,async(req,res)=>{
 const active=req.body?.active;
 if(active===false || active===0 || String(active).toLowerCase()==='false' || String(active)==='0')
  return deactivateProductById(Number(req.params.id),res);
 return res.status(400).json({error:'Informe active=false para desativar o produto.'});
});

app.get('/api/admin/customers',auth,async(req,res)=>{
 try{
  const rows=await q('SELECT * FROM customers ORDER BY name');
  const debts=await q("SELECT * FROM commands WHERE status='fechada' AND LOWER(payment)='fiado'");
  for(const customer of rows){
   let used=0;
   for(const debt of debts){
    if(String(debt.customer||'').trim().toLocaleLowerCase('pt-BR')===String(customer.name||'').trim().toLocaleLowerCase('pt-BR')){
     const payments=await q('SELECT amount FROM fiado_payments WHERE command_id='+(isPg?'$1':'?'),[debt.id]);
     used+=Math.max(0,Number(debt.total||0)-payments.reduce((s,p)=>s+Number(p.amount||0),0));
    }
   }
   customer.credit_used=Math.round(used*100)/100;
   customer.credit_available=Math.max(0,Math.round((Number(customer.credit_limit||0)-used)*100)/100);
  }
  res.json(rows)
 }catch(e){console.error('Erro ao carregar clientes:',e);res.status(500).json({error:'Não foi possível carregar os clientes.'})}
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
 // Pedido feito pelo site: imprimir TODOS os itens para produção e separação, inclusive bebidas e produtos prontos.
 const orderPrintItems=products.filter(x=>x.p.print_site===true||x.p.print_site===1||x.p.print_site===undefined||x.p.print_site===null).map(x=>({name:x.p.name,qty:x.qty,unit_price:Number(x.p.price),total:x.line}));
 if(orderPrintItems.length)await enqueuePrint('site-order-'+orderId,'kitchen',{title:'PEDIDO DO SITE — PRODUÇÃO E SEPARAÇÃO',order:orderId,customer:customer_name,phone,type,address,notes,items:orderPrintItems,subtotal:products.reduce((s,x)=>s+x.line,0),delivery_fee:deliveryFee,total,created_at:new Date().toISOString()});
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
    const o=await one('SELECT id,customer_name,phone,type,payment,total,status,created_at FROM orders WHERE id='+(isPg?'$1':'?'),[id]);
    if(!o)return res.status(404).json({error:'Pedido não encontrado'});
    const rows=await q('SELECT name,qty,unit_price,total FROM order_items WHERE order_id='+(isPg?'$1':'?')+' ORDER BY id',[id]);
    const items=rows.map(it=>({name:it.name,qty:Number(it.qty),unit_price:Number(it.unit_price),total:Number(it.total)}));
    const subtotal=Math.round(items.reduce((sum,it)=>sum+it.total,0)*100)/100;
    const total=Number(o.total||0);
    res.json({id:o.id,customer_name:o.customer_name,phone:o.phone||'',type:o.type,payment:o.payment||'',total,status:o.status,created_at:o.created_at,items,subtotal,delivery_fee:Math.max(0,Math.round((total-subtotal)*100)/100)});
  }catch(e){res.status(500).json({error:e.message})}
});
app.get('/api/admin/orders',auth,async(req,res)=>{const orders=await q('SELECT * FROM orders ORDER BY id DESC');for(const o of orders)o.items=await q('SELECT * FROM order_items WHERE order_id='+(isPg?'$1':'?')+' ORDER BY id',[o.id]);res.json(orders);});
app.put('/api/admin/orders/:id/status',auth,async(req,res)=>{try{const status=req.body.status;const allowed=['novo','confirmado','preparando','pronto','entregando','finalizado','cancelado'];if(!allowed.includes(status))return res.status(400).json({error:'Status inválido'});const id=Number(req.params.id);await run('UPDATE orders SET status='+(isPg?'$1':'?')+' WHERE id='+(isPg?'$2':'?'),[status,id]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/admin/orders/:id/confirm-payment',auth,async(req,res)=>{try{const id=Number(req.params.id);const o=await one('SELECT * FROM orders WHERE id='+(isPg?'$1':'?'),[id]);if(!o)return res.status(404).json({error:'Pedido não encontrado'});if(o.payment_confirmed===true||o.payment_confirmed===1)return res.json({ok:true,already_confirmed:true});await run('UPDATE orders SET payment_confirmed='+(isPg?'TRUE':'1')+' WHERE id='+(isPg?'$1':'?'),[id]);const exists=await one('SELECT id FROM cash WHERE description='+(isPg?'$1':'?'),['Pedido #'+o.id]);if(!exists)await run('INSERT INTO cash(type,description,value,payment,order_id) VALUES('+(isPg?'$1,$2,$3,$4,$5':'?,?,?,?,?')+')',['entrada','Pedido #'+o.id,Number(o.total),o.payment||'',id]);const items=await q('SELECT * FROM order_items WHERE order_id='+(isPg?'$1':'?')+' ORDER BY id',[id]);const subtotal=items.reduce((sum,it)=>sum+Number(it.total||0),0);const fee=Math.max(0,Number(o.total||0)-subtotal);await enqueuePrint('receipt-order-paid-'+o.id,'receipt',{title:'COMPROVANTE DE VENDA — PAGAMENTO CONFIRMADO',order:o.id,customer:o.customer_name,type:o.type,address:o.address,notes:o.notes,items,subtotal,delivery_fee:fee,total:Number(o.total||0),payment:o.payment||'',created_at:o.created_at});res.json({ok:true});}catch(e){console.error(e);res.status(500).json({error:'Não foi possível confirmar o pagamento'});}});

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
  if(product.print_command===true||product.print_command===1||((product.print_command===undefined||product.print_command===null)&&(product.prepare_kitchen===true||product.prepare_kitchen===1))){const last=await one('SELECT * FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id DESC LIMIT 1',[commandId]);if(last)await enqueuePrint('kitchen-command-item-'+last.id,'kitchen',{title:'COMANDA — COZINHA',command:command.number,customer:command.customer||'',items:[{name:product.name,qty,total:line}],created_at:new Date().toISOString()});}
  const updated=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[commandId]);
  const items=await q('SELECT * FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[commandId]);
  res.json({ok:true,command:updated,items});
 }catch(e){res.status(500).json({error:e.message||'Erro ao lançar produto na comanda'})}
});


// Remove um produto somente de uma comanda que ainda está aberta.
app.delete('/api/admin/commands/:id/items/:itemId',auth,async(req,res)=>{
 try{
  const commandId=Number(req.params.id);
  const itemId=Number(req.params.itemId);
  if(!Number.isInteger(commandId)||commandId<=0||!Number.isInteger(itemId)||itemId<=0)
   return res.status(400).json({error:'Comanda ou item inválido.'});
  const command=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[commandId]);
  if(!command)return res.status(404).json({error:'Comanda não encontrada.'});
  if(command.status!=='aberta')return res.status(400).json({error:'Só é possível excluir produtos de comandas abertas.'});
  const item=await one('SELECT * FROM command_items WHERE id='+(isPg?'$1':'?')+' AND command_id='+(isPg?'$2':'?'),[itemId,commandId]);
  if(!item)return res.status(404).json({error:'Este produto não pertence a esta comanda ou já foi excluído.'});
  await run('DELETE FROM command_items WHERE id='+(isPg?'$1':'?')+' AND command_id='+(isPg?'$2':'?'),[itemId,commandId]);
  const sumRows=await q('SELECT COALESCE(SUM(total),0) AS total FROM command_items WHERE command_id='+(isPg?'$1':'?'),[commandId]);
  const total=Math.round(Number(sumRows[0]?.total||0)*100)/100;
  await run('UPDATE commands SET total='+(isPg?'$1':'?')+' WHERE id='+(isPg?'$2':'?'),[total,commandId]);
  const updated=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[commandId]);
  const items=await q('SELECT * FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[commandId]);
  res.json({ok:true,message:'Produto excluído e total recalculado.',command:updated,items});
 }catch(e){
  console.error('Erro ao excluir item da comanda:',e);
  res.status(500).json({error:'Não foi possível excluir o produto da comanda.'});
 }
});


async function fiadoCommandRows(){
 const commands=await q("SELECT * FROM commands WHERE status='fechada' AND LOWER(payment)='fiado' ORDER BY id DESC");
 const out=[];
 for(const c of commands){
  const paidRows=await q('SELECT amount FROM fiado_payments WHERE command_id='+(isPg?'$1':'?'),[c.id]);
  const paid=paidRows.reduce((s,x)=>s+Number(x.amount||0),0);
  const remaining=Math.max(0,Math.round((Number(c.total||0)-paid)*100)/100);
  if(remaining>0.001)out.push({...c,paid,remaining});
 }
 return out;
}
app.get('/api/admin/fiado',auth,async(req,res)=>{
 try{
  const rows=await fiadoCommandRows();
  res.json(rows);
 }catch(e){console.error('Erro ao carregar fiado:',e);res.status(500).json({error:'Não foi possível carregar os fiados.'})}
});
app.get('/api/admin/fiado/history',auth,async(req,res)=>{
 try{
  const rows=await q('SELECT * FROM fiado_payments ORDER BY id DESC');
  for(const row of rows){const c=await one('SELECT number FROM commands WHERE id='+(isPg?'$1':'?'),[row.command_id]);row.command_number=c?.number||String(row.command_id);}
  res.json(rows);
 }catch(e){res.status(500).json({error:'Não foi possível carregar o histórico de recebimentos.'})}
});
app.post('/api/admin/fiado/payments',auth,async(req,res)=>{
 try{
  const payment=String(req.body.payment||'').trim().toLowerCase();
  const allocations=Array.isArray(req.body.allocations)?req.body.allocations:[];
  if(!['pix','dinheiro','debito','credito'].includes(payment))return res.status(400).json({error:'Escolha uma forma de recebimento válida.'});
  if(!allocations.length)return res.status(400).json({error:'Marque pelo menos uma comanda e informe o valor recebido.'});
  const prepared=[];
  let customerKey='';
  for(const a of allocations){
   const commandId=Number(a.command_id), amount=Math.round(Number(a.amount)*100)/100;
   if(!Number.isInteger(commandId)||commandId<=0||!Number.isFinite(amount)||amount<=0)return res.status(400).json({error:'Informe um valor maior que zero para cada comanda marcada.'});
   const c=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[commandId]);
   if(!c||c.status!=='fechada'||String(c.payment||'').toLowerCase()!=='fiado')return res.status(400).json({error:'Uma das comandas selecionadas não está pendente no fiado.'});
   const key=String(c.customer||'').trim().toLocaleLowerCase('pt-BR');
   if(!key)return res.status(400).json({error:'A comanda '+c.number+' não tem cliente cadastrado vinculado.'});
   if(customerKey&&customerKey!==key)return res.status(400).json({error:'Para registrar um recebimento conjunto, selecione comandas do mesmo cliente.'});
   customerKey=key;
   const prev=await q('SELECT amount FROM fiado_payments WHERE command_id='+(isPg?'$1':'?'),[commandId]);
   const paid=prev.reduce((s,x)=>s+Number(x.amount||0),0);
   const remaining=Math.round((Number(c.total||0)-paid)*100)/100;
   if(amount>remaining+0.001)return res.status(400).json({error:'O valor destinado à comanda '+c.number+' é maior que o saldo pendente ('+remaining.toFixed(2)+').'});
   prepared.push({c,amount,remaining});
  }
  const total=prepared.reduce((s,x)=>s+x.amount,0);
  for(const x of prepared){
   await run('INSERT INTO fiado_payments(command_id,customer,amount,payment) VALUES('+(isPg?'$1,$2,$3,$4':'?,?,?,?')+')',[x.c.id,String(x.c.customer||'').trim(),x.amount,payment]);
   const left=Math.max(0,Math.round((x.remaining-x.amount)*100)/100);
   const description='Recebimento fiado - Cliente: '+String(x.c.customer||'').trim()+' - Comanda '+x.c.number+(left<=0.001?' - Quitada':' - Parcial');
   await run('INSERT INTO cash(type,description,value,payment) VALUES('+(isPg?'$1,$2,$3,$4':'?,?,?,?')+')',['entrada',description,x.amount,payment]);
  }
  res.json({ok:true,total,commands:prepared.map(x=>({number:x.c.number,amount:x.amount}))});
 }catch(e){console.error('Erro ao registrar recebimento de fiado:',e);res.status(500).json({error:'Não foi possível registrar o recebimento.'})}
});

app.put('/api/admin/commands/:id/close',auth,async(req,res)=>{
 try{
  const id=Number(req.params.id);
  const c=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[id]);
  if(!c)return res.status(404).json({error:'Comanda não encontrada'});
  if(c.status==='fechada')return res.status(400).json({error:'Esta comanda já foi fechada'});
  if(!Number(c.total)||Number(c.total)<=0)return res.status(400).json({error:'Lance pelo menos um produto antes de fechar a comanda'});
  const payment=String(req.body.payment||'pendente').trim().toLowerCase();
  if(!['pendente','pix','dinheiro','debito','credito','fiado'].includes(payment))return res.status(400).json({error:'Escolha uma forma de pagamento válida'});
  if(payment==='fiado'){
   const customerName=String(c.customer||'').trim();
   if(!customerName)return res.status(400).json({error:'Selecione um cliente cadastrado para vender no fiado.'});
   const customerRows=await q('SELECT * FROM customers ORDER BY id');
   const customer=customerRows.find(x=>String(x.name||'').trim().toLocaleLowerCase('pt-BR')===customerName.toLocaleLowerCase('pt-BR'));
   if(!customer)return res.status(400).json({error:'Este cliente não está cadastrado. Cadastre ou selecione um cliente antes de vender no fiado.'});
   const yes=v=>v===true||v===1||String(v).toLowerCase()==='true';
   if(!yes(customer.active))return res.status(400).json({error:'Este cliente está inativo e não pode comprar no fiado.'});
   if(!yes(customer.fiado_authorized))return res.status(400).json({error:'Este cliente não está autorizado a comprar no fiado.'});
   const debts=await q("SELECT * FROM commands WHERE status='fechada' AND LOWER(payment)='fiado'");let used=0;
   for(const debt of debts){if(String(debt.customer||'').trim().toLocaleLowerCase('pt-BR')===customerName.toLocaleLowerCase('pt-BR')){const pays=await q('SELECT amount FROM fiado_payments WHERE command_id='+(isPg?'$1':'?'),[debt.id]);used+=Math.max(0,Number(debt.total||0)-pays.reduce((sum,p)=>sum+Number(p.amount||0),0));}}
   const available=Math.round((Number(customer.credit_limit||0)-used)*100)/100;
   if(Number(c.total)>available+0.001)return res.status(400).json({error:'Limite de fiado insuficiente. Limite: '+Number(customer.credit_limit||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+'; utilizado: '+used.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+'; disponível: '+Math.max(0,available).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+'.'});
  }
  await run('UPDATE commands SET status='+(isPg?'$1':'?')+',payment='+(isPg?'$2':'?')+',closed_at=CURRENT_TIMESTAMP WHERE id='+(isPg?'$3':'?'),['fechada',payment,id]);
  const description=payment==='fiado'?'Comanda '+c.number+' - Fiado':'Comanda '+c.number;
  // Conta pendente não é entrada de caixa. Fiado segue registrado como valor a receber.
  if(payment==='fiado'){
   const exists=await one('SELECT id FROM cash WHERE description='+(isPg?'$1':'?'),[description]);
   if(!exists)await run('INSERT INTO cash(type,description,value,payment) VALUES('+(isPg?'$1,$2,$3,$4':'?,?,?,?)'),['fiado',description,Number(c.total),'fiado']);
  } else if(payment!=='pendente') {
   const exists=await one('SELECT id FROM cash WHERE description='+(isPg?'$1':'?'),[description]);
   if(!exists)await run('INSERT INTO cash(type,description,value,payment) VALUES('+(isPg?'$1,$2,$3,$4':'?,?,?,?)'),['entrada',description,Number(c.total),payment]);
  }
  const updated=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[id]);res.json({ok:true,command:updated});
 }catch(e){res.status(500).json({error:e.message||'Erro ao fechar comanda'})}
});

// Confirma o pagamento de uma conta fechada que ainda estava pendente. Rejeita duplicação.
app.put('/api/admin/commands/:id/pay',auth,async(req,res)=>{
 try{
  const id=Number(req.params.id);const payment=String(req.body.payment||'').trim().toLowerCase();
  if(!['pix','dinheiro','debito','credito'].includes(payment))return res.status(400).json({error:'Escolha uma forma de pagamento válida.'});
  const c=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[id]);
  if(!c)return res.status(404).json({error:'Comanda não encontrada.'});
  if(c.status!=='fechada')return res.status(400).json({error:'Feche a conta antes de registrar o pagamento.'});
  if(String(c.payment||'').toLowerCase()!=='pendente')return res.status(400).json({error:'Esta conta não está pendente de pagamento.'});
  // Atualização condicional: apenas uma requisição pode mudar a conta de pendente para paga.
  // Isso evita duplicidade se o botão for acionado duas vezes ou duas requisições chegarem juntas.
  const changed=await run(
   'UPDATE commands SET payment='+(isPg?'$1':'?')+' WHERE id='+(isPg?'$2':'?')+" AND status='fechada' AND LOWER(payment)='pendente'",
   [payment,id]
  );
  if(!changed.changes)return res.status(409).json({error:'Esta conta já foi paga ou deixou de estar pendente. Atualize a tela antes de tentar novamente.'});
  const description='Comanda '+c.number;
  // Só a requisição que alterou o estado pode lançar a entrada no caixa.
  const exists=await one('SELECT id FROM cash WHERE description='+(isPg?'$1':'?'),[description]);
  if(!exists)await run('INSERT INTO cash(type,description,value,payment) VALUES('+(isPg?'$1,$2,$3,$4':'?,?,?,?)'),['entrada',description,Number(c.total),payment]);
  const updated=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[id]);res.json({ok:true,command:updated});
 }catch(e){console.error('Erro ao registrar pagamento da comanda:',e);res.status(500).json({error:'Não foi possível registrar o pagamento.'})}
});

app.use(express.static(path.join(__dirname,'public')));
app.get('/*splat',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
(async()=>{if(isPg)await initPg();else initSqlite();app.listen(PORT,()=>console.log('Espetinho V4 rodando na porta '+PORT));})().catch(e=>{console.error(e);process.exit(1)});
