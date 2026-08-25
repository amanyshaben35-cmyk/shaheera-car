const express=require("express");
const path=require("path");
const fs=require("fs");
const multer=require("multer");
const Database=require("better-sqlite3");

const app=express();
const PORT=process.env.PORT||3000;
const db=new Database(path.join(__dirname,"shaheera.db"));

const uploadsDir=path.join(__dirname,"uploads");
const carImagesDir=path.join(uploadsDir,"cars");
const receiptsDir=path.join(uploadsDir,"receipts");
fs.mkdirSync(carImagesDir,{recursive:true});
fs.mkdirSync(receiptsDir,{recursive:true});

const imageStorage=multer.diskStorage({
  destination:(req,file,cb)=>cb(null,carImagesDir),
  filename:(req,file,cb)=>{
    const ext=path.extname(file.originalname).toLowerCase();
    cb(null,`car-${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`);
  }
});
const receiptStorage=multer.diskStorage({
  destination:(req,file,cb)=>cb(null,receiptsDir),
  filename:(req,file,cb)=>{
    const ext=path.extname(file.originalname).toLowerCase();
    cb(null,`receipt-${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`);
  }
});
const imageUpload=multer({
  storage:imageStorage,
  limits:{files:3,fileSize:8*1024*1024},
  fileFilter:(req,file,cb)=>/^image\/(jpeg|png|webp|jpg)$/.test(file.mimetype)?cb(null,true):cb(new Error("يسمح بصور JPG أو PNG أو WEBP فقط"))
});
const receiptUpload=multer({
  storage:receiptStorage,
  limits:{fileSize:10*1024*1024},
  fileFilter:(req,file,cb)=>/^(image\/(jpeg|png|webp|jpg)|application\/pdf)$/.test(file.mimetype)?cb(null,true):cb(new Error("إثبات الدفع يجب أن يكون صورة أو PDF"))
});

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use("/uploads",express.static(uploadsDir));
app.use(express.static(__dirname));

db.exec(`CREATE TABLE IF NOT EXISTS cars(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 category TEXT DEFAULT '',
 daily_price REAL,
 monthly_price REAL,
 yearly_price REAL,
 wedding_price REAL,
 active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS car_images(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 car_id INTEGER NOT NULL,
 filename TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bookings(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 customer_name TEXT NOT NULL,
 phone TEXT NOT NULL,
 car_id INTEGER,
 service TEXT DEFAULT '',
 start_date TEXT DEFAULT '',
 end_date TEXT DEFAULT '',
 notes TEXT DEFAULT '',
 total REAL DEFAULT 0,
 deposit REAL DEFAULT 0,
 payment_method TEXT DEFAULT '',
 receipt TEXT DEFAULT '',
 payment_status TEXT DEFAULT 'بانتظار الدفع',
 booking_status TEXT DEFAULT 'طلب جديد',
 booking_code TEXT UNIQUE,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`);

function ensureColumn(table,column,type,defaultSql){
  const cols=db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);
  if(!cols.includes(column)){
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}${defaultSql||""}`);
  }
}
ensureColumn("cars","daily_price","REAL","");
ensureColumn("cars","monthly_price","REAL","");
ensureColumn("cars","yearly_price","REAL","");
ensureColumn("cars","wedding_price","REAL","");
ensureColumn("bookings","total","REAL"," DEFAULT 0");
ensureColumn("bookings","deposit","REAL"," DEFAULT 0");
ensureColumn("bookings","payment_method","TEXT"," DEFAULT ''");
ensureColumn("bookings","receipt","TEXT"," DEFAULT ''");
ensureColumn("bookings","payment_status","TEXT"," DEFAULT 'بانتظار الدفع'");
ensureColumn("bookings","booking_status","TEXT"," DEFAULT 'طلب جديد'");

function carWithImages(c){
  return {...c,images:db.prepare("SELECT id,filename,'/uploads/cars/'||filename AS url FROM car_images WHERE car_id=? ORDER BY id").all(c.id)};
}

app.get("/api/cars",(req,res)=>{
  const cars=db.prepare("SELECT * FROM cars WHERE active=1 ORDER BY id DESC").all();
  res.json(cars.map(carWithImages));
});

app.post("/api/bookings",receiptUpload.single("receipt"),(req,res)=>{
  const b=req.body;
  if(!b.customer_name||!b.phone||!b.car_id||!b.service)
    return res.status(400).json({ok:false,message:"الاسم والهاتف والسيارة ونوع الخدمة مطلوبة"});
  const total=Number(b.total)||0;
  const deposit=total>0?Math.round(total*0.5*100)/100:Number(b.deposit)||0;
  const receipt=req.file?`/uploads/receipts/${req.file.filename}`:"";
  const r=db.prepare(`INSERT INTO bookings(
    customer_name,phone,car_id,service,start_date,end_date,notes,total,deposit,payment_method,receipt
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
    b.customer_name,b.phone,b.car_id,b.service,b.start_date||"",b.end_date||"",b.notes||"",
    total,deposit,b.payment_method||"",receipt
  );
  const id=Number(r.lastInsertRowid);
  const code="SH-"+String(id).padStart(6,"0");
  db.prepare("UPDATE bookings SET booking_code=? WHERE id=?").run(code,id);
  res.json({ok:true,booking_id:id,booking_code:code,deposit,message:"تم استلام طلب الحجز. سيتم تأكيده بعد مراجعة العربون وإثبات الدفع."});
});

