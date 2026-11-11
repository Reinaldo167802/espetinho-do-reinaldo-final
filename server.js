// ESPETINHO DO REINALDO — integração fornecedores + insumos + entrada XML — V4 2026-10-29
const express=require('express');
const path=require('path');
const crypto=require('crypto');
const fs=require('fs');
const os=require('os');
const app=express();
app.use(express.json({limit:'8mb'}));
app.use(express.urlencoded({extended:true}));

const PORT=process.env.PORT||3000;
const ADMIN_PASSWORD=String(process.env.SENHA_DE_ADMINISTRADOR||process.env.ADMIN_PASSWORD||'reinaldo123').trim();
const DELIVERY_FEE=Number(process.env.TAXA_ENTREGA||process.env.DELIVERY_FEE||process.env.TAXA_DE_ENTREGA||0);
const PRINTER_BRIDGE_TOKEN=String(process.env.PRINTER_BRIDGE_TOKEN||'').trim();
const WAITER_NUMBER=String(process.env.GARCOM_NUMERO||'01').trim();
const WAITER_NAME=String(process.env.GARCOM_NOME||'Reinaldo').trim();
const WAITER_PIN=String(process.env.GARCOM_PIN||'').trim();
const WAITER_SECRET=String(process.env.GARCOM_TOKEN_SECRET||'').trim();
let db;
let isPg=!!process.env.DATABASE_URL;

