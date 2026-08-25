async function loadCars(){
 const grid=document.getElementById("carsGrid"),select=document.getElementById("carSelect");
 try{
  const cars=await (await fetch("/api/cars")).json();
  if(!cars.length){grid.innerHTML='<div class="loading">سيارات الأسطول ستظهر هنا بعد إضافتها.</div>';return}
  grid.innerHTML=cars.map(c=>{
    const imgs=(c.images||[]).map(i=>`<img src="${i.url}" alt="${c.name}">`).join("");
    return `<article class="car"><div class="car-gallery">${imgs||'<div class="loading">لا توجد صور بعد</div>'}</div>
      <div class="car-body"><h3>${c.name}</h3><p>${c.category||""}</p>
      <p class="price">${c.daily_price!=null?c.daily_price+" جنيه / اليوم":"السعر يحدد عند الطلب"}</p>
      <p>الشهر: ${c.monthly_price!=null?c.monthly_price+" جنيه":"—"} | السنة: ${c.yearly_price!=null?c.yearly_price+" جنيه":"—"}</p>
      <a class="btn" href="#booking" onclick="selectCar(${c.id})">احجز الآن</a></div></article>`;
  }).join("");
  cars.forEach(c=>{const o=document.createElement("option");o.value=c.id;o.textContent=c.name;select.appendChild(o)})
 }catch(e){grid.innerHTML='<div class="loading">تعذر تحميل الأسطول حاليًا.</div>'}
}
function selectCar(id){document.getElementById("carSelect").value=id;location.hash="booking"}

document.getElementById("bookingForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const r=document.getElementById("bookingResult"),form=e.target;
 const fd=new FormData(form);
 const total=Number(fd.get("total")||0);
 if(total<=0){r.textContent="اكتب إجمالي قيمة الحجز أولًا.";return}
 fd.set("deposit",(total*0.5).toFixed(2));
 r.textContent="جارٍ إرسال الحجز...";
 try{
  const out=await (await fetch("/api/bookings",{method:"POST",body:fd})).json();
  if(out.ok){
   r.innerHTML=`<div class="success-box"><h3>تم استلام طلب الحجز 🎉</h3>
   <p>رقم الطلب:</p><strong>${out.booking_code}</strong>
   <p>العربون المطلوب 50%: <b>${out.deposit} جنيه</b></p>
   <p>سيتم مراجعة إثبات الدفع ثم تأكيد الحجز.</p>
   <a class="btn" href="#tracking">متابعة الحجز</a></div>`;
   form.reset();
  }else r.textContent=out.message||"تعذر إرسال الطلب.";
 }catch(x){r.textContent="تعذر الاتصال بالخادم."}
});

async function trackBooking(){
 const input=document.getElementById("trackingCode"),box=document.getElementById("trackingResult");
 const code=input.value.trim().toUpperCase();
 if(!code){box.textContent="اكتب رقم الطلب أولًا.";return}
 try{
  const out=await (await fetch("/api/bookings/"+encodeURIComponent(code))).json();
  if(!out.ok){box.textContent=out.message||"الحجز غير موجود.";return}
  const b=out.booking;
  box.innerHTML=`<div class="tracking-card">
    <h3>طلب ${b.booking_code}</h3>
    <p><b>السيارة:</b> ${b.car_name||"—"}</p>
    <p><b>الخدمة:</b> ${b.service||"—"}</p>
    <p><b>التاريخ:</b> ${b.start_date||"—"} ${b.end_date?("إلى "+b.end_date):""}</p>
    <p><b>إجمالي الحجز:</b> ${b.total||0} جنيه</p>
    <p><b>العربون 50%:</b> ${b.deposit||0} جنيه</p>
    <p><b>طريقة الدفع:</b> ${b.payment_method||"—"}</p>
    <p><b>حالة الدفع:</b> <span class="status">${b.payment_status}</span></p>
    <p><b>حالة الحجز:</b> <span class="status">${b.booking_status}</span></p>
    <p class="muted">للاستفسار عبر واتساب: 01010970035</p>
  </div>`;
 }catch(e){box.textContent="تعذر الاتصال بالخادم."}
}
loadCars();