app.get("/api/bookings/:code",(req,res)=>{
  const booking=db.prepare(`
    SELECT b.*, c.name AS car_name, c.category AS car_category
    FROM bookings b LEFT JOIN cars c ON c.id=b.car_id
    WHERE b.booking_code=?
  `).get(String(req.params.code).toUpperCase());
  if(!booking)return res.status(404).json({ok:false,message:"رقم الحجز غير موجود"});
  res.json({ok:true,booking});
});

// إدارة السيارات
app.get("/admin/api/cars",(req,res)=>{
  const cars=db.prepare("SELECT * FROM cars ORDER BY id DESC").all();
  res.json(cars.map(carWithImages));
});

app.post("/admin/api/cars",imageUpload.array("images",3),(req,res)=>{
  const c=req.body;
  if(!c.name)return res.status(400).json({ok:false,message:"اسم السيارة مطلوب"});
  const r=db.prepare(`INSERT INTO cars(name,category,daily_price,monthly_price,yearly_price,wedding_price,active)
    VALUES(?,?,?,?,?,?,?)`).run(
      c.name,c.category||"",
      c.daily_price===""?null:Number(c.daily_price)||0,
      c.monthly_price===""?null:Number(c.monthly_price)||0,
      c.yearly_price===""?null:Number(c.yearly_price)||0,
      c.wedding_price===""?null:Number(c.wedding_price)||0,
      c.active===false?0:1
  );
  const id=Number(r.lastInsertRowid);
  const add=db.prepare("INSERT INTO car_images(car_id,filename) VALUES(?,?)");
  const tx=db.transaction(files=>files.forEach(f=>add.run(id,f.filename)));
  tx(req.files||[]);
  res.json({ok:true,id});
});

app.put("/admin/api/cars/:id",imageUpload.array("images",3),(req,res)=>{
  const id=Number(req.params.id), c=req.body;
  db.prepare(`UPDATE cars SET name=?,category=?,daily_price=?,monthly_price=?,yearly_price=?,wedding_price=?,active=? WHERE id=?`)
    .run(c.name,c.category||"",
      c.daily_price===""?null:Number(c.daily_price)||0,
      c.monthly_price===""?null:Number(c.monthly_price)||0,
      c.yearly_price===""?null:Number(c.yearly_price)||0,
      c.wedding_price===""?null:Number(c.wedding_price)||0,
      c.active===false?0:1,id);
  const add=db.prepare("INSERT INTO car_images(car_id,filename) VALUES(?,?)");
  (req.files||[]).forEach(f=>add.run(id,f.filename));
  res.json({ok:true});
});

app.delete("/admin/api/cars/:id",(req,res)=>{
  const id=Number(req.params.id);
  const files=db.prepare("SELECT filename FROM car_images WHERE car_id=?").all(id);
  files.forEach(f=>{try{fs.unlinkSync(path.join(carImagesDir,f.filename))}catch{}});
  db.prepare("DELETE FROM car_images WHERE car_id=?").run(id);
  db.prepare("DELETE FROM cars WHERE id=?").run(id);
  res.json({ok:true});
});

app.delete("/admin/api/car-images/:id",(req,res)=>{
  const row=db.prepare("SELECT filename FROM car_images WHERE id=?").get(Number(req.params.id));
  if(row){try{fs.unlinkSync(path.join(carImagesDir,row.filename))}catch{};db.prepare("DELETE FROM car_images WHERE id=?").run(Number(req.params.id));}
  res.json({ok:true});
});

app.get("/admin/api/bookings",(req,res)=>{
  res.json(db.prepare(`SELECT b.*,c.name AS car_name FROM bookings b LEFT JOIN cars c ON c.id=b.car_id ORDER BY b.id DESC`).all());
});

app.patch("/admin/api/bookings/:id",(req,res)=>{
  const {booking_status,payment_status}=req.body;
  db.prepare("UPDATE bookings SET booking_status=COALESCE(?,booking_status), payment_status=COALESCE(?,payment_status) WHERE id=?")
    .run(booking_status||null,payment_status||null,Number(req.params.id));
  res.json({ok:true});
});

app.get("/health",(req,res)=>res.json({ok:true,app:"SHAHEERA CAR"}));
app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));

app.use((err,req,res,next)=>{
  res.status(400).json({ok:false,message:err.message||"حدث خطأ"});
});

app.listen(PORT,"0.0.0.0",()=>console.log(`SHAHEERA CAR running on port ${PORT}`));