function initSqlite(){
 const Database=require('better-sqlite3');
 db=new Database(process.env.SQLITE_PATH||path.join(__dirname,'data.sqlite'));
 db.pragma('journal_mode = WAL');
 const q=(sql)=>db.prepare(sql);
 db.exec(`CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'Outros',description TEXT DEFAULT '',price REAL NOT NULL DEFAULT 0,image TEXT DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP,barcode TEXT DEFAULT '',brand TEXT DEFAULT '',unit TEXT DEFAULT 'un',cost_price REAL DEFAULT 0,stock REAL DEFAULT 0,min_stock REAL DEFAULT 0,prepare_kitchen INTEGER NOT NULL DEFAULT 0,product_type TEXT NOT NULL DEFAULT 'venda',supplier_id INTEGER,sale_options TEXT DEFAULT '[]');
 CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,customer_name TEXT NOT NULL,phone TEXT DEFAULT '',type TEXT NOT NULL DEFAULT 'balcao',address TEXT DEFAULT '',payment TEXT DEFAULT '',notes TEXT DEFAULT '',status TEXT NOT NULL DEFAULT 'novo',total REAL NOT NULL DEFAULT 0,command_no TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER,name TEXT NOT NULL,qty REAL NOT NULL,unit_price REAL NOT NULL,total REAL NOT NULL);
 CREATE TABLE IF NOT EXISTS cash(id INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL,description TEXT NOT NULL,value REAL NOT NULL,payment TEXT DEFAULT '',order_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS commands(id INTEGER PRIMARY KEY AUTOINCREMENT,number TEXT UNIQUE NOT NULL,customer TEXT DEFAULT '',status TEXT DEFAULT 'aberta',payment TEXT DEFAULT '',total REAL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,closed_at TEXT);
 CREATE TABLE IF NOT EXISTS command_items(id INTEGER PRIMARY KEY AUTOINCREMENT,command_id INTEGER NOT NULL,product_id INTEGER,name TEXT NOT NULL,qty REAL NOT NULL,unit_price REAL NOT NULL,total REAL NOT NULL);
 CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT DEFAULT '',address TEXT DEFAULT '',credit_limit REAL NOT NULL DEFAULT 0,fiado_authorized INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS fiado_payments(id INTEGER PRIMARY KEY AUTOINCREMENT,command_id INTEGER NOT NULL,customer TEXT NOT NULL,amount REAL NOT NULL,payment TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS command_payments(id INTEGER PRIMARY KEY AUTOINCREMENT,command_id INTEGER NOT NULL,payment TEXT NOT NULL,amount REAL NOT NULL,customer TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS command_receipts(id INTEGER PRIMARY KEY AUTOINCREMENT,command_id INTEGER NOT NULL,customer_id INTEGER NOT NULL,customer_name TEXT NOT NULL,fiado_amount REAL NOT NULL,payload TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS print_jobs(id INTEGER PRIMARY KEY AUTOINCREMENT,job_key TEXT UNIQUE NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,claimed_at TEXT,printed_at TEXT,last_error TEXT);
 CREATE TABLE IF NOT EXISTS suppliers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,cnpj TEXT UNIQUE NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS purchase_invoices(id INTEGER PRIMARY KEY AUTOINCREMENT,access_key TEXT UNIQUE NOT NULL,invoice_number TEXT DEFAULT '',series TEXT DEFAULT '',supplier_name TEXT DEFAULT '',supplier_cnpj TEXT DEFAULT '',issue_date TEXT DEFAULT '',total REAL NOT NULL DEFAULT 0,xml_content TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS purchase_invoice_lines(id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER NOT NULL,product_id INTEGER,product_name TEXT NOT NULL,code TEXT DEFAULT '',purchase_qty REAL DEFAULT 0,purchase_unit TEXT DEFAULT '',purchase_unit_price REAL DEFAULT 0,line_total REAL DEFAULT 0,stock_qty REAL DEFAULT 0,stock_unit TEXT DEFAULT 'un',secondary_qty REAL DEFAULT 0,secondary_unit TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS inventory_movements(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,invoice_id INTEGER,quantity REAL NOT NULL,unit TEXT DEFAULT 'un',secondary_quantity REAL DEFAULT 0,secondary_unit TEXT DEFAULT '',cost_total REAL DEFAULT 0,description TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS app_settings(setting_key TEXT PRIMARY KEY,setting_value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS supplier_product_codes(id INTEGER PRIMARY KEY AUTOINCREMENT,supplier_cnpj TEXT NOT NULL,supplier_code TEXT NOT NULL,product_id INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(supplier_cnpj,supplier_code));
 CREATE TABLE IF NOT EXISTS technical_recipe_items(id INTEGER PRIMARY KEY AUTOINCREMENT,sale_product_id INTEGER NOT NULL,ingredient_id INTEGER NOT NULL,quantity REAL NOT NULL,unit TEXT NOT NULL,notes TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(sale_product_id,ingredient_id));
 CREATE TABLE IF NOT EXISTS recipe_stock_movements(id INTEGER PRIMARY KEY AUTOINCREMENT,source_type TEXT NOT NULL,source_item_id INTEGER NOT NULL,ingredient_id INTEGER NOT NULL,quantity REAL NOT NULL,unit TEXT NOT NULL,reversed INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(source_type,source_item_id,ingredient_id));`);
 const purchaseCols=db.prepare('PRAGMA table_info(purchase_invoices)').all().map(c=>c.name); if(!purchaseCols.includes('xml_content')) db.exec("ALTER TABLE purchase_invoices ADD COLUMN xml_content TEXT DEFAULT ''");
 // Migração segura dos campos usados pelo painel de produtos.
 const productCols=db.prepare('PRAGMA table_info(products)').all().map(c=>c.name);
 for(const [col,def] of [['internal_code','TEXT'],['stock_secondary','REAL DEFAULT 0'],['stock_secondary_unit',"TEXT DEFAULT ''"],['product_type',"TEXT NOT NULL DEFAULT 'venda'"],['supplier_id','INTEGER'],['barcode',"TEXT DEFAULT ''"],['brand',"TEXT DEFAULT ''"],['unit',"TEXT DEFAULT 'un'"],['cost_price','REAL DEFAULT 0'],['stock','REAL DEFAULT 0'],['min_stock','REAL DEFAULT 0'],['prepare_kitchen','INTEGER NOT NULL DEFAULT 0'],['print_site','INTEGER NOT NULL DEFAULT 1'],['print_command','INTEGER NOT NULL DEFAULT 0'],['sale_options',"TEXT DEFAULT '[]'"]]) if(!productCols.includes(col)) db.exec(`ALTER TABLE products ADD COLUMN ${col} ${def}`);
 db.exec("UPDATE products SET internal_code='ER' || printf('%06d',id) WHERE internal_code IS NULL OR TRIM(internal_code)=''");
 db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_internal_code ON products(internal_code)');
 db.exec('CREATE INDEX IF NOT EXISTS idx_supplier_product_codes_lookup ON supplier_product_codes(supplier_cnpj,supplier_code)');
 db.exec('UPDATE products SET print_command=prepare_kitchen WHERE print_command=0 AND prepare_kitchen=1');
 const orderCols=db.prepare('PRAGMA table_info(orders)').all().map(c=>c.name); if(!orderCols.includes('payment_confirmed')) db.exec('ALTER TABLE orders ADD COLUMN payment_confirmed INTEGER NOT NULL DEFAULT 0');
 for(const [col,def] of [['sale_label',"TEXT DEFAULT ''"],['stock_qty','REAL DEFAULT 0'],['stock_unit',"TEXT DEFAULT 'un'"]]){const cols=db.prepare('PRAGMA table_info(order_items)').all().map(c=>c.name);if(!cols.includes(col))db.exec(`ALTER TABLE order_items ADD COLUMN ${col} ${def}`);}
 const commandCols=db.prepare('PRAGMA table_info(command_items)').all().map(c=>c.name);for(const [col,def] of [['sale_label',"TEXT DEFAULT ''"],['stock_qty','REAL DEFAULT 0'],['stock_unit',"TEXT DEFAULT 'un'"],['stock_deducted','INTEGER NOT NULL DEFAULT 0']])if(!commandCols.includes(col))db.exec(`ALTER TABLE command_items ADD COLUMN ${col} ${def}`);
 const cmdCols2=db.prepare('PRAGMA table_info(commands)').all().map(c=>c.name);for(const [col,def] of [['waiter_number',"TEXT DEFAULT ''"],['waiter_name',"TEXT DEFAULT ''"],['waiter_table',"TEXT DEFAULT ''"],['close_requested_at','TEXT']])if(!cmdCols2.includes(col))db.exec(`ALTER TABLE commands ADD COLUMN ${col} ${def}`);
 const itemCols2=db.prepare('PRAGMA table_info(command_items)').all().map(c=>c.name);for(const [col,def] of [['waiter_number',"TEXT DEFAULT ''"],['waiter_name',"TEXT DEFAULT ''"],['notes',"TEXT DEFAULT ''"]])if(!itemCols2.includes(col))db.exec(`ALTER TABLE command_items ADD COLUMN ${col} ${def}`);
 const orderStockCols=db.prepare('PRAGMA table_info(orders)').all().map(c=>c.name);if(!orderStockCols.includes('stock_deducted'))db.exec('ALTER TABLE orders ADD COLUMN stock_deducted INTEGER NOT NULL DEFAULT 0');
 // Migração segura: bancos antigos podem ter fiado_payments sem a coluna customer.
 const fiadoCols=db.prepare('PRAGMA table_info(fiado_payments)').all().map(c=>c.name);
 if(!fiadoCols.includes('customer')) db.exec("ALTER TABLE fiado_payments ADD COLUMN customer TEXT NOT NULL DEFAULT ''");
 const commandPaymentCols=db.prepare('PRAGMA table_info(command_payments)').all().map(c=>c.name); if(!commandPaymentCols.includes('customer')) db.exec("ALTER TABLE command_payments ADD COLUMN customer TEXT DEFAULT ''");
 if(q('SELECT COUNT(*) c FROM products').get().c===0){
  const ins=q('INSERT INTO products(name,category,description,price,active) VALUES(?,?,?,?,1)');
  [['Espetinho de Carne','Espetinhos','Espetinho tradicional da casa',10],['Espetinho de Frango','Espetinhos','Temperado da casa',9],['X-Tudo','Hambúrgueres','Hambúrguer completo',25],['Super Espetinho Burguer','Hambúrgueres','Especial da casa',30],['Porção de Tilápia','Porções','Tilápia na panela de pedra',35],['Copa Lombo','Porções','Porção de copa lombo',30],['Pastel frito na hora','Salgados','Consulte sabores',7],['Açaí 300 ml','Açaí','Complementos à parte',10],['Açaí 500 ml','Açaí','Complementos à parte',14],['Suco de laranja 300 ml','Bebidas','Natural',8],['Cerveja Brahma Latão','Bebidas','473 ml',8]].forEach(x=>ins.run(...x));
 }
 db.exec("UPDATE products SET internal_code='ER' || printf('%06d',id) WHERE internal_code IS NULL OR TRIM(internal_code)=''");
 return;
}
async function initPg(){
 const {Pool}=require('pg'); db=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('railway')?{rejectUnauthorized:false}:undefined});
 await db.query(`CREATE TABLE IF NOT EXISTS products(id SERIAL PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'Outros',description TEXT DEFAULT '',price NUMERIC(12,2) NOT NULL DEFAULT 0,image TEXT DEFAULT '',active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,barcode TEXT DEFAULT '',brand TEXT DEFAULT '',unit TEXT DEFAULT 'un',cost_price NUMERIC(12,2) DEFAULT 0,stock NUMERIC(12,3) DEFAULT 0,min_stock NUMERIC(12,3) DEFAULT 0,prepare_kitchen BOOLEAN NOT NULL DEFAULT FALSE,product_type TEXT NOT NULL DEFAULT 'venda',supplier_id INTEGER,sale_options TEXT DEFAULT '[]');
 CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY,customer_name TEXT NOT NULL,phone TEXT DEFAULT '',type TEXT NOT NULL DEFAULT 'balcao',address TEXT DEFAULT '',payment TEXT DEFAULT '',notes TEXT DEFAULT '',status TEXT NOT NULL DEFAULT 'novo',total NUMERIC(12,2) NOT NULL DEFAULT 0,command_no TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS order_items(id SERIAL PRIMARY KEY,order_id INTEGER NOT NULL,product_id INTEGER,name TEXT NOT NULL,qty NUMERIC(12,2) NOT NULL,unit_price NUMERIC(12,2) NOT NULL,total NUMERIC(12,2) NOT NULL);
 CREATE TABLE IF NOT EXISTS cash(id SERIAL PRIMARY KEY,type TEXT NOT NULL,description TEXT NOT NULL,value NUMERIC(12,2) NOT NULL,payment TEXT DEFAULT '',order_id INTEGER,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS commands(id SERIAL PRIMARY KEY,number TEXT UNIQUE NOT NULL,customer TEXT DEFAULT '',status TEXT DEFAULT 'aberta',payment TEXT DEFAULT '',total NUMERIC(12,2) DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,closed_at TIMESTAMP);
 CREATE TABLE IF NOT EXISTS command_items(id SERIAL PRIMARY KEY,command_id INTEGER NOT NULL,product_id INTEGER,name TEXT NOT NULL,qty NUMERIC(12,2) NOT NULL,unit_price NUMERIC(12,2) NOT NULL,total NUMERIC(12,2) NOT NULL);
 CREATE TABLE IF NOT EXISTS customers(id SERIAL PRIMARY KEY,name TEXT NOT NULL,phone TEXT DEFAULT '',address TEXT DEFAULT '',credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0,fiado_authorized BOOLEAN NOT NULL DEFAULT FALSE,active BOOLEAN NOT NULL DEFAULT TRUE,notes TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS fiado_payments(id SERIAL PRIMARY KEY,command_id INTEGER NOT NULL,customer TEXT NOT NULL,amount NUMERIC(12,2) NOT NULL,payment TEXT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS command_payments(id SERIAL PRIMARY KEY,command_id INTEGER NOT NULL,payment TEXT NOT NULL,amount NUMERIC(12,2) NOT NULL,customer TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS command_receipts(id SERIAL PRIMARY KEY,command_id INTEGER NOT NULL,customer_id INTEGER NOT NULL,customer_name TEXT NOT NULL,fiado_amount NUMERIC(12,2) NOT NULL,payload TEXT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
 await db.query("CREATE TABLE IF NOT EXISTS print_jobs(id SERIAL PRIMARY KEY,job_key TEXT UNIQUE NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,claimed_at TIMESTAMP,printed_at TIMESTAMP,last_error TEXT)");
 await db.query("CREATE TABLE IF NOT EXISTS suppliers(id SERIAL PRIMARY KEY,name TEXT NOT NULL,cnpj TEXT UNIQUE NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
 await db.query("CREATE TABLE IF NOT EXISTS purchase_invoices(id SERIAL PRIMARY KEY,access_key TEXT UNIQUE NOT NULL,invoice_number TEXT DEFAULT '',series TEXT DEFAULT '',supplier_name TEXT DEFAULT '',supplier_cnpj TEXT DEFAULT '',issue_date TEXT DEFAULT '',total NUMERIC(12,2) NOT NULL DEFAULT 0,xml_content TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
 await db.query("ALTER TABLE command_payments ADD COLUMN IF NOT EXISTS customer TEXT DEFAULT ''");
 await db.query("ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS xml_content TEXT DEFAULT ''");
 await db.query("CREATE TABLE IF NOT EXISTS purchase_invoice_lines(id SERIAL PRIMARY KEY,invoice_id INTEGER NOT NULL,product_id INTEGER,product_name TEXT NOT NULL,code TEXT DEFAULT '',purchase_qty NUMERIC(12,4) DEFAULT 0,purchase_unit TEXT DEFAULT '',purchase_unit_price NUMERIC(12,4) DEFAULT 0,line_total NUMERIC(12,2) DEFAULT 0,stock_qty NUMERIC(12,4) DEFAULT 0,stock_unit TEXT DEFAULT 'un',secondary_qty NUMERIC(12,4) DEFAULT 0,secondary_unit TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
 await db.query("CREATE TABLE IF NOT EXISTS inventory_movements(id SERIAL PRIMARY KEY,product_id INTEGER NOT NULL,invoice_id INTEGER,quantity NUMERIC(12,4) NOT NULL,unit TEXT DEFAULT 'un',secondary_quantity NUMERIC(12,4) DEFAULT 0,secondary_unit TEXT DEFAULT '',cost_total NUMERIC(12,2) DEFAULT 0,description TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
 await db.query("CREATE TABLE IF NOT EXISTS app_settings(setting_key TEXT PRIMARY KEY,setting_value TEXT NOT NULL)");
 await db.query("CREATE TABLE IF NOT EXISTS supplier_product_codes(id SERIAL PRIMARY KEY,supplier_cnpj TEXT NOT NULL,supplier_code TEXT NOT NULL,product_id INTEGER NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(supplier_cnpj,supplier_code))");
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_secondary NUMERIC(12,4) DEFAULT 0");
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_secondary_unit TEXT DEFAULT ''");

 // Migração segura dos campos usados pelo painel de produtos.
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS internal_code TEXT");
 await db.query("UPDATE products SET internal_code='ER' || LPAD(id::text,6,'0') WHERE internal_code IS NULL OR BTRIM(internal_code)=''");
 await db.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_products_internal_code ON products(internal_code)");
 await db.query("CREATE INDEX IF NOT EXISTS idx_supplier_product_codes_lookup ON supplier_product_codes(supplier_cnpj,supplier_code)");
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT DEFAULT ''");
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT ''");
 await db.query("CREATE TABLE IF NOT EXISTS technical_recipe_items(id SERIAL PRIMARY KEY,sale_product_id INTEGER NOT NULL,ingredient_id INTEGER NOT NULL,quantity NUMERIC(14,4) NOT NULL,unit TEXT NOT NULL,notes TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(sale_product_id,ingredient_id))");
 await db.query("CREATE TABLE IF NOT EXISTS recipe_stock_movements(id SERIAL PRIMARY KEY,source_type TEXT NOT NULL,source_item_id INTEGER NOT NULL,ingredient_id INTEGER NOT NULL,quantity NUMERIC(14,4) NOT NULL,unit TEXT NOT NULL,reversed BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(source_type,source_item_id,ingredient_id))");
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'un'");
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT 0');
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS stock NUMERIC(12,3) DEFAULT 0');
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock NUMERIC(12,3) DEFAULT 0');
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS prepare_kitchen BOOLEAN NOT NULL DEFAULT FALSE');
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS print_site BOOLEAN NOT NULL DEFAULT TRUE');
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS print_command BOOLEAN NOT NULL DEFAULT FALSE');
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'venda'");
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INTEGER');
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_options TEXT DEFAULT '[]'");
 await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_secondary NUMERIC(12,4) DEFAULT 0');
 await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_secondary_unit TEXT DEFAULT ''");
 await db.query('UPDATE products SET print_command=prepare_kitchen WHERE print_command=FALSE AND prepare_kitchen=TRUE');
 // Migração segura para instalações PostgreSQL já existentes.
 await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed BOOLEAN NOT NULL DEFAULT FALSE');
 await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN NOT NULL DEFAULT FALSE');
 for(const t of ['order_items','command_items']){await db.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS sale_label TEXT DEFAULT ''`);await db.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS stock_qty NUMERIC(12,4) DEFAULT 0`);await db.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS stock_unit TEXT DEFAULT 'un'`);} await db.query('ALTER TABLE command_items ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN NOT NULL DEFAULT FALSE');
 for(const [col,def] of [['waiter_number',"TEXT DEFAULT ''"],['waiter_name',"TEXT DEFAULT ''"],['waiter_table',"TEXT DEFAULT ''"],['close_requested_at','TIMESTAMP']])await db.query(`ALTER TABLE commands ADD COLUMN IF NOT EXISTS ${col} ${def}`);
 for(const [col,def] of [['waiter_number',"TEXT DEFAULT ''"],['waiter_name',"TEXT DEFAULT ''"],['notes',"TEXT DEFAULT ''"]])await db.query(`ALTER TABLE command_items ADD COLUMN IF NOT EXISTS ${col} ${def}`);
 await db.query("ALTER TABLE fiado_payments ADD COLUMN IF NOT EXISTS customer TEXT NOT NULL DEFAULT ''");
 const c=await db.query('SELECT COUNT(*) c FROM products');
 if(Number(c.rows[0].c)===0){for(const x of [['Espetinho de Carne','Espetinhos','Espetinho tradicional da casa',10],['Espetinho de Frango','Espetinhos','Temperado da casa',9],['X-Tudo','Hambúrgueres','Hambúrguer completo',25],['Super Espetinho Burguer','Hambúrgueres','Especial da casa',30],['Porção de Tilápia','Porções','Tilápia na panela de pedra',35],['Copa Lombo','Porções','Porção de copa lombo',30],['Pastel frito na hora','Salgados','Consulte sabores',7],['Açaí 300 ml','Açaí','Complementos à parte',10],['Açaí 500 ml','Açaí','Complementos à parte',14],['Suco de laranja 300 ml','Bebidas','Natural',8],['Cerveja Brahma Latão','Bebidas','473 ml',8]]) await db.query('INSERT INTO products(name,category,description,price,active) VALUES($1,$2,$3,$4,true)',x);}
 await db.query("UPDATE products SET internal_code='ER' || LPAD(id::text,6,'0') WHERE internal_code IS NULL OR BTRIM(internal_code)=''");
}
function auth(req,res,next){const supplied=String(req.headers['x-admin-password']||req.headers['x-senha-admin']||'').trim();if(!supplied||supplied!==ADMIN_PASSWORD)return res.status(401).json({error:'Senha administrativa inválida'});next();}
function safeEqual(a,b){const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function waiterToken(payload){const body=Buffer.from(JSON.stringify(payload)).toString('base64url');const sig=crypto.createHmac('sha256',WAITER_SECRET).update(body).digest('base64url');return body+'.'+sig;}
function waiterAuth(req,res,next){try{if(!WAITER_PIN||!WAITER_SECRET||WAITER_SECRET.length<32)return res.status(503).json({error:'Acesso do garçom ainda não configurado corretamente no Railway.'});const token=String(req.headers['x-waiter-token']||'');const parts=token.split('.');if(parts.length!==2)return res.status(401).json({error:'Acesso expirado. Entre novamente.'});const expected=crypto.createHmac('sha256',WAITER_SECRET).update(parts[0]).digest();const got=Buffer.from(parts[1],'base64url');if(got.length!==expected.length||!crypto.timingSafeEqual(got,expected))return res.status(401).json({error:'Acesso inválido. Entre novamente.'});const p=JSON.parse(Buffer.from(parts[0],'base64url').toString());if(!p.exp||p.exp<Date.now()||p.number!==WAITER_NUMBER)return res.status(401).json({error:'Acesso expirado. Entre novamente.'});req.waiter={number:p.number,name:p.name};next();}catch(e){return res.status(401).json({error:'Acesso inválido. Entre novamente.'});}}

function normRows(r){return r.rows||r;}
async function q(sql,args=[]){if(isPg)return normRows(await db.query(sql,args)); return db.prepare(sql).all(...args);}
async function one(sql,args=[]){if(isPg){const r=await db.query(sql,args);return r.rows[0];}return db.prepare(sql).get(...args);}
async function run(sql,args=[]){if(isPg){const r=await db.query(sql,args.map(v=>v===undefined?null:v));return {lastID:r.rows[0]?.id,changes:r.rowCount};}const safeArgs=args.map(v=>v===undefined?null:(typeof v==='boolean'?(v?1:0):(typeof v==='number'&&!Number.isFinite(v)?null:v)));const r=db.prepare(sql).run(...safeArgs);return {lastID:r.lastInsertRowid,changes:r.changes};}
function placeholders(n,start=1){return Array.from({length:n},(_,i)=>'$'+(i+start)).join(',');}
async function commandFiadoBalance(command, customerName=''){
 const legacy=String(command.payment||'').toLowerCase()==='fiado';
 const mixed=String(command.payment||'').toLowerCase()==='misto';
 const target=String(customerName||command.customer||'').trim();
 let original=0;
 if(legacy){ if(!target || normText(target)===normText(command.customer||'')) original=Number(command.total||0); }
 else if(mixed){
  const parts=await q('SELECT amount,customer FROM command_payments WHERE command_id='+(isPg?'$1':'?')+" AND LOWER(payment)='fiado'",[command.id]);
  original=parts.filter(row=>!target || normText(row.customer||command.customer||'')===normText(target)).reduce((sum,row)=>sum+Number(row.amount||0),0);
 }
 if(original<=0)return 0;
 const received=await q('SELECT amount,customer FROM fiado_payments WHERE command_id='+(isPg?'$1':'?'),[command.id]);
 const receivedForCustomer=received.filter(row=>!target || normText(row.customer||command.customer||'')===normText(target)).reduce((sum,row)=>sum+Number(row.amount||0),0);
 return Math.max(0,Math.round((original-receivedForCustomer)*100)/100);
}
function normText(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function isSandwichProduct(product){
 const category=normText(product?.category||'');
 const name=normText(product?.name||'');
 return /hamburg|sanduich|sanduiche|lanches|lanche/.test(category) || /hamburg|burguer|burger|sanduich|sanduiche|x\s*[- ]?tudo|x\s*[- ]?salada/.test(name);
}
async function getSandwichLimit(){
 const row=await one('SELECT setting_value FROM app_settings WHERE setting_key='+(isPg?'$1':'?'),['sandwich_limit']);
 const value=Number(row?.setting_value);
 return Number.isInteger(value)&&value>=1&&value<=200?value:10;
}
async function getActiveSandwichOrderCount(){
 const rows=await q("SELECT o.id,oi.name AS item_name,p.name AS product_name,p.category FROM orders o JOIN order_items oi ON oi.order_id=o.id LEFT JOIN products p ON p.id=oi.product_id WHERE LOWER(o.status) IN ('novo','confirmado','preparando')");
 const ids=new Set();
 for(const row of rows){if(isSandwichProduct({category:row.category,name:[row.product_name,row.item_name].filter(Boolean).join(' ')}))ids.add(String(row.id));}
 return ids.size;
}
async function getSandwichCapacity(){
 const [limit,active]=await Promise.all([getSandwichLimit(),getActiveSandwichOrderCount()]);
 return {sandwich_limit:limit,sandwich_active_orders:active,sandwich_paused:active>=limit};
}
async function saveSandwichLimit(value){
 const limit=Number(value);
 if(!Number.isInteger(limit)||limit<1||limit>200)throw new Error('O limite deve ser um número inteiro entre 1 e 200.');
 if(isPg){await db.query("INSERT INTO app_settings(setting_key,setting_value) VALUES($1,$2) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value",['sandwich_limit',String(limit)]);}
 else{await run('INSERT INTO app_settings(setting_key,setting_value) VALUES(?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value',['sandwich_limit',String(limit)]);}
 return limit;
}
function productNumber(v){if(v===undefined||v===null||String(v).trim()==='')return 0;if(typeof v==='number')return Number.isFinite(v)?v:NaN;const s=String(v).trim().replace(/\s/g,'').replace(',','.');return Number(s);}
function parseSaleOptions(product){try{const v=product?.sale_options;const a=Array.isArray(v)?v:JSON.parse(v||'[]');return Array.isArray(a)?a.filter(x=>x&&String(x.key||'').trim()&&Number(x.factor)>0&&Number(x.price)>=0):[]}catch(_){return []}}
function resolveSale(product,key,qty){const opts=parseSaleOptions(product);if(!opts.length)return {label:'',factor:1,price:Number(product.price||0),qty:Number(qty),stockQty:Number(qty),stockUnit:String(product.unit||'un')};const option=opts.find(x=>String(x.key)===String(key))||opts[0];if(!option)throw new Error('Apresentação de venda inválida.');const factor=Number(option.factor),price=Number(option.price);if(!(factor>0)||!(price>=0)||!Number.isFinite(factor)||!Number.isFinite(price))throw new Error('Configuração de venda inválida para '+product.name+'.');return {label:String(option.label||'Unidade'),factor,price,qty:Number(qty),stockQty:factor*Number(qty),stockUnit:String(product.unit||'un')}}
async function ensureStockAvailable(items){const totals=new Map();for(const x of items){const n=Number(x.sale?.stockQty??x.stock_qty??0);if(n>0)totals.set(Number(x.p?.id??x.product_id),(totals.get(Number(x.p?.id??x.product_id))||0)+n)}for(const [id,n] of totals){const p=await one('SELECT * FROM products WHERE id='+(isPg?'$1':'?'),[id]);if(!p||Number(p.stock||0)+0.0001<n)throw new Error('Estoque insuficiente para '+(p?.name||('produto '+id))+'. Disponível: '+Number(p?.stock||0)+' '+(p?.unit||'un')+'. Necessário: '+n+' '+(p?.unit||'un')+'.');}}
async function changeStock(productId,amount,unit,description){const p=await one('SELECT * FROM products WHERE id='+(isPg?'$1':'?'),[productId]);if(!p)throw new Error('Produto não encontrado no estoque.');const current=Number(p.stock||0),delta=Number(amount);if(current+delta < -0.0001)throw new Error('Estoque insuficiente para '+p.name+'. Disponível: '+current+' '+(p.unit||'un')+'.');await run('UPDATE products SET stock='+(isPg?'$1':'?')+' WHERE id='+(isPg?'$2':'?'),[Math.max(0,current+delta),productId]);await run('INSERT INTO inventory_movements(product_id,quantity,unit,cost_total,description) VALUES('+(isPg?'$1,$2,$3,$4,$5':'?,?,?,?,?')+')',[productId,delta,unit||p.unit||'un',0,description]);}

// Consumo centralizado de ficha técnica. Se o produto não tiver receita, mantém a baixa tradicional do próprio produto.
async function getRecipeRows(productId){return await q('SELECT r.ingredient_id,r.quantity,r.unit,p.name,p.stock,p.unit AS stock_unit FROM technical_recipe_items r JOIN products p ON p.id=r.ingredient_id WHERE r.sale_product_id='+(isPg?'$1':'?')+' ORDER BY r.ingredient_id',[productId]);}
const RECIPE_STOCK_DEDUCTION_ENABLED = String(process.env.RECIPE_STOCK_DEDUCTION_ENABLED||'').toLowerCase()==='true';
async function ensureSaleInventoryAvailable(products){const needs=new Map();for(const x of products){const recipe=await getRecipeRows(x.p.id);if(recipe.length && RECIPE_STOCK_DEDUCTION_ENABLED){for(const r of recipe){const id=Number(r.ingredient_id);needs.set(id,(needs.get(id)||0)+Number(r.quantity||0)*Number(x.qty||1));}}else if(Number(x.sale.stockQty||0)>0){const id=Number(x.p.id);needs.set(id,(needs.get(id)||0)+Number(x.sale.stockQty));}}await ensureStockAvailable([...needs.entries()].map(([product_id,stock_qty])=>({product_id,stock_qty})));}
async function ensureCommandItemsInventoryAvailable(items){const products=[];for(const item of items){const p=await one('SELECT * FROM products WHERE id='+(isPg?'$1':'?'),[Number(item.product_id)]);if(p)products.push({p,qty:Number(item.qty||1),sale:{stockQty:Number(item.stock_qty||0)}});}await ensureSaleInventoryAvailable(products);}
async function applySaleInventoryUnlocked(productId,qty,stockQty,stockUnit,sourceType,sourceItemId,description){
 // O rastreio é consultado para qualquer venda, inclusive produtos sem ficha técnica.
 // Isso impede baixa duplicada e permite estornar usando o consumo real registrado,
 // mesmo que a ficha técnica seja criada ou alterada depois da venda.
 const already=await one('SELECT id FROM recipe_stock_movements WHERE source_type='+(isPg?'$1':'?')+' AND source_item_id='+(isPg?'$2':'?')+' LIMIT 1',[sourceType,sourceItemId]);
 if(already)return {mode:'already_applied',deducted:true};
 const recipe=await getRecipeRows(productId);
 if(recipe.length && RECIPE_STOCK_DEDUCTION_ENABLED){
  const required=recipe.map(r=>({product_id:Number(r.ingredient_id),stock_qty:Number(r.quantity||0)*Number(qty||1)}));
  await ensureStockAvailable(required);
  const done=[];
  try{
   for(const r of recipe){
    const amount=Number(r.quantity||0)*Number(qty||1);if(!(amount>0))continue;
    await changeStock(Number(r.ingredient_id),-amount,r.unit,'Consumo ficha técnica — '+description);
    done.push({id:Number(r.ingredient_id),amount,unit:r.unit});
    await run('INSERT INTO recipe_stock_movements(source_type,source_item_id,ingredient_id,quantity,unit) VALUES('+(isPg?'$1,$2,$3,$4,$5':'?,?,?,?,?')+')',[sourceType,sourceItemId,Number(r.ingredient_id),amount,r.unit]);
   }
  }catch(e){
   for(const d of done.reverse()){
    try{
     await changeStock(d.id,d.amount,d.unit,'Estorno de falha no consumo da ficha técnica — '+description);
     await run('UPDATE recipe_stock_movements SET reversed='+(isPg?'TRUE':'1')+' WHERE source_type='+(isPg?'$1':'?')+' AND source_item_id='+(isPg?'$2':'?')+' AND ingredient_id='+(isPg?'$3':'?'),[sourceType,sourceItemId,d.id]);
    }catch(restoreError){console.error('Falha ao estornar ingrediente:',restoreError)}
   }
   throw e;
  }
  return {mode:'recipe',deducted:true};
 }
 if(Number(stockQty||0)>0){
  await ensureStockAvailable([{product_id:Number(productId),stock_qty:Number(stockQty)}]);
  await changeStock(productId,-Number(stockQty),stockUnit,description);
  try{
   // Registra também a baixa tradicional para o estorno não depender da ficha atual.
   await run('INSERT INTO recipe_stock_movements(source_type,source_item_id,ingredient_id,quantity,unit) VALUES('+(isPg?'$1,$2,$3,$4,$5':'?,?,?,?,?')+')',[sourceType,sourceItemId,Number(productId),Number(stockQty),stockUnit||'un']);
  }catch(e){await changeStock(productId,Number(stockQty),stockUnit,'Estorno de falha ao registrar rastreio — '+description);throw e;}
  return {mode:'product',deducted:true};
 }
 return {mode:'none',deducted:false};
}
async function restoreSaleInventoryUnlocked(productId,stockQty,stockUnit,sourceType,sourceItemId,description){
 const allRows=await q('SELECT * FROM recipe_stock_movements WHERE source_type='+(isPg?'$1':'?')+' AND source_item_id='+(isPg?'$2':'?')+' ORDER BY id',[sourceType,sourceItemId]);
 if(allRows.length){
  const activeRows=allRows.filter(r=>!(r.reversed===true||r.reversed===1||String(r.reversed).toLowerCase()==='true'));
  if(!activeRows.length)return 'already_restored';
  for(const r of activeRows){
   const ingredientId=Number(r.ingredient_id),amount=Number(r.quantity||0);
   await changeStock(ingredientId,amount,r.unit,'Devolução de estoque — '+description);
   try{
    await run('UPDATE recipe_stock_movements SET reversed='+(isPg?'TRUE':'1')+' WHERE id='+(isPg?'$1':'?')+' AND reversed='+(isPg?'FALSE':'0'),[r.id]);
   }catch(markError){
    // Se não conseguir marcar o movimento como estornado, desfaz a devolução
    // para que uma nova tentativa não some a mesma quantidade novamente.
    try{await changeStock(ingredientId,-amount,r.unit,'Reversão de devolução não confirmada — '+description)}catch(compensationError){console.error('Falha ao compensar devolução não confirmada:',compensationError)}
    throw markError;
   }
  }
  return 'restored';
 }
 // Compatibilidade com vendas antigas, anteriores ao rastreio individual.
 // Se já existe ficha hoje, não é possível saber com segurança se a venda antiga
 // baixou o produto ou ingredientes; não inventamos uma devolução.
 const recipe=await getRecipeRows(productId);
 if(recipe.length)return 'legacy_unknown_no_restore';
 if(Number(stockQty||0)>0){await changeStock(Number(productId),Number(stockQty),stockUnit||'un',description);return 'product_legacy';}
 return 'none';
}
let inventoryQueue=Promise.resolve();
async function withInventoryLock(work){const previous=inventoryQueue;let release;inventoryQueue=new Promise(resolve=>{release=resolve});await previous;try{return await work()}finally{release()}}
async function applySaleInventory(...args){return withInventoryLock(()=>applySaleInventoryUnlocked(...args))}
async function restoreSaleInventory(...args){return withInventoryLock(()=>restoreSaleInventoryUnlocked(...args))}


app.get('/api/health',(req,res)=>res.json({ok:true,version:'4.0.0',database:isPg?'postgres':'sqlite',adminConfigured:Boolean(process.env.SENHA_DE_ADMINISTRADOR||process.env.ADMIN_PASSWORD)}));
async function enqueuePrint(jobKey,kind,payload){try{const key=String(jobKey),printPayload={companyName:'ESPETINHO DO REINALDO',cnpj:'48.508.407/0001-50',...payload},data=JSON.stringify(printPayload);if(isPg)await db.query('INSERT INTO print_jobs(job_key,kind,payload) VALUES($1,$2,$3) ON CONFLICT(job_key) DO NOTHING',[key,kind,data]);else await run('INSERT OR IGNORE INTO print_jobs(job_key,kind,payload) VALUES(?,?,?)',[key,kind,data]);}catch(e){console.error('Falha ao criar trabalho de impressão:',e)}}
function bridgeAuth(req,res,next){if(!PRINTER_BRIDGE_TOKEN)return res.status(503).json({error:'PRINTER_BRIDGE_TOKEN não configurado no servidor'});if(String(req.headers['x-printer-token']||'')!==PRINTER_BRIDGE_TOKEN)return res.status(401).json({error:'Token da impressora inválido'});next()}
app.get('/api/printer/next',bridgeAuth,async(req,res)=>{try{let job;if(isPg){const r=await db.query("UPDATE print_jobs SET status='printing',attempts=attempts+1,claimed_at=CURRENT_TIMESTAMP WHERE id=(SELECT id FROM print_jobs WHERE status='pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *");job=r.rows[0]}else{const candidate=await one("SELECT * FROM print_jobs WHERE status='pending' ORDER BY id LIMIT 1");if(candidate){await run("UPDATE print_jobs SET status='printing',attempts=attempts+1,claimed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'",[candidate.id]);job=await one("SELECT * FROM print_jobs WHERE id=? AND status='printing'",[candidate.id])}}if(!job)return res.status(204).end();res.json({...job,payload:JSON.parse(job.payload)})}catch(e){console.error('Fila de impressão:',e);res.status(500).json({error:'Falha ao consultar fila'})}});
app.post('/api/printer/:id/ack',bridgeAuth,async(req,res)=>{try{const id=Number(req.params.id),ok=req.body.ok===true,status=ok?'printed':'pending',error=String(req.body.error||'').slice(0,500);if(isPg)await db.query('UPDATE print_jobs SET status=$1,printed_at=CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE printed_at END,last_error=$3 WHERE id=$4',[status,ok,error,id]);else await run('UPDATE print_jobs SET status=?,printed_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE printed_at END,last_error=? WHERE id=?',[status,ok?1:0,error,id]);res.json({ok:true})}catch(e){res.status(500).json({error:'Falha ao confirmar impressão'})}});
app.get('/api/admin/customers/:id/receipts',auth,async(req,res)=>{try{const id=Number(req.params.id);const customer=await one('SELECT * FROM customers WHERE id='+(isPg?'$1':'?'),[id]);if(!customer)return res.status(404).json({error:'Cliente não encontrado.'});const rows=await q('SELECT id,command_id,customer_name,fiado_amount,payload,created_at FROM command_receipts WHERE customer_id='+(isPg?'$1':'?')+' ORDER BY id DESC',[id]);res.json(rows.map(r=>({...r,payload:JSON.parse(r.payload)})));}catch(e){console.error(e);res.status(500).json({error:'Não foi possível carregar os comprovantes do cliente.'})}});
app.post('/api/admin/customers/:id/receipts/:receiptId/print',auth,async(req,res)=>{try{const customerId=Number(req.params.id),receiptId=Number(req.params.receiptId);const row=await one('SELECT * FROM command_receipts WHERE id='+(isPg?'$1':'?')+' AND customer_id='+(isPg?'$2':'?'),[receiptId,customerId]);if(!row)return res.status(404).json({error:'Comprovante não encontrado.'});const payload=JSON.parse(row.payload);await enqueuePrint('reprint-customer-receipt-'+row.id+'-'+Date.now(),'receipt',payload);res.json({ok:true});}catch(e){console.error(e);res.status(500).json({error:'Não foi possível reimprimir o comprovante.'})}});
app.post('/api/admin/print/command/:id',auth,async(req,res)=>{try{
 const id=Number(req.params.id),c=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[id]);
 if(!c)return res.status(404).json({error:'Comanda não encontrada'});
 const items=await q('SELECT * FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[id]);
 let payments=await q('SELECT payment,amount,customer FROM command_payments WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[id]);
 if(!payments.length&&c.payment)payments=[{payment:c.payment,amount:Number(c.total||0),customer:c.customer||''}];
 const stage=String(req.body.stage||'conferencia');
 const basePayload={title:stage==='paga'?'COMPROVANTE DE VENDA':'CONFERÊNCIA DE CONTA',stage,command:c.number,customer:c.customer||'',items,total:Number(c.total||0),payment:c.payment||'Pendente',payments,created_at:c.closed_at||c.created_at};
 const key='command-'+(stage==='paga'?'receipt':'bill')+'-'+id+'-'+Date.now();
 await enqueuePrint(key,stage==='paga'?'receipt':'bill',basePayload);
 let individualCount=0;
 if(stage==='paga'){
  const fiadoParts=payments.filter(p=>String(p.payment||'').toLowerCase()==='fiado'&&String(p.customer||'').trim());
  const customers=await q('SELECT id,name FROM customers');
  for(const part of fiadoParts){
   const customer=customers.find(x=>normText(x.name)===normText(part.customer));
   if(!customer)continue;
   const individual={...basePayload,receiptType:'fiado_individual',fiadoCustomer:customer.name,fiadoAmount:Number(part.amount||0),title:'COMPROVANTE INDIVIDUAL DE FIADO'};
   const archived=await one('SELECT id FROM command_receipts WHERE command_id='+(isPg?'$1':'?')+' AND customer_id='+(isPg?'$2':'?'),[id,customer.id]);
   if(!archived)await run('INSERT INTO command_receipts(command_id,customer_id,customer_name,fiado_amount,payload) VALUES('+(isPg?'$1,$2,$3,$4,$5':'?,?,?,?,?')+')',[id,customer.id,customer.name,Number(part.amount||0),JSON.stringify(individual)]);
   await enqueuePrint('command-'+id+'-fiado-customer-'+customer.id+'-'+Date.now(),'receipt',individual);
   individualCount++;
  }
 }
 res.json({ok:true,individual_receipts:individualCount});
}catch(e){console.error(e);res.status(500).json({error:'Não foi possível enfileirar a impressão'})}});
app.post('/api/admin/print/order-receipt/:id',auth,async(req,res)=>{try{const id=Number(req.params.id),o=await one('SELECT * FROM orders WHERE id='+(isPg?'$1':'?'),[id]);if(!o)return res.status(404).json({error:'Pedido não encontrado'});if(!(o.payment_confirmed===true||o.payment_confirmed===1))return res.status(400).json({error:'Confirme o recebimento do pagamento antes de imprimir o comprovante.'});const items=await q('SELECT * FROM order_items WHERE order_id='+(isPg?'$1':'?')+' ORDER BY id',[id]);const subtotal=items.reduce((sum,it)=>sum+Number(it.total||0),0);await enqueuePrint('receipt-order-paid-'+id,'receipt',{title:'COMPROVANTE DE VENDA — PAGAMENTO CONFIRMADO',order:id,customer:o.customer_name,type:o.type,address:o.address,notes:o.notes,items,subtotal,delivery_fee:Math.max(0,Number(o.total||0)-subtotal),total:Number(o.total||0),payment:o.payment||'',created_at:o.created_at});res.json({ok:true})}catch(e){console.error(e);res.status(500).json({error:'Não foi possível enfileirar o comprovante'})}});
app.get('/api/config',async(req,res)=>{try{const capacity=await getSandwichCapacity();res.set('Cache-Control','no-store');res.json({delivery_fee:DELIVERY_FEE,...capacity,sandwich_message:capacity.sandwich_paused?'Estamos temporariamente sem capacidade para receber novos pedidos de sanduíches. Os demais produtos continuam disponíveis.':''});}catch(e){console.error('Falha ao consultar capacidade de sanduíches:',e);res.status(500).json({error:'Não foi possível consultar a disponibilidade.'})}});
app.get('/api/admin/sandwich-capacity',auth,async(req,res)=>{try{res.json(await getSandwichCapacity())}catch(e){res.status(500).json({error:'Não foi possível carregar o limite de sanduíches.'})}});
app.put('/api/admin/sandwich-capacity',auth,async(req,res)=>{try{const limit=await saveSandwichLimit(req.body?.sandwich_limit);res.json({ok:true,...await getSandwichCapacity()})}catch(e){res.status(400).json({error:e.message||'Não foi possível salvar o limite.'})}});
app.get('/api/products',async(req,res)=>{try{const rows=await q('SELECT * FROM products WHERE active = '+(isPg?'true':'1')+" AND COALESCE(product_type,'venda') <> 'insumo' ORDER BY category,name");res.json(rows);}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/admin/suppliers',auth,async(req,res)=>{try{res.json(await q('SELECT * FROM suppliers ORDER BY name'))}catch(e){console.error(e);res.status(500).json({error:'Não foi possível carregar fornecedores.'})}});
app.post('/api/admin/suppliers',auth,async(req,res)=>{try{const name=String(req.body.name||'').trim(),cnpj=String(req.body.cnpj||'').replace(/\D/g,'');if(!name||cnpj.length!==14)return res.status(400).json({error:'Informe a razão social e um CNPJ válido com 14 dígitos.'});let row;if(isPg){const r=await db.query('INSERT INTO suppliers(name,cnpj) VALUES($1,$2) ON CONFLICT(cnpj) DO UPDATE SET name=EXCLUDED.name RETURNING *',[name,cnpj]);row=r.rows[0]}else{await run('INSERT INTO suppliers(name,cnpj) VALUES(?,?) ON CONFLICT(cnpj) DO UPDATE SET name=excluded.name',[name,cnpj]);row=await one('SELECT * FROM suppliers WHERE cnpj=?',[cnpj])}res.json({ok:true,supplier:row,message:'Fornecedor cadastrado/atualizado.'})}catch(e){console.error(e);res.status(500).json({error:'Não foi possível cadastrar o fornecedor.'})}});
app.put('/api/admin/suppliers/:id',auth,async(req,res)=>{try{const id=Number(req.params.id),name=String(req.body.name||'').trim(),cnpj=String(req.body.cnpj||'').replace(/\D/g,'');if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'Fornecedor inválido.'});if(!name||cnpj.length!==14)return res.status(400).json({error:'Informe a razão social e um CNPJ válido com 14 dígitos.'});let result;if(isPg){result=await db.query('UPDATE suppliers SET name=$1,cnpj=$2 WHERE id=$3 RETURNING *',[name,cnpj,id]);if(!result.rows[0])return res.status(404).json({error:'Fornecedor não encontrado.'});res.json({ok:true,supplier:result.rows[0],message:'Fornecedor atualizado com sucesso.'});}else{const existing=await one('SELECT id FROM suppliers WHERE id=?',[id]);if(!existing)return res.status(404).json({error:'Fornecedor não encontrado.'});await run('UPDATE suppliers SET name=?,cnpj=? WHERE id=?',[name,cnpj,id]);res.json({ok:true,supplier:await one('SELECT * FROM suppliers WHERE id=?',[id]),message:'Fornecedor atualizado com sucesso.'});}}catch(e){if(String(e.message||'').toLowerCase().includes('unique')||String(e.message||'').toLowerCase().includes('duplicate'))return res.status(409).json({error:'Já existe outro fornecedor cadastrado com esse CNPJ.'});console.error(e);res.status(500).json({error:'Não foi possível atualizar o fornecedor.'})}});
app.get('/api/admin/purchases',auth,async(req,res)=>{try{res.json(await q('SELECT * FROM purchase_invoices ORDER BY id DESC LIMIT 100'))}catch(e){console.error(e);res.status(500).json({error:'Não foi possível carregar as notas de compra.'})}});
app.get('/api/admin/purchases/:id',auth,async(req,res)=>{try{
 const id=Number(req.params.id);if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Nota inválida.'});
 const invoice=await one('SELECT * FROM purchase_invoices WHERE id='+(isPg?'$1':'?'),[id]);
 if(!invoice)return res.status(404).json({error:'Nota fiscal não encontrada.'});
 const lines=await q('SELECT l.*,p.name AS current_product_name FROM purchase_invoice_lines l LEFT JOIN products p ON p.id=l.product_id WHERE l.invoice_id='+(isPg?'$1':'?')+' ORDER BY l.id',[id]);
 res.json({invoice,lines});
}catch(e){console.error(e);res.status(500).json({error:'Não foi possível abrir os detalhes desta nota.'})}});

app.get('/api/admin/inventory/movements',auth,async(req,res)=>{try{res.json(await q('SELECT m.*,p.name AS current_product_name FROM inventory_movements m LEFT JOIN products p ON p.id=m.product_id ORDER BY m.id DESC LIMIT 200'))}catch(e){console.error(e);res.status(500).json({error:'Não foi possível carregar o histórico do estoque.'})}});
// Exclusão controlada do lançamento de teste da NF-e 2776027.
// Reverte somente as quantidades efetivamente lançadas por essa nota; preserva produtos,
// fornecedores e vínculos de códigos do fornecedor.
app.delete('/api/admin/purchases/test-reset/2776027',auth,async(req,res)=>{
 const invoiceNumber='2776027';
 let client=null;
 try{
  if(isPg){
   client=await db.connect();
   await client.query('BEGIN');
   const found=await client.query("SELECT * FROM purchase_invoices WHERE TRIM(invoice_number)=$1 FOR UPDATE",[invoiceNumber]);
   if(found.rows.length===0){await client.query('ROLLBACK');return res.status(404).json({error:'A NF-e de teste 2776027 não foi encontrada no histórico.'});}
   if(found.rows.length!==1){await client.query('ROLLBACK');return res.status(409).json({error:'Há mais de um lançamento com esse número. Nenhum dado foi alterado.'});}
   const invoice=found.rows[0];
   const lines=(await client.query('SELECT * FROM purchase_invoice_lines WHERE invoice_id=$1 ORDER BY id FOR UPDATE',[invoice.id])).rows;
   if(!lines.length){await client.query('ROLLBACK');return res.status(409).json({error:'A nota não possui itens vinculados para estornar. Nenhum dado foi alterado.'});}
   const totals=new Map();
   for(const l of lines){const id=Number(l.product_id);if(!id)continue;const t=totals.get(id)||{stock:0,secondary:0};t.stock+=Number(l.stock_qty||0);t.secondary+=Number(l.secondary_qty||0);totals.set(id,t);}
   for(const [id,t] of totals){
    const pr=(await client.query('SELECT id,name,stock,stock_secondary FROM products WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!pr)throw new Error('Produto vinculado à nota não encontrado (ID '+id+').');
    if(Number(pr.stock||0)+0.0001<t.stock)throw new Error('Estoque insuficiente para estornar '+pr.name+'. Atual: '+Number(pr.stock||0)+'; quantidade recebida nesta nota: '+t.stock+'. Nenhum dado foi alterado.');
    if(Number(pr.stock_secondary||0)+0.0001<t.secondary)throw new Error('Estoque secundário insuficiente para estornar '+pr.name+'. Nenhum dado foi alterado.');
   }
   for(const [id,t] of totals)await client.query('UPDATE products SET stock=GREATEST(0,COALESCE(stock,0)-$1),stock_secondary=GREATEST(0,COALESCE(stock_secondary,0)-$2) WHERE id=$3',[t.stock,t.secondary,id]);
   await client.query('DELETE FROM inventory_movements WHERE invoice_id=$1',[invoice.id]);
   await client.query('DELETE FROM purchase_invoice_lines WHERE invoice_id=$1',[invoice.id]);
   await client.query('DELETE FROM purchase_invoices WHERE id=$1',[invoice.id]);
   await client.query('COMMIT');
   return res.json({ok:true,message:'Lançamento de teste da NF-e 2776027 excluído e estoque estornado. Produtos, fornecedores e vínculos foram preservados.'});
  }
  const perform=db.transaction(()=>{
   const found=db.prepare("SELECT * FROM purchase_invoices WHERE TRIM(invoice_number)=?").all(invoiceNumber);
   if(found.length===0)throw Object.assign(new Error('A NF-e de teste 2776027 não foi encontrada no histórico.'),{status:404});
   if(found.length!==1)throw Object.assign(new Error('Há mais de um lançamento com esse número. Nenhum dado foi alterado.'),{status:409});
   const invoice=found[0],lines=db.prepare('SELECT * FROM purchase_invoice_lines WHERE invoice_id=? ORDER BY id').all(invoice.id);
   if(!lines.length)throw Object.assign(new Error('A nota não possui itens vinculados para estornar. Nenhum dado foi alterado.'),{status:409});
   const totals=new Map();
   for(const l of lines){const id=Number(l.product_id);if(!id)continue;const t=totals.get(id)||{stock:0,secondary:0};t.stock+=Number(l.stock_qty||0);t.secondary+=Number(l.secondary_qty||0);totals.set(id,t);}
   for(const [id,t] of totals){const pr=db.prepare('SELECT id,name,stock,stock_secondary FROM products WHERE id=?').get(id);if(!pr)throw new Error('Produto vinculado à nota não encontrado (ID '+id+').');if(Number(pr.stock||0)+0.0001<t.stock)throw new Error('Estoque insuficiente para estornar '+pr.name+'. Atual: '+Number(pr.stock||0)+'; quantidade recebida nesta nota: '+t.stock+'. Nenhum dado foi alterado.');if(Number(pr.stock_secondary||0)+0.0001<t.secondary)throw new Error('Estoque secundário insuficiente para estornar '+pr.name+'. Nenhum dado foi alterado.');}
   for(const [id,t] of totals)db.prepare('UPDATE products SET stock=MAX(0,COALESCE(stock,0)-?),stock_secondary=MAX(0,COALESCE(stock_secondary,0)-?) WHERE id=?').run(t.stock,t.secondary,id);
   db.prepare('DELETE FROM inventory_movements WHERE invoice_id=?').run(invoice.id);
   db.prepare('DELETE FROM purchase_invoice_lines WHERE invoice_id=?').run(invoice.id);
   db.prepare('DELETE FROM purchase_invoices WHERE id=?').run(invoice.id);
  });
  perform();
  return res.json({ok:true,message:'Lançamento de teste da NF-e 2776027 excluído e estoque estornado. Produtos, fornecedores e vínculos foram preservados.'});
 }catch(e){
  if(isPg&&client){try{await client.query('ROLLBACK')}catch(_){}}
  console.error('Exclusão controlada da NF-e de teste 2776027:',e);
  return res.status(e.status||409).json({error:e.message||'Não foi possível excluir o lançamento de teste. Nenhum dado foi alterado.'});
 }finally{if(client)client.release();}
});

app.post('/api/admin/purchases/receive',auth,async(req,res)=>{try{
 const b=req.body||{}, key=String(b.access_key||'').trim(), lines=Array.isArray(b.lines)?b.lines:[];
 if(!key||!/^\d{44}$/.test(key))return res.status(400).json({error:'A chave de acesso da NF-e deve conter 44 dígitos.'});
 if(!lines.length)return res.status(400).json({error:'A nota não possui itens para receber.'});
 if(await one('SELECT id FROM purchase_invoices WHERE access_key='+(isPg?'$1':'?'),[key]))return res.status(409).json({error:'Esta nota fiscal já foi recebida. O estoque não foi alterado.'});
 for(const l of lines){if(!Number.isInteger(Number(l.product_id))||Number(l.product_id)<=0||!Number.isFinite(Number(l.stock_qty))||Number(l.stock_qty)<=0||!String(l.stock_unit||'').trim())return res.status(400).json({error:'Confira todos os produtos vinculados e as quantidades de entrada antes de confirmar.'});}
 let invoiceId;const inv={access_key:key,invoice_number:String(b.invoice_number||''),series:String(b.series||''),supplier_name:String(b.supplier_name||''),supplier_cnpj:String(b.supplier_cnpj||''),issue_date:String(b.issue_date||''),total:Number(b.total||0),xml_content:String(b.xml_content||'')};
 const supplierCnpj=String(inv.supplier_cnpj||'').replace(/\D/g,'');if(inv.supplier_name&&supplierCnpj.length===14){if(isPg)await db.query('INSERT INTO suppliers(name,cnpj) VALUES($1,$2) ON CONFLICT(cnpj) DO UPDATE SET name=EXCLUDED.name',[inv.supplier_name,supplierCnpj]);else await run('INSERT INTO suppliers(name,cnpj) VALUES(?,?) ON CONFLICT(cnpj) DO UPDATE SET name=excluded.name',[inv.supplier_name,supplierCnpj]);}for(const l of lines){const code=String(l.code||'').trim();if(supplierCnpj.length===14&&code){const mapped=await one('SELECT product_id FROM supplier_product_codes WHERE supplier_cnpj='+(isPg?'$1':'?')+' AND supplier_code='+(isPg?'$2':'?'),[supplierCnpj,code]);if(mapped&&Number(mapped.product_id)!==Number(l.product_id))return res.status(409).json({error:'O código '+code+' deste fornecedor já está vinculado a outro produto. Nenhuma entrada foi registrada; confira o vínculo.'});}}
 if(isPg){const r=await db.query('INSERT INTO purchase_invoices(access_key,invoice_number,series,supplier_name,supplier_cnpj,issue_date,total,xml_content) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[inv.access_key,inv.invoice_number,inv.series,inv.supplier_name,inv.supplier_cnpj,inv.issue_date,inv.total,inv.xml_content]);invoiceId=r.rows[0].id;}else{const r=await run('INSERT INTO purchase_invoices(access_key,invoice_number,series,supplier_name,supplier_cnpj,issue_date,total,xml_content) VALUES(?,?,?,?,?,?,?,?)',[inv.access_key,inv.invoice_number,inv.series,inv.supplier_name,inv.supplier_cnpj,inv.issue_date,inv.total,inv.xml_content]);invoiceId=r.lastID;}
 for(const l of lines){const pid=Number(l.product_id),sq=Number(l.stock_qty),sec=Number(l.secondary_qty||0),cost=Number(l.line_total||0),unit=String(l.stock_unit||'un'),secUnit=String(l.secondary_unit||'');const prod=await one('SELECT * FROM products WHERE id='+(isPg?'$1':'?'),[pid]);if(!prod)throw new Error('Produto vinculado não encontrado (ID '+pid+').');
 if(isPg){await db.query(`UPDATE products SET stock=COALESCE(stock,0)+$1,unit=$2,stock_secondary=COALESCE(stock_secondary,0)+$3,stock_secondary_unit=CASE WHEN $4 <> '' THEN $4 ELSE stock_secondary_unit END,cost_price=$5 WHERE id=$6`,[sq,unit,sec,secUnit,cost/sq,pid]);await db.query('INSERT INTO purchase_invoice_lines(invoice_id,product_id,product_name,code,purchase_qty,purchase_unit,purchase_unit_price,line_total,stock_qty,stock_unit,secondary_qty,secondary_unit) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[invoiceId,pid,String(l.product_name||prod.name),String(l.code||''),Number(l.purchase_qty||0),String(l.purchase_unit||''),Number(l.purchase_unit_price||0),cost,sq,unit,sec,secUnit]);await db.query('INSERT INTO inventory_movements(product_id,invoice_id,quantity,unit,secondary_quantity,secondary_unit,cost_total,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[pid,invoiceId,sq,unit,sec,secUnit,cost,'Entrada NF-e '+inv.invoice_number+' — '+inv.supplier_name]);}
 else{await run(`UPDATE products SET stock=COALESCE(stock,0)+?,unit=?,stock_secondary=COALESCE(stock_secondary,0)+?,stock_secondary_unit=CASE WHEN ? <> '' THEN ? ELSE stock_secondary_unit END,cost_price=? WHERE id=?`,[sq,unit,sec,secUnit,secUnit,cost/sq,pid]);await run('INSERT INTO purchase_invoice_lines(invoice_id,product_id,product_name,code,purchase_qty,purchase_unit,purchase_unit_price,line_total,stock_qty,stock_unit,secondary_qty,secondary_unit) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[invoiceId,pid,String(l.product_name||prod.name),String(l.code||''),Number(l.purchase_qty||0),String(l.purchase_unit||''),Number(l.purchase_unit_price||0),cost,sq,unit,sec,secUnit]);await run('INSERT INTO inventory_movements(product_id,invoice_id,quantity,unit,secondary_quantity,secondary_unit,cost_total,description) VALUES(?,?,?,?,?,?,?,?)',[pid,invoiceId,sq,unit,sec,secUnit,cost,'Entrada NF-e '+inv.invoice_number+' — '+inv.supplier_name]);}
 const supplierCode=String(l.code||'').trim();if(supplierCnpj.length===14&&supplierCode){if(isPg)await db.query('INSERT INTO supplier_product_codes(supplier_cnpj,supplier_code,product_id) VALUES($1,$2,$3) ON CONFLICT(supplier_cnpj,supplier_code) DO NOTHING',[supplierCnpj,supplierCode,pid]);else await run('INSERT OR IGNORE INTO supplier_product_codes(supplier_cnpj,supplier_code,product_id) VALUES(?,?,?)',[supplierCnpj,supplierCode,pid]);}
 }
 res.json({ok:true,invoice_id:invoiceId,received_lines:lines.length,message:'Nota recebida e estoque atualizado.'});
 }catch(e){console.error('Erro ao receber NF-e:',e);res.status(500).json({error:'Falha ao receber a nota. Confira o histórico antes de tentar novamente: '+e.message})}});
app.post('/api/admin/products/xml-match',auth,async(req,res)=>{try{const b=req.body||{},cnpj=String(b.supplier_cnpj||'').replace(/\D/g,''),code=String(b.supplier_code||'').trim(),barcode=String(b.barcode||'').replace(/\D/g,''),name=String(b.name||'').trim();let product=null,reason='';if(cnpj&&code){const map=await one('SELECT product_id FROM supplier_product_codes WHERE supplier_cnpj='+(isPg?'$1':'?')+' AND supplier_code='+(isPg?'$2':'?'),[cnpj,code]);if(map){product=await one('SELECT * FROM products WHERE id='+(isPg?'$1':'?'),[map.product_id]);if(product)reason='código deste fornecedor';}}if(!product&&barcode){product=await one('SELECT * FROM products WHERE barcode='+(isPg?'$1':'?')+' ORDER BY active DESC,id LIMIT 1',[barcode]);if(product)reason='código de barras';}if(!product&&name){const rows=await q('SELECT * FROM products WHERE LOWER(TRIM(name))=LOWER(TRIM('+(isPg?'$1':'?')+')) ORDER BY active DESC,id',[name]);if(rows.length===1){product=rows[0];reason='nome exato';}}res.json({found:!!product,product:product||null,reason});}catch(e){console.error('XML product match:',e);res.status(500).json({error:'Não foi possível identificar o produto correspondente.'})}});
app.get('/api/admin/products',auth,async(req,res)=>{try{const type=String(req.query.type||'venda');const where=type==='all'?'':' WHERE COALESCE(product_type,\'venda\') = '+(type==='insumo'?"'insumo'":"'venda'");res.json(await q('SELECT * FROM products'+where+' ORDER BY category,name'));}catch(e){res.status(500).json({error:'Não foi possível carregar os produtos.'});}});
app.get('/api/admin/products/diagnostic',auth,async(req,res)=>{
 try{
  const rows=await q('SELECT * FROM products ORDER BY id');
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const names=new Map(),barcodes=new Map();
  for(const p of rows){const n=norm(p.name);if(n)names.set(n,[...(names.get(n)||[]),p.id]);const b=String(p.barcode||'').replace(/\D/g,'');if(b)barcodes.set(b,[...(barcodes.get(b)||[]),p.id]);}
  const validEan=value=>{const s=String(value||'').replace(/\D/g,'');if(![8,12,13,14].includes(s.length))return false;let sum=0,weight=3;for(let i=s.length-2;i>=0;i--){sum+=Number(s[i])*weight;weight=weight===3?1:3;}return (10-(sum%10))%10===Number(s[s.length-1]);};
  const diagnosed=rows.map(p=>{const flags=[];const nameKey=norm(p.name);const barcode=String(p.barcode||'').replace(/\D/g,'');if(nameKey&&(names.get(nameKey)||[]).length>1)flags.push('NOME REPETIDO');if(barcode&&(barcodes.get(barcode)||[]).length>1)flags.push('EAN REPETIDO');if(!barcode)flags.push('SEM EAN');else if(!validEan(barcode))flags.push('EAN FORA DO PADRÃO/INVÁLIDO');if(!String(p.brand||'').trim())flags.push('SEM MARCA');if(!String(p.category||'').trim())flags.push('SEM CATEGORIA');if(!String(p.unit||'').trim())flags.push('SEM UNIDADE');if(Number(p.price||0)<=0)flags.push('SEM PREÇO DE VENDA');if(Number(p.cost_price||0)<=0)flags.push('SEM CUSTO');return {...p,diagnostic_flags:flags.join(' | ')};});
  const count=key=>diagnosed.filter(p=>p.diagnostic_flags.split(' | ').includes(key)).length;
  res.json({generated_at:new Date().toISOString(),total:rows.length,duplicate_name_groups:[...names.values()].filter(a=>a.length>1).length,duplicate_ean_groups:[...barcodes.values()].filter(a=>a.length>1).length,without_ean:count('SEM EAN'),invalid_ean:count('EAN FORA DO PADRÃO/INVÁLIDO'),without_brand:count('SEM MARCA'),without_category:count('SEM CATEGORIA'),without_unit:count('SEM UNIDADE'),without_sale_price:count('SEM PREÇO DE VENDA'),without_cost:count('SEM CUSTO'),products:diagnosed});
 }catch(e){console.error('Diagnóstico de produtos:',e);res.status(500).json({error:'Não foi possível gerar o diagnóstico dos produtos.'});}
});
app.get('/api/admin/database/backup',auth,async(req,res)=>{
 if(isPg)return res.status(400).json({error:'Esta rotina de backup está disponível somente para SQLite.'});
 const file=path.join(os.tmpdir(),'esp-reinaldo-backup-'+Date.now()+'.sqlite');
 try{await db.backup(file);res.setHeader('Content-Type','application/vnd.sqlite3');res.setHeader('Content-Disposition','attachment; filename="esp-reinaldo-backup.sqlite"');const stream=fs.createReadStream(file);stream.on('error',err=>{console.error('Leitura do backup:',err);if(!res.headersSent)res.status(500).end('Falha ao transferir backup');});stream.on('close',()=>fs.promises.unlink(file).catch(()=>{}));stream.pipe(res);}catch(e){console.error('Backup SQLite:',e);fs.promises.unlink(file).catch(()=>{});res.status(500).json({error:'Não foi possível gerar o backup do banco SQLite.'});}
});

// Fichas técnicas: um único cadastro de insumo pode participar de várias receitas.
app.get('/api/admin/recipes',auth,async(req,res)=>{try{
 const products=await q("SELECT id,name,category,price,unit,product_type,active FROM products WHERE COALESCE(product_type,'venda')='venda' ORDER BY name");
 const ingredients=await q("SELECT id,name,category,unit,cost_price,stock,min_stock,active FROM products WHERE COALESCE(product_type,'venda')='insumo' ORDER BY name");
 const productId=Number(req.query.product_id||0);let rows=[];
 if(productId)rows=await q('SELECT r.*,p.name AS ingredient_name,p.cost_price,p.stock AS ingredient_stock,p.unit AS ingredient_unit FROM technical_recipe_items r JOIN products p ON p.id=r.ingredient_id WHERE r.sale_product_id='+(isPg?'$1':'?')+' ORDER BY p.name',[productId]);
 res.json({products,ingredients,items:rows.map(x=>({...x,quantity:Number(x.quantity||0),cost:Number(x.quantity||0)*Number(x.cost_price||0)}))});
 }catch(e){console.error('Carregar fichas técnicas:',e);res.status(500).json({error:'Não foi possível carregar as fichas técnicas.'})}});
app.put('/api/admin/recipes/:productId',auth,async(req,res)=>{try{
 const productId=Number(req.params.productId),product=await one("SELECT id,name FROM products WHERE id="+(isPg?'$1':'?')+" AND COALESCE(product_type,'venda')='venda'",[productId]);
 if(!product)return res.status(404).json({error:'Produto de venda não encontrado.'});
 const items=Array.isArray(req.body?.items)?req.body.items:[];const normalized=[];const seen=new Set();
 for(const row of items){const ingredientId=Number(row.ingredient_id),quantity=productNumber(row.quantity),unit=String(row.unit||'').trim();if(!Number.isInteger(ingredientId)||ingredientId<=0||!(quantity>0)||!Number.isFinite(quantity)||!unit)return res.status(400).json({error:'Confira o ingrediente, a quantidade e a unidade de cada linha.'});if(seen.has(ingredientId))return res.status(400).json({error:'O mesmo insumo não pode aparecer duas vezes na mesma ficha. Some as quantidades em uma única linha.'});seen.add(ingredientId);const ingredient=await one("SELECT id,name,unit FROM products WHERE id="+(isPg?'$1':'?')+" AND COALESCE(product_type,'venda')='insumo' AND active="+(isPg?'TRUE':'1'),[ingredientId]);if(!ingredient)return res.status(400).json({error:'Um dos ingredientes não está cadastrado como insumo ativo.'});if(unit!==String(ingredient.unit||''))return res.status(400).json({error:'A unidade da ficha deve ser a mesma unidade-base do insumo '+ingredient.name+' ('+ingredient.unit+').'});normalized.push({ingredientId,quantity,unit,notes:String(row.notes||'').slice(0,200)});}
 if(isPg){await db.query('BEGIN');try{await db.query('DELETE FROM technical_recipe_items WHERE sale_product_id=$1',[productId]);for(const x of normalized)await db.query('INSERT INTO technical_recipe_items(sale_product_id,ingredient_id,quantity,unit,notes) VALUES($1,$2,$3,$4,$5)',[productId,x.ingredientId,x.quantity,x.unit,x.notes]);await db.query('COMMIT')}catch(e){await db.query('ROLLBACK');throw e}}
 else{const tx=db.transaction(()=>{db.prepare('DELETE FROM technical_recipe_items WHERE sale_product_id=?').run(productId);const ins=db.prepare('INSERT INTO technical_recipe_items(sale_product_id,ingredient_id,quantity,unit,notes) VALUES(?,?,?,?,?)');for(const x of normalized)ins.run(productId,x.ingredientId,x.quantity,x.unit,x.notes)});tx();}
 const saved=await q('SELECT r.*,p.name AS ingredient_name,p.cost_price FROM technical_recipe_items r JOIN products p ON p.id=r.ingredient_id WHERE r.sale_product_id='+(isPg?'$1':'?')+' ORDER BY p.name',[productId]);res.json({ok:true,product,items:saved.map(x=>({...x,quantity:Number(x.quantity),cost:Number(x.quantity)*Number(x.cost_price||0)})),message:'Ficha técnica salva.'});
 }catch(e){console.error('Salvar ficha técnica:',e);res.status(500).json({error:'Não foi possível salvar a ficha técnica.'})}});

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
app.post('/api/admin/products',auth,async(req,res)=>{try{const b=req.body||{};const name=String(b.name||'').trim();if(!name)return res.status(400).json({error:'Nome obrigatório'});const barcode=String(b.barcode||'').replace(/\s/g,'').trim();if(barcode){const existing=await one('SELECT id,name,internal_code FROM products WHERE barcode='+(isPg?'$1':'?')+' LIMIT 1',[barcode]);if(existing)return res.status(409).json({error:`Este código de barras já está cadastrado em ${existing.name} (${existing.internal_code||'ID '+existing.id}). Abra o cadastro existente para evitar duplicidade.`,duplicate:existing});}const data={name,category:String(b.category||'Outros'),description:String(b.description||''),product_type:b.product_type==='insumo'?'insumo':'venda',supplier_id:b.supplier_id?Number(b.supplier_id):null,stock_secondary:productNumber(b.stock_secondary),stock_secondary_unit:String(b.stock_secondary_unit||''),price:productNumber(b.price),image:String(b.image||''),active:isPg?(b.active!==false):(b.active!==false?1:0),barcode,brand:String(b.brand||''),unit:String(b.unit||'un'),cost_price:productNumber(b.cost_price),stock:productNumber(b.stock),min_stock:productNumber(b.min_stock),prepare_kitchen:isPg?!!(b.print_command??b.prepare_kitchen):(b.print_command??b.prepare_kitchen?1:0),print_site:isPg?(b.print_site!==false):(b.print_site!==false?1:0),print_command:isPg?!!(b.print_command??b.prepare_kitchen):(b.print_command??b.prepare_kitchen?1:0),sale_options:JSON.stringify(Array.isArray(b.sale_options)?b.sale_options:[])};if(![data.price,data.cost_price,data.stock,data.min_stock].every(Number.isFinite))return res.status(400).json({error:'Preço e estoque devem ser números válidos.'});const cols=Object.keys(data);const vals=Object.values(data);const sql=isPg?`INSERT INTO products(${cols.join(',')}) VALUES(${cols.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id`:`INSERT INTO products(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`;const r=await run(sql,vals);const id=Number(r.lastID);const internalCode='ER'+String(id).padStart(6,'0');await run('UPDATE products SET internal_code='+(isPg?'$1':'?')+' WHERE id='+(isPg?'$2':'?'),[internalCode,id]);const row=await one('SELECT * FROM products WHERE id='+(isPg?'$1':'?'),[id]);res.json(row);}catch(e){console.error('Erro ao cadastrar produto:',e);res.status(500).json({error:'Não foi possível cadastrar o produto.'});}});
app.put('/api/admin/products/:id',auth,async(req,res)=>{try{const id=Number(req.params.id);const b=req.body||{};const name=String(b.name||'').trim();if(!name)return res.status(400).json({error:'Nome obrigatório'});const existingProduct=await one('SELECT product_type FROM products WHERE id='+(isPg?'$1':'?'),[id]);if(!existingProduct)return res.status(404).json({error:'Produto não encontrado.'});const requestedBarcode=String(b.barcode||'').replace(/\s/g,'').trim();if(requestedBarcode){const duplicate=await one('SELECT id,name,internal_code FROM products WHERE barcode='+(isPg?'$1':'?')+' AND id<>'+(isPg?'$2':'?')+' LIMIT 1',[requestedBarcode,id]);if(duplicate)return res.status(409).json({error:`Este código de barras já pertence a ${duplicate.name} (${duplicate.internal_code||'ID '+duplicate.id}).`,duplicate});}const data={name,category:String(b.category||'Outros'),description:String(b.description||''),product_type:b.product_type==='insumo'?'insumo':(b.product_type==='venda'?'venda':(existingProduct.product_type||'venda')),supplier_id:b.supplier_id?Number(b.supplier_id):null,stock_secondary:productNumber(b.stock_secondary),stock_secondary_unit:String(b.stock_secondary_unit||''),price:productNumber(b.price),image:String(b.image||''),active:isPg?(b.active!==false):(b.active!==false?1:0),barcode:requestedBarcode,brand:String(b.brand||''),unit:String(b.unit||'un'),cost_price:productNumber(b.cost_price),stock:productNumber(b.stock),min_stock:productNumber(b.min_stock),prepare_kitchen:isPg?!!(b.print_command??b.prepare_kitchen):(b.print_command??b.prepare_kitchen?1:0),print_site:isPg?(b.print_site!==false):(b.print_site!==false?1:0),print_command:isPg?!!(b.print_command??b.prepare_kitchen):(b.print_command??b.prepare_kitchen?1:0),sale_options:JSON.stringify(Array.isArray(b.sale_options)?b.sale_options:[])};const cols=Object.keys(data);const vals=Object.values(data);if(isPg){const sets=cols.map((c,i)=>c+'=$'+(i+1)).join(',');const r=await db.query(`UPDATE products SET ${sets} WHERE id=$${cols.length+1} RETURNING *`,[...vals,id]);if(!r.rows.length)return res.status(404).json({error:'Produto não encontrado.'});return res.json(r.rows[0]);}await run(`UPDATE products SET ${cols.map(c=>c+'=?').join(',')} WHERE id=?`,[...vals,id]);const row=await one('SELECT * FROM products WHERE id=?',[id]);if(!row)return res.status(404).json({error:'Produto não encontrado.'});res.json(row);}catch(e){console.error('Erro ao atualizar produto:',e);res.status(500).json({error:'Não foi possível atualizar o produto.'});}});


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

// Exclusão definitiva restrita aos oito cadastros de teste autorizados pelo responsável.
const TEST_PRODUCT_CODES=['ER000003','ER000011','ER000012','ER000060','ER000064','ER000065','ER000066','ER000067','ER000068','ER000069','ER000070','ER000071'];
// Estes dois bolos são itens internos/insumos e não devem aparecer no cardápio público.
const INTERNAL_SUPPLY_CODES=['ER000055','ER000056'];
app.post('/api/admin/products/mark-internal/:code',auth,async(req,res)=>{
 const code=String(req.params.code||'').toUpperCase();
 if(!INTERNAL_SUPPLY_CODES.includes(code))return res.status(403).json({error:'Código não autorizado para esta alteração.'});
 try{
  const sql=isPg?"UPDATE products SET product_type='insumo', print_site=FALSE WHERE internal_code=$1 RETURNING *":"UPDATE products SET product_type='insumo', print_site=0 WHERE internal_code=?";
  if(isPg){const r=await db.query(sql,[code]);if(!r.rows.length)return res.status(404).json({error:'Produto não encontrado.'});return res.json({ok:true,product:r.rows[0],message:'Produto marcado como insumo e ocultado da vitrine.'});}
  const r=await run(sql,[code]);if(!r.changes)return res.status(404).json({error:'Produto não encontrado.'});
  const product=await one('SELECT * FROM products WHERE internal_code=?',[code]);
  return res.json({ok:true,product,message:'Produto marcado como insumo e ocultado da vitrine.'});
 }catch(e){console.error('Marcação de produto interno:',e);return res.status(500).json({error:'Não foi possível ocultar o produto da vitrine.'});}
});

app.delete('/api/admin/products/test-duplicates/:code',auth,async(req,res)=>{
 const code=String(req.params.code||'').toUpperCase();
 if(!TEST_PRODUCT_CODES.includes(code))return res.status(403).json({error:'Este cadastro não está na lista autorizada para exclusão.'});
 try{
  if(isPg){
   const client=await db.connect();
   try{
    await client.query('BEGIN');
    const found=await client.query('SELECT id,internal_code,name,stock,active FROM products WHERE internal_code=$1 FOR UPDATE',[code]);
    if(!found.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Produto não encontrado.'});}
    const product=found.rows[0];
    if(Number(product.stock||0)!==0){await client.query('ROLLBACK');return res.status(409).json({error:'Só é permitido excluir cadastro de teste com estoque zero.'});}
    const id=product.id;
    await client.query('UPDATE order_items SET product_id=NULL WHERE product_id=$1',[id]);
    await client.query('UPDATE command_items SET product_id=NULL WHERE product_id=$1',[id]);
    await client.query('UPDATE purchase_invoice_lines SET product_id=NULL WHERE product_id=$1',[id]);
    await client.query('DELETE FROM inventory_movements WHERE product_id=$1',[id]);
    await client.query('DELETE FROM supplier_product_codes WHERE product_id=$1',[id]);
    await client.query('DELETE FROM products WHERE id=$1',[id]);
    await client.query('COMMIT');
    return res.json({ok:true,code,message:'Cadastro de teste excluído.'});
   }catch(err){await client.query('ROLLBACK').catch(()=>{});throw err;}finally{client.release();}
  }
  const product=db.prepare('SELECT id,internal_code,name,stock,active FROM products WHERE internal_code=?').get(code);
  if(!product)return res.status(404).json({error:'Produto não encontrado.'});
  if(Number(product.stock||0)!==0)return res.status(409).json({error:'Só é permitido excluir cadastro de teste com estoque zero.'});
  const remove=db.transaction(()=>{
   const id=product.id;
   db.prepare('UPDATE order_items SET product_id=NULL WHERE product_id=?').run(id);
   db.prepare('UPDATE command_items SET product_id=NULL WHERE product_id=?').run(id);
   db.prepare('UPDATE purchase_invoice_lines SET product_id=NULL WHERE product_id=?').run(id);
   db.prepare('DELETE FROM inventory_movements WHERE product_id=?').run(id);
   db.prepare('DELETE FROM supplier_product_codes WHERE product_id=?').run(id);
   db.prepare('DELETE FROM products WHERE id=?').run(id);
  });
  remove();
  return res.json({ok:true,code,message:'Cadastro de teste excluído.'});
 }catch(e){console.error('Exclusão de cadastro de teste:',e);return res.status(500).json({error:'Não foi possível excluir o cadastro.'});}
});
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
  const debts=await q("SELECT * FROM commands WHERE status='fechada' AND LOWER(payment) IN ('fiado','misto')");
  for(const customer of rows){
   let used=0;
   for(const debt of debts){
    used+=await commandFiadoBalance(debt,customer.name);
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

let orderCreationQueue=Promise.resolve();
app.post('/api/orders',async(req,res)=>{
 let release;
 let orderIdForRollback=null;
 const appliedSiteItems=[];
 const previous=orderCreationQueue;
 orderCreationQueue=new Promise(resolve=>{release=resolve;});
 await previous;
 try{
  const {customer_name,phone='',type='balcao',address='',payment='',notes='',items=[]}=req.body;
  if(!customer_name||!Array.isArray(items)||!items.length)return res.status(400).json({error:'Nome e itens são obrigatórios'});
  let total=0,products=[];
  for(const it of items){
   const p=await one('SELECT * FROM products WHERE id='+(isPg?'$1':'?'),[Number(it.product_id)]);
   if(!p||!(p.active===true||p.active===1)||String(p.product_type||'venda')==='insumo')return res.status(400).json({error:'Produto indisponível para venda'});
   const qty=Number(it.qty)||1;
   if(!Number.isFinite(qty)||qty<=0)return res.status(400).json({error:'Quantidade inválida'});
   let sale;try{sale=resolveSale(p,it.sale_option_key,qty)}catch(e){return res.status(400).json({error:e.message})}
   const line=sale.price*qty;total+=line;products.push({p,qty,line,sale});
  }
  const containsSandwich=products.some(x=>isSandwichProduct(x.p));
  if(containsSandwich){
   const capacity=await getSandwichCapacity();
   if(capacity.sandwich_paused){
    return res.status(409).json({error:'Atingimos nosso limite de pedidos de sanduíches neste momento. Os sanduíches foram temporariamente pausados. Você pode retirar esses itens do carrinho e pedir os demais produtos.' ,sandwich_paused:true,...capacity});
   }
  }
  try{await ensureSaleInventoryAvailable(products)}catch(e){return res.status(409).json({error:e.message})}
  const deliveryFee=type==='entrega'?DELIVERY_FEE:0;
  total+=deliveryFee;
  let orderId,commandNo=String(req.body.command_no||'');
  const itemIds=[];
  if(isPg){
   const r=await db.query('INSERT INTO orders(customer_name,phone,type,address,payment,notes,status,total,command_no) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[customer_name,phone,type,address,payment,notes,'novo',total,commandNo]);
   orderId=r.rows[0].id;orderIdForRollback=Number(orderId);
   for(const x of products){const ir=await db.query('INSERT INTO order_items(order_id,product_id,name,qty,unit_price,total,sale_label,stock_qty,stock_unit) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[orderId,x.p.id,x.p.name+(x.sale.label?' — '+x.sale.label:''),x.qty,x.sale.price,x.line,x.sale.label,x.sale.stockQty,x.sale.stockUnit]);itemIds.push(ir.rows[0].id);}
  }else{
   const r=await run('INSERT INTO orders(customer_name,phone,type,address,payment,notes,status,total,command_no) VALUES(?,?,?,?,?,?,?,?,?)',[customer_name,phone,type,address,payment,notes,'novo',total,commandNo]);
   orderId=r.lastID;orderIdForRollback=Number(orderId);
   for(const x of products){const ir=await run('INSERT INTO order_items(order_id,product_id,name,qty,unit_price,total,sale_label,stock_qty,stock_unit) VALUES(?,?,?,?,?,?,?,?,?)',[orderId,x.p.id,x.p.name+(x.sale.label?' — '+x.sale.label:''),x.qty,x.sale.price,x.line,x.sale.label,x.sale.stockQty,x.sale.stockUnit]);itemIds.push(ir.lastID);}
  }
  // Uma rotina única decide entre consumir a ficha técnica ou o estoque do próprio produto.
  let inventoryChanged=false;
  for(let i=0;i<products.length;i++){const x=products[i];const applied=await applySaleInventory(x.p.id,x.qty,x.sale.stockQty,x.sale.stockUnit,'site',Number(itemIds[i]),'Pedido do site #'+orderId+' — '+(x.sale.label||x.p.name));if(applied.deducted)appliedSiteItems.push({productId:Number(x.p.id),stockQty:Number(x.sale.stockQty||0),stockUnit:x.sale.stockUnit||'un',itemId:Number(itemIds[i])});inventoryChanged=inventoryChanged||applied.deducted;}
  if(inventoryChanged)await run('UPDATE orders SET stock_deducted='+(isPg?'TRUE':'1')+' WHERE id='+(isPg?'$1':'?'),[orderId]);
  // Preserva a impressão atual de todos os itens configurados para pedidos do site.
  const orderPrintItems=products.filter(x=>x.p.print_site===true||x.p.print_site===1||x.p.print_site===undefined||x.p.print_site===null).map(x=>({name:x.p.name+(x.sale.label?' — '+x.sale.label:''),qty:x.qty,unit_price:Number(x.sale.price),total:x.line}));
  if(orderPrintItems.length)await enqueuePrint('site-order-'+orderId,'kitchen',{title:'PEDIDO DO SITE — PRODUÇÃO E SEPARAÇÃO',order:orderId,customer:customer_name,phone,type,address,notes,items:orderPrintItems,subtotal:products.reduce((sum,x)=>sum+x.line,0),delivery_fee:deliveryFee,total,created_at:new Date().toISOString()});
  res.json({ok:true,order_id:orderId,total,delivery_fee:deliveryFee,command_no:commandNo});
 }catch(e){
  console.error('Erro ao receber pedido do site:',e);
  // Se um pedido falhar depois de consumir algum item, devolve somente os
  // movimentos já aplicados e remove o pedido incompleto.
  if(orderIdForRollback!==null){
   for(const item of appliedSiteItems.slice().reverse()){
    try{await restoreSaleInventory(item.productId,item.stockQty,item.stockUnit,'site',item.itemId,'Estorno de pedido incompleto #'+orderIdForRollback)}
    catch(restoreError){console.error('Falha ao estornar item do pedido incompleto:',restoreError)}
   }
   try{await run('DELETE FROM order_items WHERE order_id='+(isPg?'$1':'?'),[orderIdForRollback]);await run('DELETE FROM orders WHERE id='+(isPg?'$1':'?'),[orderIdForRollback]);}
   catch(cleanupError){console.error('Falha ao remover pedido incompleto:',cleanupError)}
  }
  res.status(500).json({error:e.message||'Não foi possível receber o pedido.'})
 }
 finally{release();}
});
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
app.put('/api/admin/orders/:id/status',auth,async(req,res)=>{try{const status=req.body.status;const allowed=['novo','confirmado','preparando','pronto','entregando','finalizado','cancelado'];if(!allowed.includes(status))return res.status(400).json({error:'Status inválido'});const id=Number(req.params.id),o=await one('SELECT * FROM orders WHERE id='+(isPg?'$1':'?'),[id]);if(!o)return res.status(404).json({error:'Pedido não encontrado'});if(status==='cancelado'&&!(o.stock_deducted===false||o.stock_deducted===0||o.stock_deducted===null)){const items=await q('SELECT * FROM order_items WHERE order_id='+(isPg?'$1':'?'),[id]);for(const it of items){await restoreSaleInventory(Number(it.product_id),Number(it.stock_qty||it.qty||0),it.stock_unit||'un','site',Number(it.id),'Estorno pedido cancelado #'+id);}await run('UPDATE orders SET stock_deducted='+(isPg?'FALSE':'0')+' WHERE id='+(isPg?'$1':'?'),[id]);}if(o.status==='cancelado'&&status!=='cancelado')return res.status(400).json({error:'Pedido cancelado. Para refazer a venda, crie um novo pedido.'});await run('UPDATE orders SET status='+(isPg?'$1':'?')+' WHERE id='+(isPg?'$2':'?'),[status,id]);res.json({ok:true});}catch(e){res.status(400).json({error:e.message||'Não foi possível atualizar o pedido.'})}});
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


// VERIFICAÇÃO PRÉVIA DA LIMPEZA — SOMENTE LEITURA, NÃO ALTERA DADOS
app.get('/api/admin/test-data/clean-check', auth, async (req, res) => {
  const requiredTables = [
    'products','orders','order_items','cash','commands','command_items',
    'customers','fiado_payments','command_payments','command_receipts',
    'print_jobs','suppliers','purchase_invoices','purchase_invoice_lines',
    'inventory_movements','app_settings','supplier_product_codes',
    'technical_recipe_items','recipe_stock_movements'
  ];
  try {
    let presentTables = [];
    let productColumns = [];
    let externalReferences = [];
    if (isPg) {
      const t = await db.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
        [requiredTables]
      );
      presentTables = t.rows.map(x => x.table_name);
      const c = await db.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'products'
           AND column_name IN ('stock','stock_secondary')`
      );
      productColumns = c.rows.map(x => x.column_name);
      const refs = await db.query(
        `SELECT DISTINCT src.relname AS table_name
         FROM pg_constraint fk
         JOIN pg_class src ON src.oid = fk.conrelid
         JOIN pg_namespace ns ON ns.oid = src.relnamespace
         JOIN pg_class dst ON dst.oid = fk.confrelid
         WHERE fk.contype = 'f' AND ns.nspname = current_schema()
           AND dst.relname = ANY($1::text[])
           AND src.relname <> ALL($2::text[])`,
        [requiredTables, [
          'command_receipts','fiado_payments','command_payments','command_items',
          'commands','order_items','orders','cash','print_jobs',
          'inventory_movements','recipe_stock_movements'
        ]]
      );
      externalReferences = refs.rows.map(x => x.table_name);
    } else {
      presentTables = db.prepare(
        `SELECT name AS table_name FROM sqlite_master
         WHERE type='table' AND name IN (${requiredTables.map(() => '?').join(',')})`
      ).all(...requiredTables).map(x => x.table_name);
      productColumns = db.prepare('PRAGMA table_info(products)').all()
        .map(x => x.name).filter(x => ['stock','stock_secondary'].includes(x));
    }
    const missingTables = requiredTables.filter(x => !presentTables.includes(x));
    const missingProductColumns = ['stock','stock_secondary'].filter(x => !productColumns.includes(x));
    const ready = missingTables.length === 0 && missingProductColumns.length === 0;
    res.set('Cache-Control','no-store');
    return res.json({
      ok: true,
      check_only: true,
      database: isPg ? 'PostgreSQL' : 'SQLite',
      ready,
      present_tables: presentTables.length,
      required_tables: requiredTables.length,
      missing_tables: missingTables,
      missing_product_columns: missingProductColumns,
      external_foreign_key_references: externalReferences,
      warning: externalReferences.length
        ? 'Há tabelas adicionais com chaves estrangeiras para tabelas operacionais. A limpeza atual poderá ser revertida pelo banco; não foi feita nenhuma alteração.'
        : 'Verificação estrutural concluída. Nenhum dado foi alterado. A execução ainda depende da confirmação final.'
    });
  } catch (error) {
    console.error('Erro na verificação prévia da limpeza:', error);
    return res.status(500).json({
      error: 'Não foi possível verificar o banco de dados. Nenhum dado foi alterado.'
    });
  }
});

// LIMPEZA GERAL SEGURA — ESPETINHO DO REINALDO
// Apaga somente movimentações operacionais de teste e zera quantidades de estoque.
// Preserva produtos, clientes, fornecedores, códigos, preços, fichas técnicas e configurações.
app.post('/api/admin/test-data/clean', auth, async (req, res) => {
  if (req.body?.confirm !== 'LIMPAR_TESTES_ESPETINHO') {
    return res.status(400).json({ error: 'Confirmação de limpeza inválida.' });
  }

  let client = null;
  try {
    if (isPg) {
      client = await db.connect();
      await client.query('BEGIN');
      try {
        await client.query(`
          TRUNCATE TABLE
            command_receipts,
            fiado_payments,
            command_payments,
            command_items,
            commands,
            order_items,
            orders,
            cash,
            print_jobs,
            inventory_movements,
            recipe_stock_movements
          RESTART IDENTITY
        `);
        await client.query(`
          UPDATE products
          SET stock = 0,
              stock_secondary = 0
        `);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } else {
      const clean = db.transaction(() => {
        db.prepare('DELETE FROM command_receipts').run();
        db.prepare('DELETE FROM fiado_payments').run();
        db.prepare('DELETE FROM command_payments').run();
        db.prepare('DELETE FROM command_items').run();
        db.prepare('DELETE FROM commands').run();
        db.prepare('DELETE FROM order_items').run();
        db.prepare('DELETE FROM orders').run();
        db.prepare('DELETE FROM cash').run();
        db.prepare('DELETE FROM print_jobs').run();
        db.prepare('DELETE FROM inventory_movements').run();
        db.prepare('DELETE FROM recipe_stock_movements').run();
        db.prepare('UPDATE products SET stock = 0, stock_secondary = 0').run();
        db.prepare(`
          DELETE FROM sqlite_sequence
          WHERE name IN (
            'command_receipts', 'fiado_payments', 'command_payments',
            'command_items', 'commands', 'order_items', 'orders',
            'cash', 'print_jobs', 'inventory_movements', 'recipe_stock_movements'
          )
        `).run();
      });
      clean();
    }

    return res.json({
      ok: true,
      message: 'Limpeza concluída. Movimentações de teste removidas, estoque zerado e cadastros preservados.'
    });
  } catch (error) {
    console.error('Erro na limpeza geral de dados de teste:', error);
    return res.status(500).json({
      error: 'Não foi possível concluir a limpeza. A operação foi revertida quando suportado pelo banco.'
    });
  } finally {
    if (client) client.release();
  }
});

// Exclusão manual de uma comanda antiga que já esteja vazia (sem itens e total zero).
app.delete('/api/admin/commands/:id/empty',auth,async(req,res)=>{
 try{
  const commandId=Number(req.params.id);
  if(!Number.isInteger(commandId)||commandId<=0)return res.status(400).json({error:'Comanda inválida.'});
  const command=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[commandId]);
  if(!command)return res.status(404).json({error:'Comanda não encontrada.'});
  if(command.status!=='aberta')return res.status(400).json({error:'Só é possível excluir comandas ainda abertas.'});
  const items=await q('SELECT id FROM command_items WHERE command_id='+(isPg?'$1':'?'),[commandId]);
  if(items.length>0 || Number(command.total||0)>0.001)return res.status(409).json({error:'Esta comanda ainda possui produtos ou valor. Exclua os produtos individualmente primeiro.'});
  await run('DELETE FROM commands WHERE id='+(isPg?'$1':'?')+' AND status=\'aberta\'',[commandId]);
  return res.json({ok:true,message:'Comanda vazia excluída.',commandDeleted:true});
 }catch(e){
  console.error('Erro ao excluir comanda vazia:',e);
  return res.status(500).json({error:'Não foi possível excluir a comanda vazia.'});
 }
});

// Módulo Garçom — acesso individual, sem permissões de caixa ou administração.
app.post('/api/garcom/login',(req,res)=>{if(!WAITER_PIN||!WAITER_SECRET||WAITER_SECRET.length<32)return res.status(503).json({error:'Configure GARCOM_PIN e GARCOM_TOKEN_SECRET (mínimo 32 caracteres) nas variáveis do Railway.'});const number=String(req.body?.number||'').trim(),pin=String(req.body?.pin||'').trim();if(number!==WAITER_NUMBER||!/^\d{4}(\d{2})?$/.test(pin)||!safeEqual(pin,WAITER_PIN))return res.status(401).json({error:'Número ou PIN incorreto.'});const token=waiterToken({number:WAITER_NUMBER,name:WAITER_NAME,exp:Date.now()+12*60*60*1000});res.json({ok:true,token,waiter:{number:WAITER_NUMBER,name:WAITER_NAME},expires_in:43200});});
app.get('/api/garcom/me',waiterAuth,(req,res)=>res.json({ok:true,waiter:req.waiter}));
app.get('/api/garcom/products',waiterAuth,async(req,res)=>{try{const rows=await q("SELECT id,name,category,price,unit,sale_options,active,product_type FROM products WHERE active="+(isPg?'TRUE':'1')+" AND COALESCE(product_type,'venda')='venda' ORDER BY category,name");res.json(rows);}catch(e){res.status(500).json({error:'Não foi possível carregar os produtos.'});}});
app.get('/api/garcom/commands',waiterAuth,async(req,res)=>{try{const rows=await q("SELECT * FROM commands WHERE status='aberta' ORDER BY id DESC");for(const c of rows)c.items=await q('SELECT id,name,qty,unit_price,total,notes,waiter_name FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[c.id]);res.json(rows);}catch(e){res.status(500).json({error:'Não foi possível carregar as comandas.'});}});
app.post('/api/garcom/commands',waiterAuth,async(req,res)=>{try{const customer=String(req.body?.customer||'').trim().slice(0,100),table=String(req.body?.table||'').trim().slice(0,40);const existing=await q('SELECT number FROM commands');const nums=existing.map(c=>String(c.number||'').trim()).filter(n=>/^\d+$/.test(n)).map(Number).filter(Number.isSafeInteger);const number=String((nums.length?Math.max(...nums):0)+1);if(isPg)await db.query('INSERT INTO commands(number,customer,waiter_number,waiter_name,waiter_table) VALUES($1,$2,$3,$4,$5)',[number,customer,req.waiter.number,req.waiter.name,table]);else await run('INSERT INTO commands(number,customer,waiter_number,waiter_name,waiter_table) VALUES(?,?,?,?,?)',[number,customer,req.waiter.number,req.waiter.name,table]);const command=await one('SELECT * FROM commands WHERE number='+(isPg?'$1':'?'),[number]);res.json({ok:true,command});}catch(e){console.error('Garçom abrir comanda:',e);res.status(500).json({error:'Não foi possível abrir a comanda.'});}});
app.post('/api/garcom/commands/:id/items',waiterAuth,async(req,res)=>{let itemId=null,inventoryApplied=false,product=null,sale=null,commandId=Number(req.params.id);try{const id=commandId,command=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[id]);if(!command)return res.status(404).json({error:'Comanda não encontrada.'});if(command.status!=='aberta')return res.status(409).json({error:'Esta comanda não está aberta.'});const productId=Number(req.body?.product_id),qty=Number(req.body?.qty),notes=String(req.body?.notes||'').trim().slice(0,240);if(!Number.isInteger(productId)||productId<=0||!Number.isFinite(qty)||qty<=0||qty>999)return res.status(400).json({error:'Informe produto e quantidade válidos.'});product=await one('SELECT * FROM products WHERE id='+(isPg?'$1':'?'),[productId]);if(!product||!(product.active===true||product.active===1)||String(product.product_type||'venda')==='insumo')return res.status(400).json({error:'Produto indisponível para venda.'});try{sale=resolveSale(product,req.body?.sale_option_key,qty)}catch(e){return res.status(400).json({error:e.message})}const line=sale.price*qty;const recipe=await getRecipeRows(product.id);if(recipe.length)await ensureStockAvailable(recipe.map(r=>({product_id:Number(r.ingredient_id),stock_qty:Number(r.quantity||0)*qty})));else if(sale.stockQty>0)await ensureStockAvailable([{product_id:product.id,stock_qty:sale.stockQty}]);const itemName=product.name+(sale.label?' — '+sale.label:'');if(isPg){const r=await db.query('INSERT INTO command_items(command_id,product_id,name,qty,unit_price,total,sale_label,stock_qty,stock_unit,stock_deducted,waiter_number,waiter_name,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,$10,$11,$12) RETURNING id',[id,product.id,itemName,qty,sale.price,line,sale.label,sale.stockQty,sale.stockUnit,req.waiter.number,req.waiter.name,notes]);itemId=r.rows[0].id;await db.query('UPDATE commands SET total=COALESCE(total,0)+$1 WHERE id=$2',[line,id]);}else{const r=await run('INSERT INTO command_items(command_id,product_id,name,qty,unit_price,total,sale_label,stock_qty,stock_unit,stock_deducted,waiter_number,waiter_name,notes) VALUES(?,?,?,?,?,?,?,?,?,0,?,?,?)',[id,product.id,itemName,qty,sale.price,line,sale.label,sale.stockQty,sale.stockUnit,req.waiter.number,req.waiter.name,notes]);itemId=r.lastID;await run('UPDATE commands SET total=COALESCE(total,0)+? WHERE id=?',[line,id]);}const applied=await applySaleInventory(product.id,qty,sale.stockQty,sale.stockUnit,'command',Number(itemId),'Comanda '+command.number+' — '+(sale.label||product.name));inventoryApplied=applied.deducted;if(inventoryApplied)await run('UPDATE command_items SET stock_deducted='+(isPg?'TRUE':'1')+' WHERE id='+(isPg?'$1':'?'),[itemId]);if(product.print_command===true||product.print_command===1||((product.print_command===undefined||product.print_command===null)&&(product.prepare_kitchen===true||product.prepare_kitchen===1))){const item=await one('SELECT * FROM command_items WHERE id='+(isPg?'$1':'?'),[itemId]);if(item)await enqueuePrint('kitchen-command-item-'+item.id,'kitchen',{title:'COMANDA — COZINHA',command:command.number,customer:command.customer||'',items:[{name:itemName+(notes?' — '+notes:''),qty,total:line}],created_at:new Date().toISOString()});}const updated=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[id]);res.json({ok:true,command:updated});}catch(e){if(itemId!==null){try{if(inventoryApplied)await restoreSaleInventory(Number(product?.id),Number(sale?.stockQty||0),sale?.stockUnit||'un','command',Number(itemId),'Estorno de falha no lançamento pelo garçom');await run('DELETE FROM command_items WHERE id='+(isPg?'$1':'?'),[itemId]);const sums=await q('SELECT COALESCE(SUM(total),0) AS total FROM command_items WHERE command_id='+(isPg?'$1':'?'),[commandId]);await run('UPDATE commands SET total='+(isPg?'$1':'?')+' WHERE id='+(isPg?'$2':'?'),[Number(sums[0]?.total||0),commandId]);}catch(x){console.error('Falha no estorno do lançamento do garçom:',x)}}console.error('Garçom lançar item:',e);res.status(500).json({error:e.message||'Não foi possível lançar o produto.'});}});
app.delete('/api/garcom/commands/:id/items/:itemId',waiterAuth,async(req,res)=>{
 try{
  const commandId=Number(req.params.id),itemId=Number(req.params.itemId);
  if(!Number.isInteger(commandId)||commandId<=0||!Number.isInteger(itemId)||itemId<=0)return res.status(400).json({error:'Comanda ou item inválido.'});
  const command=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[commandId]);
  if(!command)return res.status(404).json({error:'Comanda não encontrada.'});
  if(command.status!=='aberta')return res.status(400).json({error:'Só é possível excluir produtos de comandas abertas.'});
  const item=await one('SELECT * FROM command_items WHERE id='+(isPg?'$1':'?')+' AND command_id='+(isPg?'$2':'?'),[itemId,commandId]);
  if(!item)return res.status(404).json({error:'Este produto não pertence a esta comanda ou já foi excluído.'});
  if(item.stock_deducted===true||item.stock_deducted===1){await restoreSaleInventory(Number(item.product_id),Number(item.stock_qty||0),item.stock_unit||'un','command',Number(item.id),'Devolução por exclusão do item da comanda '+command.number);}
  await run('DELETE FROM command_items WHERE id='+(isPg?'$1':'?')+' AND command_id='+(isPg?'$2':'?'),[itemId,commandId]);
  const remaining=await q('SELECT id FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[commandId]);
  if(remaining.length===0){
   // A comanda ainda está aberta e ficou sem produtos: remove o registro vazio automaticamente.
   await run('DELETE FROM commands WHERE id='+(isPg?'$1':'?')+' AND status=\'aberta\'',[commandId]);
   return res.json({ok:true,message:'Último produto excluído. A comanda vazia foi removida automaticamente.',command:null,items:[],commandDeleted:true});
  }
  const sumRows=await q('SELECT COALESCE(SUM(total),0) AS total FROM command_items WHERE command_id='+(isPg?'$1':'?'),[commandId]);
  const total=Math.round(Number(sumRows[0]?.total||0)*100)/100;
  await run('UPDATE commands SET total='+(isPg?'$1':'?')+' WHERE id='+(isPg?'$2':'?'),[total,commandId]);
  const updated=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[commandId]);
  const items=await q('SELECT * FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[commandId]);
  res.json({ok:true,message:'Produto excluído, estoque devolvido e total recalculado.',command:updated,items,commandDeleted:false});
 }catch(e){
  console.error('Erro ao excluir item da comanda pelo garçom:',e);
  res.status(500).json({error:e.message||'Não foi possível excluir o produto da comanda.'});
 }
});
app.post('/api/garcom/commands/:id/solicitar-fechamento',waiterAuth,async(req,res)=>{try{const id=Number(req.params.id),c=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[id]);if(!c)return res.status(404).json({error:'Comanda não encontrada.'});if(c.status!=='aberta')return res.status(409).json({error:'Esta comanda não está aberta.'});await run('UPDATE commands SET close_requested_at=CURRENT_TIMESTAMP WHERE id='+(isPg?'$1':'?'),[id]);res.json({ok:true,message:'Fechamento solicitado. Chame o responsável pelo caixa.'});}catch(e){res.status(500).json({error:'Não foi possível solicitar o fechamento.'});}});

app.get('/api/admin/commands',auth,async(req,res)=>{const rows=await q('SELECT * FROM commands ORDER BY id DESC');for(const c of rows){c.items=await q('SELECT * FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[c.id]);c.payment_details=await q('SELECT payment,amount,customer,created_at FROM command_payments WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[c.id]);if(!c.payment_details.length&&['pix','dinheiro','debito','credito','fiado'].includes(String(c.payment||'').toLowerCase()))c.payment_details=[{payment:c.payment,amount:Number(c.total||0)}];}res.json(rows);});
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

app.post('/api/admin/commands/:id/items',auth,async(req,res)=>{let itemId=null,product=null,sale=null,inventoryApplied=false,commandId=Number(req.params.id);try{const command=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[commandId]);if(!command)return res.status(404).json({error:'Comanda não encontrada'});if(command.status!=='aberta')return res.status(400).json({error:'Esta comanda não está aberta'});const productId=Number(req.body.product_id),qty=Number(req.body.qty);const requestedNotes=String(req.body.notes||'').trim().slice(0,240);if(!Number.isInteger(productId)||productId<=0||!Number.isFinite(qty)||qty<=0)return res.status(400).json({error:'Produto e quantidade válidos são obrigatórios'});product=await one('SELECT * FROM products WHERE id='+(isPg?'$1':'?'),[productId]);if(!product||!(product.active===true||product.active===1))return res.status(400).json({error:'Produto indisponível'});if(String(product.product_type||'venda')==='insumo')return res.status(400).json({error:'Este cadastro é um insumo e não pode ser vendido.'});const isKitchenProduct=product.print_command===true||product.print_command===1||((product.print_command===undefined||product.print_command===null)&&(product.prepare_kitchen===true||product.prepare_kitchen===1));const itemNotes=isKitchenProduct?requestedNotes:'';try{sale=resolveSale(product,req.body.sale_option_key,qty)}catch(e){return res.status(400).json({error:e.message})}const line=sale.price*qty;const recipe=await getRecipeRows(product.id);if(recipe.length)await ensureStockAvailable(recipe.map(r=>({product_id:Number(r.ingredient_id),stock_qty:Number(r.quantity||0)*qty})));else if(sale.stockQty>0)await ensureStockAvailable([{product_id:product.id,stock_qty:sale.stockQty}]);if(isPg){const r=await db.query('INSERT INTO command_items(command_id,product_id,name,qty,unit_price,total,sale_label,stock_qty,stock_unit,stock_deducted,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,$10) RETURNING id',[commandId,product.id,product.name+(sale.label?' — '+sale.label:''),qty,sale.price,line,sale.label,sale.stockQty,sale.stockUnit,itemNotes]);itemId=r.rows[0].id;await db.query('UPDATE commands SET total=COALESCE(total,0)+$1 WHERE id=$2',[line,commandId]);}else{const r=await run('INSERT INTO command_items(command_id,product_id,name,qty,unit_price,total,sale_label,stock_qty,stock_unit,stock_deducted,notes) VALUES(?,?,?,?,?,?,?,?,?,0,?)',[commandId,product.id,product.name+(sale.label?' — '+sale.label:''),qty,sale.price,line,sale.label,sale.stockQty,sale.stockUnit,itemNotes]);itemId=r.lastID;await run('UPDATE commands SET total=COALESCE(total,0)+? WHERE id=?',[line,commandId]);}const applied=await applySaleInventory(product.id,qty,sale.stockQty,sale.stockUnit,'command',Number(itemId),'Comanda '+command.number+' — '+(sale.label||product.name));inventoryApplied=applied.deducted;if(inventoryApplied)await run('UPDATE command_items SET stock_deducted='+(isPg?'TRUE':'1')+' WHERE id='+(isPg?'$1':'?'),[itemId]);if(product.print_command===true||product.print_command===1||((product.print_command===undefined||product.print_command===null)&&(product.prepare_kitchen===true||product.prepare_kitchen===1))){const last=await one('SELECT * FROM command_items WHERE id='+(isPg?'$1':'?'),[itemId]);if(last)await enqueuePrint('kitchen-command-item-'+last.id,'kitchen',{title:'COMANDA — COZINHA',command:command.number,customer:command.customer||'',items:[{name:product.name+(sale.label?' — '+sale.label:''),qty,total:line,notes:itemNotes}],notes:itemNotes,created_at:new Date().toISOString()});}const updated=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[commandId]);const items=await q('SELECT * FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[commandId]);res.json({ok:true,command:updated,items});}catch(e){if(itemId!==null){try{if(inventoryApplied)await restoreSaleInventory(Number(product?.id),Number(sale?.stockQty||0),sale?.stockUnit||'un','command',Number(itemId),'Estorno automático de falha no lançamento da comanda');await run('DELETE FROM command_items WHERE id='+(isPg?'$1':'?'),[itemId]);const sums=await q('SELECT COALESCE(SUM(total),0) AS total FROM command_items WHERE command_id='+(isPg?'$1':'?'),[commandId]);await run('UPDATE commands SET total='+(isPg?'$1':'?')+' WHERE id='+(isPg?'$2':'?'),[Number(sums[0]?.total||0),commandId]);}catch(restoreError){console.error('Falha ao estornar estoque após erro:',restoreError)}}console.error('Erro ao lançar item na comanda:',e);res.status(500).json({error:e.message||'Erro ao lançar produto na comanda'});}});

// Remove um produto somente de uma comanda que ainda está aberta e devolve o estoque já baixado.
app.delete('/api/admin/commands/:id/items/:itemId',auth,async(req,res)=>{
 try{
  const commandId=Number(req.params.id),itemId=Number(req.params.itemId);
  if(!Number.isInteger(commandId)||commandId<=0||!Number.isInteger(itemId)||itemId<=0)return res.status(400).json({error:'Comanda ou item inválido.'});
  const command=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[commandId]);
  if(!command)return res.status(404).json({error:'Comanda não encontrada.'});
  if(command.status!=='aberta')return res.status(400).json({error:'Só é possível excluir produtos de comandas abertas.'});
  const item=await one('SELECT * FROM command_items WHERE id='+(isPg?'$1':'?')+' AND command_id='+(isPg?'$2':'?'),[itemId,commandId]);
  if(!item)return res.status(404).json({error:'Este produto não pertence a esta comanda ou já foi excluído.'});
  if(item.stock_deducted===true||item.stock_deducted===1){await restoreSaleInventory(Number(item.product_id),Number(item.stock_qty||0),item.stock_unit||'un','command',Number(item.id),'Devolução por exclusão do item da comanda '+command.number);}
  await run('DELETE FROM command_items WHERE id='+(isPg?'$1':'?')+' AND command_id='+(isPg?'$2':'?'),[itemId,commandId]);
  const remaining=await q('SELECT id FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[commandId]);
  if(remaining.length===0){
   // A comanda ainda está aberta e ficou sem produtos: remove o registro vazio automaticamente.
   await run('DELETE FROM commands WHERE id='+(isPg?'$1':'?')+' AND status=\'aberta\'',[commandId]);
   return res.json({ok:true,message:'Último produto excluído. A comanda vazia foi removida automaticamente.',command:null,items:[],commandDeleted:true});
  }
  const sumRows=await q('SELECT COALESCE(SUM(total),0) AS total FROM command_items WHERE command_id='+(isPg?'$1':'?'),[commandId]);
  const total=Math.round(Number(sumRows[0]?.total||0)*100)/100;
  await run('UPDATE commands SET total='+(isPg?'$1':'?')+' WHERE id='+(isPg?'$2':'?'),[total,commandId]);
  const updated=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[commandId]);
  const items=await q('SELECT * FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[commandId]);
  res.json({ok:true,message:'Produto excluído, estoque devolvido e total recalculado.',command:updated,items,commandDeleted:false});
 }catch(e){
  console.error('Erro ao excluir item da comanda:',e);
  res.status(500).json({error:e.message||'Não foi possível excluir o produto da comanda.'});
 }
});


async function fiadoCommandRows(){
 const commands=await q("SELECT * FROM commands WHERE status='fechada' AND LOWER(payment) IN ('fiado','misto') ORDER BY id DESC");
 const out=[];
 for(const c of commands){
  let customers=[];
  if(String(c.payment||'').toLowerCase()==='fiado') customers=[String(c.customer||'').trim()];
  else { const parts=await q("SELECT DISTINCT customer FROM command_payments WHERE command_id="+(isPg?'$1':'?')+" AND LOWER(payment)='fiado'",[c.id]); customers=parts.map(x=>String(x.customer||c.customer||'').trim()).filter(Boolean); }
  for(const customer of [...new Set(customers)]){
   const original=String(c.payment||'').toLowerCase()==='fiado'?Number(c.total||0):(await q("SELECT amount,customer FROM command_payments WHERE command_id="+(isPg?'$1':'?')+" AND LOWER(payment)='fiado'",[c.id])).filter(x=>normText(x.customer||c.customer||'')===normText(customer)).reduce((sum,row)=>sum+Number(row.amount||0),0);
   const remaining=await commandFiadoBalance(c,customer); const paid=Math.max(0,Math.round((original-remaining)*100)/100);
   if(remaining>0.001)out.push({...c,customer,fiado_total:original,paid,remaining,fiado_customer:customer});
  }
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
  const prepared=[];let customerKey='';
  for(const a of allocations){
   const commandId=Number(a.command_id),amount=Math.round(Number(a.amount)*100)/100;
   if(!Number.isInteger(commandId)||commandId<=0||!Number.isFinite(amount)||amount<=0)return res.status(400).json({error:'Informe um valor maior que zero para cada comanda marcada.'});
   const c=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[commandId]);
   if(!c||c.status!=='fechada'||!['fiado','misto'].includes(String(c.payment||'').toLowerCase()))return res.status(400).json({error:'Uma das comandas selecionadas não está pendente no fiado.'});
   const customer=String(a.customer||c.customer||'').trim();const key=normText(customer);
   if(!key)return res.status(400).json({error:'Selecione o cliente responsável por este fiado.'});
   if(customerKey&&customerKey!==key)return res.status(400).json({error:'Para registrar um recebimento conjunto, selecione comandas do mesmo cliente.'});customerKey=key;
   const remaining=await commandFiadoBalance(c,customer);
   if(amount>remaining+0.001)return res.status(400).json({error:'O valor destinado à comanda '+c.number+' é maior que o saldo pendente ('+remaining.toFixed(2)+').'});
   prepared.push({c,customer,amount,remaining});
  }
  const total=prepared.reduce((sum,x)=>sum+x.amount,0);
  for(const x of prepared){
   await run('INSERT INTO fiado_payments(command_id,customer,amount,payment) VALUES('+(isPg?'$1,$2,$3,$4':'?,?,?,?')+')',[x.c.id,x.customer,x.amount,payment]);
   const left=Math.max(0,Math.round((x.remaining-x.amount)*100)/100);
   const description='Recebimento fiado - Cliente: '+x.customer+' - Comanda '+x.c.number+(left<=0.001?' - Quitada':' - Parcial');
   await run('INSERT INTO cash(type,description,value,payment) VALUES('+(isPg?'$1,$2,$3,$4':'?,?,?,?')+')',['entrada',description,x.amount,payment]);
  }
  res.json({ok:true,total,commands:prepared.map(x=>({number:x.c.number,customer:x.customer,amount:x.amount}))});
 }catch(e){console.error('Erro ao registrar recebimento de fiado:',e);res.status(500).json({error:'Não foi possível registrar o recebimento.'})}
});

app.put('/api/admin/commands/:id/close',auth,async(req,res)=>{
 try{
  const id=Number(req.params.id);
  const c=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[id]);
  if(!c)return res.status(404).json({error:'Comanda não encontrada'});
  if(c.status==='fechada')return res.status(400).json({error:'Esta comanda já foi fechada'});
  const totalCents=Math.round(Number(c.total||0)*100);
  if(totalCents<=0)return res.status(400).json({error:'Lance pelo menos um produto antes de fechar a comanda'});
  const methods=['pix','dinheiro','debito','credito','fiado'];
  const pendingOnly=!Array.isArray(req.body.payments)&&(!req.body.payment||String(req.body.payment).trim().toLowerCase()==='pendente');
  let payments=Array.isArray(req.body.payments)?req.body.payments:null;
  if(!payments){const legacy=String(req.body.payment||'pendente').trim().toLowerCase();payments=legacy==='pendente'?[]:[{payment:legacy,amount:Number(c.total)}];}
  const normalized=[];
  for(const row of payments){
   const method=String(row?.payment||row?.method||'').trim().toLowerCase();
   const cents=Math.round(Number(row?.amount)*100);
   if(!methods.includes(method))return res.status(400).json({error:'Escolha uma forma de pagamento válida em cada lançamento.'});
   if(!Number.isFinite(cents)||cents<=0)return res.status(400).json({error:'Informe um valor maior que zero para cada forma de pagamento.'});
   const customer=method==='fiado'?String(row?.customer||'').trim():'';
   if(method==='fiado'&&!customer)return res.status(400).json({error:'Selecione um cliente para cada lançamento de fiado.'});
   normalized.push({payment:method,amount:cents/100,cents,customer});
  }
  const paidCents=normalized.reduce((sum,row)=>sum+row.cents,0);
  if(normalized.length&&paidCents!==totalCents)return res.status(400).json({error:'A soma dos pagamentos ('+(paidCents/100).toFixed(2)+') precisa ser exatamente igual ao total da comanda ('+(totalCents/100).toFixed(2)+').'});
  if(!normalized.length&&!pendingOnly)return res.status(400).json({error:'Informe pelo menos uma forma de pagamento.'});
  const fiadoParts=normalized.filter(x=>x.payment==='fiado');
  const selectedFiadoCustomers=fiadoParts.map(x=>normText(x.customer));
  if(new Set(selectedFiadoCustomers).size!==selectedFiadoCustomers.length)return res.status(400).json({error:'Cada lançamento de fiado deve ser destinado a um cliente diferente.'});
  if(fiadoParts.length){
   const customerRows=await q('SELECT * FROM customers ORDER BY id'); const yes=v=>v===true||v===1||String(v).toLowerCase()==='true';
   const debts=await q("SELECT * FROM commands WHERE status='fechada' AND LOWER(payment) IN ('fiado','misto')");
   for(const part of fiadoParts){
    const customer=customerRows.find(x=>normText(x.name)===normText(part.customer));
    if(!customer)return res.status(400).json({error:'O cliente '+part.customer+' não está cadastrado.'});
    if(!yes(customer.active))return res.status(400).json({error:'O cliente '+part.customer+' está inativo e não pode comprar no fiado.'});
    if(!yes(customer.fiado_authorized))return res.status(400).json({error:'O cliente '+part.customer+' não está autorizado a comprar no fiado.'});
    let used=0; for(const debt of debts)used+=await commandFiadoBalance(debt,customer.name);
    const available=Math.round((Number(customer.credit_limit||0)-used)*100)/100;
    if(part.amount>available+0.001)return res.status(400).json({error:'Limite de fiado insuficiente para '+customer.name+'. Disponível: '+Math.max(0,available).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+'.'});
   }
  }
  const commandItems=await q('SELECT * FROM command_items WHERE command_id='+(isPg?'$1':'?')+' ORDER BY id',[id]);
  const pendingStockItems=commandItems.filter(item=>!(item.stock_deducted===true||item.stock_deducted===1));
  try{await ensureCommandItemsInventoryAvailable(pendingStockItems)}catch(e){return res.status(409).json({error:e.message})}
  for(const item of pendingStockItems){await applySaleInventory(Number(item.product_id),Number(item.qty||1),Number(item.stock_qty||0),item.stock_unit||'un','command',Number(item.id),'Venda comanda '+c.number+' — '+(item.sale_label||item.name));await run('UPDATE command_items SET stock_deducted='+(isPg?'TRUE':'1')+' WHERE id='+(isPg?'$1':'?'),[item.id]);}
  const summary=pendingOnly?'pendente':(normalized.length===1?normalized[0].payment:'misto');
  const changed=await run('UPDATE commands SET status='+(isPg?'$1':'?')+',payment='+(isPg?'$2':'?')+',closed_at=CURRENT_TIMESTAMP WHERE id='+(isPg?'$3':'?')+" AND status='aberta'",['fechada',summary,id]);
  if(!changed.changes)return res.status(409).json({error:'Esta comanda já foi finalizada. Atualize a tela.'});
  for(const part of normalized){
   await run('INSERT INTO command_payments(command_id,payment,amount,customer) VALUES('+(isPg?'$1,$2,$3,$4':'?,?,?,?')+')',[id,part.payment,part.amount,part.customer||'']);
   const description=part.payment==='fiado'?'Comanda '+c.number+' - Fiado - Cliente: '+part.customer:'Comanda '+c.number+' - Pagamento '+part.payment;
   await run('INSERT INTO cash(type,description,value,payment) VALUES('+(isPg?'$1,$2,$3,$4':'?,?,?,?)'),[part.payment==='fiado'?'fiado':'entrada',description,part.amount,part.payment]);
  }
  const updated=await one('SELECT * FROM commands WHERE id='+(isPg?'$1':'?'),[id]);
  res.json({ok:true,command:updated,payments:normalized});
 }catch(e){console.error('Erro ao fechar comanda:',e);res.status(500).json({error:e.message||'Erro ao fechar comanda'})}
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

app.get('/garcom',(req,res)=>res.sendFile(path.join(__dirname,'public','garcom.html')));
app.use(express.static(path.join(__dirname,'public')));
app.get('/*splat',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
(async()=>{if(isPg)await initPg();else initSqlite();app.listen(PORT,()=>console.log('Espetinho V4 rodando na porta '+PORT));})().catch(e=>{console.error(e);process.exit(1)});
