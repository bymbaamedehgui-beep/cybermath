// Дасгалын хуудсуудад нийтлэг — хэвлэсэн/үүсгэсэн багцыг серверт санах.
// Хуудас build() дотроо window.WS_ITEMS=[{q,a},...]; window.WS_TITLE='...'; гэж тавина.
(function(){
  // WS_ITEMS тавиагүй хуудсуудад DOM-оос (текстээр) уншиж авах нөөц арга
  function scrapeItems(){
    var as=document.querySelectorAll('#answers .ans-grid .a');
    var ps=document.querySelectorAll('#sheet .grid .q, .grid .q');
    var strip=function(s){return (s||'').replace(/\$/g,'').trim();};
    var arr=[];
    for(var i=0;i<as.length;i++){
      var aEl=as[i], aSp=aEl.querySelector('span:last-child');
      var av=strip(aSp?aSp.textContent:aEl.textContent);
      var qv='';
      var pEl=ps[i];
      if(pEl){var qm=pEl.querySelector('.qm')||pEl.querySelector('.exp');qv=strip(qm?qm.textContent:'');}
      qv=qv.replace(/=\s*$/,'').trim();
      if(av.indexOf('=')>=0)arr.push({q:av,a:''});
      else arr.push({q:qv,a:av});
    }
    return arr;
  }
  window.wsSaveCurrent=function(btn){
    var items=(window.WS_ITEMS&&window.WS_ITEMS.length)?window.WS_ITEMS:scrapeItems();
    if(!items.length){alert('Хадгалах бодлого алга. Эхлээд "Шинэ бодлого" дарна уу.');return;}
    var h1=document.querySelector('#sheet .head h1, .head h1');
    var title=window.WS_TITLE||(h1&&h1.textContent)||document.title||'Дасгал';
    // Тэмдэглэл бичих (хүсвэл) — Cancel дарвал хадгалахгүй
    var note=window.prompt('Тэмдэглэл бичнэ үү (жнь: 9А анги, гэрийн даалгавар):', '');
    if(note===null)return;
    if(btn){btn.disabled=true;var ot=btn.innerHTML;btn.textContent='Хадгалж байна…';}
    fetch('/api/worksheets',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'save',title:title,items:items,note:note})})
      .then(function(r){return r.json();})
      .then(function(d){
        if(d&&d.ok){alert('✓ Тэмдэглэлээ!  Код: #'+d.code+'\n\n"Дасгалын төв → Хадгалсан хуудаснууд" хэсгээс хариутай нь дахин харж болно.');}
        else alert('Алдаа: '+((d&&d.error)||'хадгалж чадсангүй'));
      })
      .catch(function(e){alert('Сүлжээний алдаа: '+e.message);})
      .finally(function(){if(btn){btn.disabled=false;btn.innerHTML=ot;}});
  };
  var ICO_MARK='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:5px"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  function addBtn(){
    var bar=document.querySelector('.bar'); if(!bar||bar.querySelector('.ws-save'))return;
    var b=document.createElement('button');
    b.className='btn ws-save'; b.type='button';
    b.style.background='linear-gradient(135deg,#0ea5e9,#1d6c8c)';
    b.innerHTML=ICO_MARK+'Тэмдэглэх';
    b.onclick=function(){window.wsSaveCurrent(b);};
    bar.appendChild(b);
  }
  // ─── QR / сурагчийн горим: ?qr=1 бол хариу ба бодолт харагдахгүй ───
  var IS_QR=/[?&]qr=1(&|$)/.test(location.search);
  window.WS_QR=IS_QR;
  // Хариу/бодолтын хэсгийг нуугаад агуулгыг нь DOM-оос цэвэрлэх (шалгаж болохгүй)
  function stripAnswers(){
    document.querySelectorAll('#answers, .ans-page').forEach(function(el){
      el.style.display='none';el.setAttribute('data-qr-hidden','1');
      if(el.innerHTML)el.innerHTML='';
    });
  }
  function applyQR(){
    if(!IS_QR)return;
    // "Хариу хавсаргах" тохиргоог унтрааж нуух
    var sa=document.getElementById('sa');
    if(sa){sa.checked=false;var lab=(sa.closest&&sa.closest('label'))||sa.parentNode;if(lab)lab.style.display='none';}
    // toggleAns()-ийг идэвхгүй болгож хариуг ил гаргахаас сэргийлэх
    window.toggleAns=function(){stripAnswers();};
    stripAnswers();
    // Тэмдэг
    var bar=document.querySelector('.bar');
    if(bar&&!bar.querySelector('.qr-badge')){
      var s=document.createElement('span');s.className='qr-badge';
      s.textContent='👁 Сурагчийн горим — хариугүй';
      s.style.cssText='font-weight:800;font-size:.82rem;color:#0f766e;background:#ccfbf1;border:1px solid #99f6e4;border-radius:999px;padding:.42rem .9rem';
      bar.appendChild(s);
    }
  }
  // build() дахин зурсан ч хариу нуугдсан хэвээр байлгах
  if(IS_QR){
    var mo=new MutationObserver(function(){
      if(document.querySelector('#answers:not([data-qr-hidden]) *, .ans-page:not([data-qr-hidden]) *'))stripAnswers();
    });
    try{mo.observe(document.body||document.documentElement,{childList:true,subtree:true});}catch(e){}
  }
  // ─── Paywall: ажлын хуудсыг бүтэн жилийн эрхээр нээх (39900₮ / QPay) ───
  var WS_PRICE=39900;
  function ls(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function lset(k,v){try{localStorage.setItem(k,v);}catch(e){}}
  function checkAccess(){
    if(ls('cm_admin_token'))return Promise.resolve(true);            // админ үргэлж нээлттэй
    var body={token:ls('cm_token'),wstoken:ls('cm_ws_token'),email:ls('cm_last_user')};
    return fetch('/api/qpay?action=wsstatus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json();})
      .then(function(d){
        if(!d)return true;
        if(d.enabled===false)return true;                            // серверийн kill-switch
        if(d.active){ if(d.ws_token)lset('cm_ws_token',d.ws_token); return true; }
        return false;
      })
      .catch(function(){return true;});                              // API алдаа → түгжихгүй (fail-open)
  }
  var pollT=null;
  function unlockWs(){ if(pollT){clearInterval(pollT);pollT=null;} var o=document.getElementById('wsLock'); if(o)o.parentNode.removeChild(o); var sh=document.getElementById('sheet'); if(sh){sh.style.filter='';sh.style.pointerEvents='';} /* Хэвлэх/PDF товчийг эргүүлж харуулах */ [].forEach.call(document.querySelectorAll('.bar .btn'),function(b){b.style.display='';}); }
  function showLock(){
    var sh=document.getElementById('sheet'); if(sh){sh.style.filter='blur(6px)';sh.style.pointerEvents='none';}
    var pb=document.querySelector('.bar .btn:not(.refresh)'); // хэвлэх товч (эхнийх refresh)
    var o=document.createElement('div');o.id='wsLock';
    o.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(20,15,40,.62);display:grid;place-items:center;padding:16px;font-family:"Segoe UI",Arial,sans-serif';
    o.innerHTML='<div style="position:relative;background:#fff;border-radius:20px;max-width:430px;width:100%;padding:24px;text-align:center;box-shadow:0 24px 60px -18px rgba(0,0,0,.5)">'
      +'<button id="wsBack" style="position:absolute;top:14px;left:14px;display:inline-flex;align-items:center;gap:5px;border:1.4px solid #e7ddff;background:#faf7ff;color:#5a32d6;font-weight:800;font-size:.82rem;border-radius:999px;padding:.4rem .8rem;cursor:pointer;font-family:inherit"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>Буцах</button>'
      +'<div style="width:60px;height:60px;margin:2px auto 4px;background:linear-gradient(135deg,#7B52EE,#A855F7);border-radius:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 18px -6px rgba(123,82,238,.6)"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2.2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/><circle cx="12" cy="15" r="1.4" fill="#fff" stroke="none"/><path d="M12 16v2.2"/></svg></div>'
      +'<h3 style="color:#5a32d6;font-size:1.25rem;font-weight:900;margin:6px 0 2px">Ажлын хуудсын эрх</h3>'
      +'<p style="color:#7a7390;font-size:.9rem;margin-bottom:12px">Бүх ажлын хуудсыг сонгосон хугацаанд <b>хязгааргүй</b> ашиглах</p>'
      +'<div id="wsDur" style="display:flex;gap:6px;margin-bottom:12px">'
        +'<button type="button" class="wsd" data-m="3">3 сар</button>'
        +'<button type="button" class="wsd" data-m="6">6 сар</button>'
        +'<button type="button" class="wsd" data-m="9">9 сар</button>'
        +'<button type="button" class="wsd" data-m="12">1 жил</button>'
      +'</div>'
      +'<div id="wsPriceBox" style="font-size:1.7rem;font-weight:900;color:#16a34a;margin-bottom:14px"></div>'
      +'<input id="wsEmail" type="email" placeholder="Имэйл хаяг" style="width:100%;border:1.6px solid #e7ddff;border-radius:12px;padding:.7rem .9rem;font-size:.95rem;outline:none;margin-bottom:10px" />'
      +'<div style="display:flex;gap:6px;margin-bottom:4px">'
        +'<input id="wsPromo" type="text" placeholder="Урамшууллын код (заавал биш)" style="flex:1;min-width:0;border:1.6px solid #e7ddff;border-radius:12px;padding:.7rem .9rem;font-size:.9rem;outline:none;text-transform:uppercase" />'
        +'<button id="wsPromoBtn" style="flex-shrink:0;font-weight:800;border:1.6px solid #c9b8ff;background:#f4efff;color:#5a32d6;cursor:pointer;border-radius:12px;padding:0 1rem;font-size:.88rem">Хэрэглэх</button>'
      +'</div>'
      +'<div id="wsPromoMsg" style="font-size:.8rem;font-weight:700;margin:2px 0 10px;min-height:.9em"></div>'
      +'<button id="wsBuy" style="width:100%;font-weight:800;border:0;cursor:pointer;border-radius:999px;padding:.75rem;font-size:.95rem;color:#fff;background:linear-gradient(135deg,#7B52EE,#A855F7)">QPay-аар худалдан авах</button>'
      +'<div id="wsQr" style="margin-top:14px"></div>'
      +'<div id="wsMsg" style="font-size:.84rem;color:#7a7390;margin-top:10px;min-height:1em"></div>'
      +'<a id="wsRestore" href="#" style="display:inline-block;margin-top:10px;font-size:.82rem;color:#5a32d6;font-weight:700;text-decoration:none">Эрхээ сэргээх (имэйлээр)</a>'
      +'</div>';
    document.body.appendChild(o);
    if(pb)pb.style.display='none';
    o.querySelector('#wsBack').onclick=function(){
      if(pollT){clearInterval(pollT);pollT=null;}
      // Шинэ табд нээгдсэн бол (history.length<=1) history.back() ажиллахгүй → каталог руу
      var sameOriginRef=document.referrer&&document.referrer.indexOf(location.origin)===0;
      if(history.length>1&&sameOriginRef)history.back();
      else location.href='/worksheets.html';
    };
    var em=o.querySelector('#wsEmail'); if(ls('cm_last_user'))em.value=ls('cm_last_user');
    var msg=o.querySelector('#wsMsg'),qr=o.querySelector('#wsQr');
    function valid(e){return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);}
    function fmt(n){return String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',');}
    // ─── Шаталсан үнэ (3/6/9/12 сар) + урамшууллын код ───
    var WS_PRICES={3:39900,6:69900,9:99900,12:119900};
    var LABEL={3:'3 сар',6:'6 сар',9:'9 сар',12:'1 жил'};
    var selMonths=3, appliedPromo=null, curPct=0;
    var priceBox=o.querySelector('#wsPriceBox');
    var promoIn=o.querySelector('#wsPromo'),promoBtn=o.querySelector('#wsPromoBtn'),promoMsg=o.querySelector('#wsPromoMsg');
    var durBtns=o.querySelectorAll('#wsDur .wsd');
    function styleDur(){
      [].forEach.call(durBtns,function(b){
        var on=(+b.getAttribute('data-m')===selMonths);
        b.style.cssText='flex:1;cursor:pointer;font-weight:800;font-size:.82rem;border-radius:11px;padding:.5rem .2rem;transition:.12s;'
          +(on?'border:1.6px solid #7B52EE;background:linear-gradient(135deg,#7B52EE,#A855F7);color:#fff;box-shadow:0 6px 14px -8px rgba(123,82,238,.9)'
              :'border:1.6px solid #e7ddff;background:#fff;color:#5a32d6');
      });
    }
    function renderPrice(){
      var base=WS_PRICES[selMonths], price=curPct>0?Math.round(base*(100-curPct)/100):base;
      var per='<span style="font-size:.86rem;color:#7a7390;font-weight:700">/ '+LABEL[selMonths]+'</span>';
      if(curPct>0){
        priceBox.innerHTML='<span style="text-decoration:line-through;color:#b3a9cf;font-size:1.05rem;font-weight:800">'+fmt(base)+'₮</span> '+fmt(price)+'₮ '+per+' <span style="display:inline-block;background:#dcfce7;color:#16a34a;font-size:.72rem;font-weight:800;border-radius:999px;padding:2px 8px;vertical-align:middle">-'+curPct+'%</span>';
      } else { priceBox.innerHTML=fmt(base)+'₮ '+per; }
    }
    [].forEach.call(durBtns,function(b){ b.onclick=function(){ selMonths=+b.getAttribute('data-m'); styleDur(); renderPrice(); }; });
    styleDur(); renderPrice();
    // Серверийн бодит үнийг татаж шинэчлэх
    fetch('/api/qpay?action=wsprices').then(function(r){return r.json();}).then(function(d){ if(d&&d.prices){WS_PRICES=d.prices;renderPrice();} }).catch(function(){});
    promoBtn.onclick=function(){
      var code=(promoIn.value||'').trim().toUpperCase();
      if(!code){appliedPromo=null;curPct=0;renderPrice();promoMsg.textContent='';promoIn.style.borderColor='#e7ddff';return;}
      promoBtn.disabled=true;var ot=promoBtn.textContent;promoBtn.textContent='…';
      fetch('/api/qpay?action=promocheck',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({promo:code,months:selMonths})})
        .then(function(r){return r.json();}).then(function(d){
          promoBtn.disabled=false;promoBtn.textContent=ot;
          if(d&&d.valid){
            appliedPromo=code;curPct=d.pct;renderPrice();
            promoMsg.style.color='#16a34a';promoMsg.textContent='✓ '+d.pct+'% хөнгөлөлт хэрэгжлээ';promoIn.style.borderColor='#22c55e';
          }else{
            appliedPromo=null;curPct=0;renderPrice();
            promoMsg.style.color='#dc2626';promoMsg.textContent='Код буруу эсвэл хүчингүй байна';promoIn.style.borderColor='#fca5a5';
          }
        }).catch(function(){promoBtn.disabled=false;promoBtn.textContent=ot;promoMsg.style.color='#dc2626';promoMsg.textContent='Шалгах үед алдаа гарлаа';});
    };
    promoIn.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();promoBtn.click();}});
    o.querySelector('#wsBuy').onclick=function(){
      var email=(em.value||'').trim().toLowerCase();
      if(!valid(email)){msg.textContent='Зөв имэйл хаяг оруулна уу';return;}
      this.disabled=true;this.textContent='Нэхэмжлэх үүсгэж байна…';var btn=this;
      fetch('/api/qpay?action=create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,plan:'wsmonths',months:selMonths,promo:appliedPromo})})
        .then(function(r){return r.json();}).then(function(d){
          var inv=d&&d.invoice;
          if(!inv||!inv.invoice_id){msg.textContent='Нэхэмжлэх үүсгэж чадсангүй. Дахин оролдоно уу.';btn.disabled=false;btn.textContent='QPay-аар худалдан авах';return;}
          var img=inv.qr_image?('<img src="data:image/png;base64,'+inv.qr_image+'" style="width:190px;height:190px" alt="QPay QR"/>'):'';
          var link=inv.qPay_shortUrl?('<div style="margin-top:8px"><a href="'+inv.qPay_shortUrl+'" target="_blank" style="display:inline-flex;align-items:center;gap:5px;color:#5a32d6;font-weight:700;font-size:.85rem;text-decoration:none"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>Утаснаас төлөх</a></div>'):'';
          qr.innerHTML='<div style="font-size:.82rem;color:#7a7390;margin-bottom:6px">QPay аппаар уншуулж төлнө үү</div>'+img+link;
          btn.style.display='none';em.disabled=true;
          msg.textContent='Төлбөрийг хүлээж байна…';
          pollT=setInterval(function(){
            fetch('/api/qpay?action=check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invoice_id:inv.invoice_id,email:email,plan:'wsmonths',months:selMonths,promo:appliedPromo})})
              .then(function(r){return r.json();}).then(function(c){
                if(c&&c.paid){ if(c.ws_token)lset('cm_ws_token',c.ws_token); lset('cm_last_user',email); msg.style.color='#16a34a';msg.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg>Амжилттай! Нээгдэж байна…'; setTimeout(unlockWs,700); }
              }).catch(function(){});
          },3000);
        }).catch(function(){msg.textContent='Сүлжээний алдаа. Дахин оролдоно уу.';btn.disabled=false;btn.textContent='QPay-аар худалдан авах';});
    };
    o.querySelector('#wsRestore').onclick=function(ev){ev.preventDefault();
      var email=(em.value||prompt('Эрх авсан имэйл хаягаа оруулна уу:','')||'').trim().toLowerCase();
      if(!valid(email)){msg.textContent='Зөв имэйл оруулна уу';return;}
      msg.textContent='Шалгаж байна…';
      fetch('/api/qpay?action=wsstatus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email})})
        .then(function(r){return r.json();}).then(function(d){
          if(d&&d.active){ if(d.ws_token)lset('cm_ws_token',d.ws_token); lset('cm_last_user',email); unlockWs(); }
          else msg.textContent='Энэ имэйлд идэвхтэй эрх олдсонгүй.';
        }).catch(function(){msg.textContent='Шалгах үед алдаа гарлаа.';});
    };
  }
  function inIframe(){ try{return window.top!==window.self;}catch(e){return true;} }
  function enforcePaywall(){
    if(IS_QR)return;                                 // QR/сурагчийн горим — багшийн хуваалцсан ганц материал, төлбөргүй
    if(inIframe())return;                            // iframe доторх урьдчилан харах/танилцуулга — цоожгүй
    if(ls('cm_admin_token'))return;                 // админ — цоожгүй, flash-гүй
    showLock();                                      // нээмэгц шууд төлбөрийн хэсэг харуулна
    checkAccess().then(function(ok){ if(ok)unlockWs(); }); // эрхтэй/алдаа бол буцааж нээнэ
  }

  // ─── CyberMath усан тэмдэг (тамга) + сурталчилгааны линк — хэвлэсэн хуудсанд ч гарна ───
  var WS_PROMO='cyber-math.com/dasgal';
  function injectBrandCSS(){
    if(document.getElementById('cm-brand-css'))return;
    var st=document.createElement('style'); st.id='cm-brand-css';
    st.textContent=
      '#sheet{position:relative}'+
      '#sheet.cm-branded>*:not(.cm-wm){position:relative;z-index:1}'+
      '.cm-wm{position:absolute;top:50%;left:50%;z-index:0;pointer-events:none;text-align:center;'+
        'transform:translate(-50%,-50%) rotate(-20deg);'+
        '-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
      '.cm-wm .cm-bird{display:block;margin:0 auto;width:clamp(150px,30vw,260px);opacity:.07}'+
      ".cm-wm .cm-word{font:900 clamp(44px,11vw,120px)/1 'Segoe UI',Arial,sans-serif;letter-spacing:2px;"+
        'color:rgba(123,82,238,.055);text-transform:lowercase;white-space:nowrap}'+
      ".cm-wm .cm-url{font:800 clamp(16px,4vw,32px)/1 'Segoe UI',Arial,sans-serif;letter-spacing:1px;"+
        'color:rgba(123,82,238,.07);margin-top:8px;white-space:nowrap}'+
      '.cm-foot{position:relative;z-index:1;text-align:center;margin-top:12px;padding-top:9px;'+
        "border-top:1px solid #eee;font:800 11.5px 'Segoe UI',Arial,sans-serif;color:#8f83b8;"+
        'letter-spacing:.4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
      '.cm-foot b{color:#5a32d6}';
    document.head.appendChild(st);
  }
  function brandSheet(){
    var sh=document.getElementById('sheet'); if(!sh)return;
    if(!sh.querySelector('.cm-wm')){
      var wm=document.createElement('div'); wm.className='cm-wm';
      wm.innerHTML='<img class="cm-bird" src="/assets/cybermath-mascot.svg" alt="" />'+
        '<div class="cm-word">cybermath</div>'+
        '<div class="cm-url">cyber-math.com</div>';
      sh.insertBefore(wm, sh.firstChild);
    }
    if(!sh.querySelector('.cm-foot')){
      var ft=document.createElement('div'); ft.className='cm-foot';
      ft.innerHTML='CyberMath Дасгалын төв · <b>'+WS_PROMO+'</b>';
      sh.appendChild(ft);
    }
    sh.classList.add('cm-branded');
  }
  function watchSheet(){
    var sh=document.getElementById('sheet'); if(!sh)return;
    // "Шинэ бодлого" дарахад #sheet дахин үүсдэг тул тамгыг эргүүлж нэмнэ
    new MutationObserver(function(){ if(!sh.querySelector('.cm-wm'))brandSheet(); })
      .observe(sh,{childList:true});
  }

  function init(){ injectBrandCSS(); brandSheet(); watchSheet(); if(!IS_QR)addBtn(); applyQR(); enforcePaywall(); }
  if(document.readyState!=='loading')init();
  else document.addEventListener('DOMContentLoaded',init);
})();
