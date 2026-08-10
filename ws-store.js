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
      +'<p style="color:#7a7390;font-size:.9rem;margin-bottom:8px">Бүх ажлын хуудсыг сонгосон хугацаанд <b>хязгааргүй</b> ашиглах</p>'
      +'<div style="font-size:.8rem;color:#16a34a;font-weight:700;background:#eafff1;border:1px solid #b6f0cd;border-radius:9px;padding:6px 10px;margin-bottom:12px">Санамж: анги бүрийн <b>эхний хуудас үнэгүй</b> — эхлээд туршаад үзээрэй!</div>'
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
    // ─── Facebook/Messenger доторх browser QPay deeplink-ийг дэмждэггүй ───
    if(/(fban|fbav|fb_iab|instagram|messenger|micromessenger|line\/|tiktok|twitter|okhttp)/i.test(navigator.userAgent||'')){
      var wn=document.createElement('div');
      wn.style.cssText='background:#fff7e6;border:1.4px solid #f3dca6;color:#8a5a00;border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:.83rem;text-align:left;line-height:1.45';
      wn.innerHTML='<b>⚠️ Facebook/Messenger доторх browser байна.</b><br>QPay банк руу шилжихэд алдаа гарна. Баруун дээд булан дахь <b>⋯</b> товчийг дараад <b>«Open in browser / Гадаад browser-ээр нээх»</b> (Safari/Chrome) сонгож нээгээрэй.'
        +'<button id="wsCopyLink" style="margin-top:8px;font-weight:800;border:1.5px solid #e0b45f;background:#fff;color:#8a5a00;cursor:pointer;border-radius:999px;padding:.4rem .9rem;font-size:.8rem">🔗 Холбоос хуулах</button>';
      o.querySelector('#wsBuy').parentNode.insertBefore(wn,o.querySelector('#wsBuy'));
      wn.querySelector('#wsCopyLink').onclick=function(){var b=this;var t=location.href;
        try{navigator.clipboard.writeText(t).then(function(){b.textContent='✓ Хуулагдлаа';},function(){b.textContent=t;});}
        catch(e){b.textContent=t;}};
    }
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
  // Анги бүрийн хамгийн эхний ажлын хуудас — ҮНЭГҮЙ туршилт
  var WS_FREE=["urjver-hurd.html","urjver-4x3-12.html","huvaalt-5x2-12.html","numshul-nemeh-hasah-12.html","daraalal-zui-togtol-12.html","zereg-uildel-12.html","troichlen-zadlal-12.html","grafik-ax2.html","kvadrat-tentsbish-grafik.html","camb-4a-factors.html"];
  function curSlug(){ return (location.pathname.split('/').pop()||'').toLowerCase(); }
  function isFreeSheet(){ return WS_FREE.indexOf(curSlug())>=0; }
  function addFreeBadge(){
    var bar=document.querySelector('.bar'); if(!bar||bar.querySelector('.ws-free'))return;
    var s=document.createElement('span'); s.className='ws-free';
    s.style.cssText='display:inline-flex;align-items:center;gap:5px;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;font-weight:800;font-size:.82rem;border-radius:999px;padding:.4rem .9rem;box-shadow:0 6px 16px -8px rgba(22,163,74,.7)';
    s.innerHTML='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>Үнэгүй туршилт';
    bar.appendChild(s);
  }
  function enforcePaywall(){
    if(IS_QR)return;                                 // QR/сурагчийн горим — багшийн хуваалцсан ганц материал, төлбөргүй
    if(inIframe())return;                            // iframe доторх урьдчилан харах/танилцуулга — цоожгүй
    if(isFreeSheet()){ addFreeBadge(); return; }     // анги бүрийн эхний хуудас — үнэгүй
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
      '#sheet{position:relative;overflow:hidden}'+
      '#sheet.cm-branded>*:not(.cm-wm){position:relative;z-index:1}'+
      // Тамга бодолтын/хариу хайрцгуудын ЦААНА нуугдахгүйн тулд хамгийн дээр (наана) гаргана — сул тул бичихэд саад болохгүй
      '.cm-wm{position:absolute;left:50%;z-index:5;pointer-events:none;text-align:center;width:96%;'+
        'transform:translate(-50%,-50%) rotate(-9deg);'+
        '-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
      '.cm-wm.mid{top:50%}'+
      '.cm-wm .cm-bird{display:block;margin:0 auto;width:clamp(150px,30vw,250px);opacity:.09}'+
      ".cm-wm .cm-word{font:900 clamp(42px,16.5vw,136px)/1 'Segoe UI',Arial,sans-serif;letter-spacing:1px;"+
        'color:rgba(123,82,238,.08);text-transform:lowercase;white-space:nowrap}'+
      ".cm-wm .cm-url{font:800 clamp(16px,4vw,32px)/1 'Segoe UI',Arial,sans-serif;letter-spacing:1px;"+
        'color:rgba(123,82,238,.09);margin-top:8px;white-space:nowrap}'+
      '.cm-foot{position:relative;z-index:1;text-align:center;margin-top:12px;padding-top:9px;'+
        "border-top:1px solid #eee;font:800 11.5px 'Segoe UI',Arial,sans-serif;color:#8f83b8;"+
        'letter-spacing:.4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
      '.cm-foot b{color:#5a32d6}'+
      // Хэрэгтэй үед хуудсан дээр нэр/огноо шууд бичиж хэвлэх талбарууд
      '.cm-fill{display:inline-block;min-width:90px;outline:none;font-weight:800;color:#1a1030;cursor:text}'+
      '.cm-fill:focus{background:#f5efff;border-radius:4px}'+
      '.cm-fill:empty:not(:focus)::before{content:attr(data-ph);color:#c7bde6;font-weight:600}'+
      '@media print{.cm-fill{min-width:50px}.cm-fill:empty::before{content:""}}'+
      // Багш заавар/тайлбарыг шууд засах талбарууд
      '.cm-ed{outline:none;transition:background .12s}'+
      '.cm-ed:hover{background:rgba(123,82,238,.06);border-radius:5px;box-shadow:inset 0 0 0 1px rgba(123,82,238,.22)}'+
      '.cm-ed:focus{background:rgba(123,82,238,.11);border-radius:5px;box-shadow:inset 0 0 0 1px rgba(123,82,238,.5)}'+
      '@media print{.cm-ed:hover,.cm-ed:focus{background:none!important;box-shadow:none!important}}'+
      // ─── Гар утасны тохируулга: хуудас хойшоо гарахгүй болгох (зөвхөн дэлгэц, хэвлэлд нөлөөлөхгүй) ───
      '@media screen and (max-width:820px){'+
        'html,body{overflow-x:hidden!important}'+
        'body{padding:8px!important}'+
        '#sheet{width:100%!important;max-width:100%!important;padding:9mm 6mm!important}'+
        '#sheet .grid{gap:10px 12px!important}'+
      '}'+
      '@media screen and (max-width:560px){'+
        '#sheet{padding:7mm 5mm!important}'+
        '#sheet .grid{grid-template-columns:1fr!important;grid-template-rows:auto!important;grid-auto-flow:row!important;gap:9px!important}'+
        '#sheet .ans-grid{grid-template-columns:1fr!important}'+
        '#sheet .katex{white-space:normal}'+
      '}';
    document.head.appendChild(st);
  }
  function mkWm(pos){
    var wm=document.createElement('div'); wm.className='cm-wm '+pos;
    wm.innerHTML='<img class="cm-bird" src="/assets/cybermath-mascot.svg" alt="" />'+
      '<div class="cm-word">cybermath</div>'+
      '<div class="cm-url">cyber-math.com</div>';
    return wm;
  }
  function brandSheet(){
    var sh=document.getElementById('sheet'); if(!sh)return;
    if(!sh.querySelector('.cm-wm')){
      // Голд нэг том тамга (хоёр талдаа дүүрэн)
      sh.insertBefore(mkWm('mid'), sh.firstChild);
    }
    if(!sh.querySelector('.cm-foot')){
      var ft=document.createElement('div'); ft.className='cm-foot';
      ft.innerHTML='CyberMath Дасгалын төв · <b>'+WS_PROMO+'</b>';
      sh.appendChild(ft);
    }
    sh.classList.add('cm-branded');
  }
  // ─── Нэр/огноо/оноог хуудсан дээр шууд бичиж хэвлэх (contenteditable) ───
  var savedName=ls('cm_ws_name')||'';
  function enhanceMeta(){
    var spans=document.querySelectorAll('#sheet .meta > span'); if(!spans.length)return;
    [].forEach.call(spans,function(sp){
      if(sp.classList.contains('cm-fill')||sp.querySelector('.cm-fill'))return;
      var raw=(sp.textContent||'').trim(), ci=raw.indexOf(':');
      var label=ci>=0?raw.slice(0,ci+1):raw;
      var isName=/Нэр/i.test(label);
      sp.textContent=label+' ';
      var f=document.createElement('span');
      f.className='cm-fill'; f.contentEditable='true'; f.spellcheck=false;
      f.setAttribute('data-ph', isName?'нэр…':' ');
      if(isName&&savedName)f.textContent=savedName;
      sp.appendChild(f);
      f.addEventListener('input',function(){ if(isName){ savedName=(f.textContent||'').replace(/\s+$/,''); lset('cm_ws_name',savedName); } });
    });
  }
  // ─── Багш заавар/тайлбарыг шууд засах (зөвхөн энэ төхөөрөмжид локал хадгална) ───
  var EDIT_SEL='.task, .rule, .head .sub, .gtitle';
  var editDefaults={};
  function ekey(i){ return 'cm_wsedit::'+curSlug()+'::'+i; }
  function applyEdits(){
    if(IS_QR)return;
    var sh=document.getElementById('sheet'); if(!sh)return;
    var els=sh.querySelectorAll(EDIT_SEL);
    [].forEach.call(els,function(el,i){
      if(el.getAttribute('data-cm-ed'))return;
      editDefaults[i]=el.innerHTML;
      var saved=ls(ekey(i));
      if(saved!=null&&saved!==el.innerHTML)el.innerHTML=saved;
      el.setAttribute('data-cm-ed','1');
      el.setAttribute('contenteditable','true');
      el.setAttribute('spellcheck','false');
      el.classList.add('cm-ed');
      el.title='Багш заавраа энд шууд засаж болно (зөвхөн энэ төхөөрөмжид хадгалагдана)';
      el.addEventListener('input',function(){ try{lset(ekey(i),el.innerHTML);}catch(e){} refreshEditReset(); });
    });
    refreshEditReset();
  }
  function slugHasEdits(){
    try{ for(var k=0;k<localStorage.length;k++){var key=localStorage.key(k); if(key&&key.indexOf('cm_wsedit::'+curSlug()+'::')===0)return true;} }catch(e){}
    return false;
  }
  function resetEdits(){
    try{ for(var k=localStorage.length-1;k>=0;k--){var key=localStorage.key(k); if(key&&key.indexOf('cm_wsedit::'+curSlug()+'::')===0)localStorage.removeItem(key);} }catch(e){}
    editDefaults={};
    refreshEditReset();
    if(typeof window.build==='function'){ try{window.build();}catch(e){} } else { try{location.reload();}catch(e){} }
  }
  function refreshEditReset(){
    if(IS_QR)return; var bar=document.querySelector('.bar'); if(!bar)return;
    var b=bar.querySelector('.ws-editreset');
    if(slugHasEdits()){
      if(!b){ b=document.createElement('button'); b.type='button'; b.className='ws-editreset';
        b.style.cssText='font-weight:800;border:0;cursor:pointer;border-radius:999px;padding:.55rem 1rem;font-size:.85rem;color:#5a32d6;background:#efe9ff;display:inline-flex;align-items:center;gap:5px';
        b.innerHTML='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.64-6.36"/><path d="M3 4v6h6"/></svg>Заавар анхандаа';
        b.onclick=function(){ if(confirm('Засварласан заавар/тайлбарыг анхны хэвэнд нь оруулах уу?'))resetEdits(); };
        bar.appendChild(b);
      }
    } else if(b){ b.remove(); }
  }
  window.cmApplyEdits=applyEdits; window.cmResetEdits=resetEdits;
  function watchSheet(){
    var sh=document.getElementById('sheet'); if(!sh)return;
    // "Шинэ бодлого" дарахад #sheet дахин үүсдэг тул тамга/талбар/заавар засварыг эргүүлж нэмнэ
    new MutationObserver(function(){ if(!sh.querySelector('.cm-wm'))brandSheet(); enhanceMeta(); applyEdits(); })
      .observe(sh,{childList:true});
  }

  // ─── Ажлын хуудас бүрийн reaction + сэтгэгдэл ───
  var RX=[['like','👍'],['love','❤️'],['haha','😂'],['wow','😮'],['sad','😢'],['clap','👏']];
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function uid(){var k=ls('cm_uid');if(!k){k='u'+Math.random().toString(36).slice(2)+Date.now().toString(36);lset('cm_uid',k);}return k;}
  function ukey(){return ls('cm_last_user')||uid();}
  function sApi(action,data){data=data||{};data.action=action;var h={'Content-Type':'application/json'};var at=ls('cm_admin_token');if(at)h['Authorization']='Bearer '+at;var wt=ls('cm_ws_token');if(wt)data.token=wt;
    return fetch('/api/worksheets',{method:'POST',headers:h,body:JSON.stringify(data)}).then(function(r){return r.json();});}
  function ago(s){try{var t=new Date(s).getTime(),d=(Date.now()-t)/1000;if(d<60)return 'дөнгөж';if(d<3600)return Math.floor(d/60)+' мин';if(d<86400)return Math.floor(d/3600)+' цаг';if(d<2592000)return Math.floor(d/86400)+' хоног';return new Date(s).toLocaleDateString('mn-MN');}catch(e){return '';}}
  function injectSocialCSS(){
    if(document.getElementById('cm-social-css'))return;
    var st=document.createElement('style');st.id='cm-social-css';
    st.textContent=
      '.cm-social{max-width:210mm;margin:14px auto 40px;font-family:"Segoe UI",Arial,sans-serif}'+
      '.cm-card{background:#fff;border:1px solid #ece7fb;border-radius:16px;padding:16px 18px;box-shadow:0 10px 30px -20px rgba(90,50,214,.5)}'+
      '.cm-rx{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}'+
      '.cm-rx button{display:inline-flex;align-items:center;gap:5px;border:1.5px solid #eadffb;background:#faf8ff;border-radius:999px;padding:.4rem .8rem;cursor:pointer;font-size:1rem;font-weight:800;color:#5a32d6;transition:.12s;line-height:1}'+
      '.cm-rx button:hover{transform:translateY(-2px)}'+
      '.cm-rx button.on{background:linear-gradient(135deg,#7B52EE,#A855F7);border-color:#7B52EE;color:#fff}'+
      '.cm-rx button .n{font-size:.82rem;font-weight:800}'+
      '.cm-ctitle{font-weight:900;color:#5a32d6;font-size:1rem;margin:14px 0 10px;display:flex;align-items:center;gap:7px}'+
      '.cm-clist{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}'+
      '.cm-c{background:#faf9ff;border:1px solid #efe9ff;border-radius:12px;padding:9px 12px}'+
      '.cm-c .h{display:flex;align-items:center;gap:7px;font-size:.8rem;margin-bottom:3px}'+
      '.cm-c .nm{font-weight:800;color:#3a2d5e}.cm-c .nm.adm{color:#7B52EE}'+
      '.cm-c .tm{color:#9a92b5;font-weight:600}'+
      '.cm-c .bd{font-size:.9rem;color:#2c2545;white-space:pre-wrap;line-height:1.45}'+
      '.cm-c .del{margin-left:auto;border:0;background:transparent;color:#ef4444;cursor:pointer;font-size:.82rem}'+
      '.cm-empty{color:#9a92b5;font-size:.88rem;padding:4px 2px 10px}'+
      '.cm-form{display:flex;flex-direction:column;gap:8px}'+
      '.cm-form input,.cm-form textarea{border:1.5px solid #e7ddff;border-radius:11px;padding:.6rem .85rem;font-size:.9rem;outline:none;font-family:inherit;width:100%;box-sizing:border-box}'+
      '.cm-form textarea{resize:vertical;min-height:64px}'+
      '.cm-form .row{display:flex;justify-content:flex-end;gap:8px;align-items:center}'+
      '.cm-form button{border:0;background:linear-gradient(135deg,#7B52EE,#A855F7);color:#fff;font-weight:800;border-radius:999px;padding:.6rem 1.4rem;cursor:pointer;font-size:.9rem}'+
      '@media print{.cm-social{display:none!important}}';
    document.head.appendChild(st);
  }
  function renderSocialData(root,d){
    var counts=(d.reactions&&d.reactions.counts)||{}, mine=(d.reactions&&d.reactions.mine)||null;
    var rx=root.querySelector('.cm-rx');
    rx.innerHTML=RX.map(function(p){var n=counts[p[0]]||0;return '<button data-r="'+p[0]+'" class="'+(mine===p[0]?'on':'')+'">'+p[1]+(n?' <span class="n">'+n+'</span>':'')+'</button>';}).join('');
    [].forEach.call(rx.querySelectorAll('button'),function(b){b.onclick=function(){
      var r=b.getAttribute('data-r'); var next=(mine===r)?'':r;
      sApi('wsc_react',{slug:curSlug(),ukey:ukey(),reaction:next}).then(function(res){ if(res&&res.ok)renderSocialData(root,{reactions:{counts:res.counts,mine:res.mine},comments:null}); });
    };});
    if(d.comments!==null){
      var list=root.querySelector('.cm-clist'), cnt=root.querySelector('.cm-ccount');
      var cs=d.comments||[]; if(cnt)cnt.textContent=cs.length?('('+cs.length+')'):'';
      var isAdmin=!!ls('cm_admin_token');
      if(!cs.length){list.innerHTML='<div class="cm-empty">Одоогоор сэтгэгдэл алга. Хамгийн түрүүнд бичээрэй!</div>';}
      else list.innerHTML=cs.map(function(c){
        return '<div class="cm-c" data-id="'+c.id+'"><div class="h"><span class="nm'+(c.is_admin?' adm':'')+'">'+esc(c.name)+(c.is_admin?' ✔':'')+'</span><span class="tm">· '+ago(c.at)+'</span>'+(isAdmin?'<button class="del" title="Устгах">🗑</button>':'')+'</div><div class="bd">'+esc(c.body)+'</div></div>';
      }).join('');
      if(isAdmin)[].forEach.call(list.querySelectorAll('.del'),function(b){b.onclick=function(){var id=b.closest('.cm-c').getAttribute('data-id');if(!confirm('Сэтгэгдлийг устгах уу?'))return;sApi('wsc_delete',{id:+id}).then(function(){loadSocial(root);});};});
    }
  }
  function loadSocial(root){ sApi('wsc_list',{slug:curSlug(),ukey:ukey()}).then(function(d){ if(d&&d.ok)renderSocialData(root,d); }); }
  function injectSocial(){
    if(inIframe()||document.querySelector('.cm-social'))return;
    injectSocialCSS();
    var wrap=document.createElement('div');wrap.className='cm-social';
    var hasEmail=!!ls('cm_last_user');
    wrap.innerHTML='<div class="cm-card">'
      +'<div class="cm-rx"></div>'
      +'<div class="cm-ctitle">💬 Сэтгэгдэл <span class="cm-ccount" style="font-weight:700;color:#9a92b5;font-size:.85rem"></span></div>'
      +'<div class="cm-clist"></div>'
      +'<div class="cm-form">'
        +(hasEmail?'':'<input class="cm-name" type="text" maxlength="60" placeholder="Таны нэр (заавал биш)">')
        +'<textarea class="cm-body" maxlength="1000" placeholder="Энэ ажлын хуудасны талаар сэтгэгдэл, санал бичих…"></textarea>'
        +'<div class="row"><button type="button" class="cm-send">Илгээх</button></div>'
      +'</div></div>';
    document.body.appendChild(wrap);
    renderSocialData(wrap,{reactions:{counts:{},mine:null},comments:[]}); // шууд харуулна, дараа нь API-аас шинэчилнэ
    var send=wrap.querySelector('.cm-send'), bodyIn=wrap.querySelector('.cm-body'), nameIn=wrap.querySelector('.cm-name');
    send.onclick=function(){
      var body=(bodyIn.value||'').trim(); if(body.length<1){bodyIn.focus();return;}
      send.disabled=true;var ot=send.textContent;send.textContent='Илгээж байна…';
      sApi('wsc_add',{slug:curSlug(),body:body,name:nameIn?(nameIn.value||'').trim():''}).then(function(res){
        send.disabled=false;send.textContent=ot;
        if(res&&res.ok){bodyIn.value='';loadSocial(wrap);}
        else alert((res&&res.error)||'Илгээж чадсангүй');
      }).catch(function(){send.disabled=false;send.textContent=ot;alert('Сүлжээний алдаа');});
    };
    loadSocial(wrap);
  }

  // ─── Ангиар хэвлэх (олон сурагчийн нэрээр нэг дор) ───
  function addBatchBtn(){
    var bar=document.querySelector('.bar'); if(!bar||bar.querySelector('.ws-batch'))return;
    var b=document.createElement('button');
    b.className='btn ws-batch'; b.type='button';
    b.style.background='linear-gradient(135deg,#f59e0b,#f97316)';
    b.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Ангиар хэвлэх';
    b.onclick=openBatch;
    bar.appendChild(b);
  }
  function openBatch(){
    if(document.getElementById('cm-batchModal'))return;
    var o=document.createElement('div');o.id='cm-batchModal';
    o.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(20,15,40,.6);display:grid;place-items:center;padding:16px;font-family:"Segoe UI",Arial,sans-serif';
    o.innerHTML='<div style="background:#fff;border-radius:18px;max-width:440px;width:100%;padding:22px;box-shadow:0 24px 60px -18px rgba(0,0,0,.5)">'
      +'<div style="display:flex;align-items:center;gap:7px;font-weight:900;color:#5a32d6;font-size:1.12rem;margin-bottom:3px"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Ангиар хэвлэх</div>'
      +'<p style="color:#7a7390;font-size:.85rem;margin-bottom:10px;line-height:1.4"><b>Хүүхдийн тоог</b> оруулбал нэр хоосон (сурагч өөрөө бичнэ) хуудсууд үүснэ. Эсвэл доор <b>нэрсийг</b> мөр бүрд бичвэл нэр бүрд тусдаа хуудас. Бүгд <b>нэг дор</b> хэвлэгдэнэ.</p>'
      +'<label style="display:block;font-size:.86rem;color:#3a2d5e;font-weight:700;margin-bottom:5px">Хүүхдийн тоо</label>'
      +'<input id="cm-batchCount" type="number" min="1" max="80" value="30" style="width:100%;box-sizing:border-box;border:1.6px solid #e7ddff;border-radius:12px;padding:.6rem .9rem;font-size:.98rem;font-weight:700;outline:none;font-family:inherit;margin-bottom:12px">'
      +'<div style="font-size:.8rem;color:#9a91b4;text-align:center;margin-bottom:9px">— эсвэл нэрсээр (заавал биш) —</div>'
      +'<textarea id="cm-batchNames" rows="5" placeholder="Батболд&#10;Сараа&#10;Тэмүүлэн&#10;..." style="width:100%;box-sizing:border-box;border:1.6px solid #e7ddff;border-radius:12px;padding:.7rem .9rem;font-size:.92rem;outline:none;resize:vertical;font-family:inherit"></textarea>'
      +'<label style="display:flex;align-items:center;gap:7px;margin:11px 0 4px;font-size:.86rem;color:#3a2d5e;font-weight:700;cursor:pointer"><input type="checkbox" id="cm-batchSame"> Бүх сурагчид <b>ижил бодлого</b> (тэгэхгүй бол тус бүр өөр хувилбар)</label>'
      +'<div id="cm-batchMsg" style="font-size:.82rem;color:#7a7390;margin:8px 0"></div>'
      +'<div style="display:flex;gap:8px;justify-content:flex-end">'
        +'<button id="cm-batchCancel" style="border:1.4px solid #e7ddff;background:#faf7ff;color:#5a32d6;font-weight:800;border-radius:999px;padding:.55rem 1.1rem;cursor:pointer;font-family:inherit">Болих</button>'
        +'<button id="cm-batchGo" style="display:inline-flex;align-items:center;gap:6px;border:0;background:linear-gradient(135deg,#7B52EE,#A855F7);color:#fff;font-weight:800;border-radius:999px;padding:.55rem 1.3rem;cursor:pointer;font-family:inherit"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>Бэлдэж хэвлэх</button>'
      +'</div></div>';
    document.body.appendChild(o);
    var cn=o.querySelector('#cm-batchCount'); try{cn.focus();cn.select();}catch(e){}
    o.querySelector('#cm-batchCancel').onclick=function(){o.remove();};
    o.querySelector('#cm-batchGo').onclick=function(){ runBatch(o); };
  }
  function injectBatchPrintCSS(){
    if(document.getElementById('cm-batch-css'))return;
    var st=document.createElement('style');st.id='cm-batch-css';
    st.textContent='@media print{'
      +'body>*:not(#cm-batch){display:none!important}'
      +'#cm-batch{display:block!important}'
      +'.cm-batch-sheet{position:relative;overflow:hidden;page-break-after:always;box-shadow:none!important;width:auto!important;min-height:auto!important;margin:0!important;padding:0!important;background:#fff}'
      +'.cm-batch-sheet:last-child{page-break-after:auto}'
      +'}';
    document.head.appendChild(st);
  }
  function runBatch(modal){
    var msg=modal.querySelector('#cm-batchMsg');
    var names=(modal.querySelector('#cm-batchNames').value||'').split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean);
    if(!names.length){
      var cntEl=modal.querySelector('#cm-batchCount'), cnt=parseInt(cntEl&&cntEl.value,10);
      if(!cnt||cnt<1){msg.style.color='#dc2626';msg.textContent='Хүүхдийн тоог оруулах эсвэл нэрсийг бичнэ үү.';return;}
      if(cnt>80)cnt=80;
      names=[]; for(var c=0;c<cnt;c++)names.push('');   // нэр хоосон — сурагч өөрөө бичнэ
    }
    if(names.length>80){names=names.slice(0,80);}
    var same=modal.querySelector('#cm-batchSame').checked;
    var sheet=document.getElementById('sheet'); if(!sheet)return;
    var hasBuild=(typeof window.build==='function');
    var sa=document.getElementById('sa');
    // Ангиар хэвлэхэд хариу хавсаргахгүй (сурагчийн хувь)
    if(sa){ sa.checked=false; if(typeof window.toggleAns==='function')try{window.toggleAns();}catch(e){} }
    msg.style.color='#7a7390';msg.textContent=names.length+' хуудас бэлдэж байна…';
    var old=document.getElementById('cm-batch'); if(old)old.remove();
    var box=document.createElement('div');box.id='cm-batch';box.style.display='none';
    if(same&&hasBuild){ try{window.build();}catch(e){} brandSheet(); enhanceMeta(); }
    for(var i=0;i<names.length;i++){
      if(!same&&hasBuild){ try{window.build();}catch(e){} brandSheet(); enhanceMeta(); }
      var nf=sheet.querySelector('.meta .cm-fill[data-ph="нэр…"]');
      if(nf)nf.textContent=names[i];
      var z=fitZoomFor(sheet);   // нэг хуудсанд багтаах
      var clone=document.createElement('div');
      clone.className='sheet cm-batch-sheet';
      if(z<1)clone.style.zoom=z;
      clone.innerHTML=sheet.innerHTML;
      box.appendChild(clone);
    }
    document.body.appendChild(box);
    injectBatchPrintCSS();
    modal.remove();
    function cleanup(){ var bx=document.getElementById('cm-batch'); if(bx)bx.remove(); window.removeEventListener('afterprint',cleanup);
      if(hasBuild){ try{window.build();}catch(e){} brandSheet(); enhanceMeta(); } }
    window.addEventListener('afterprint',cleanup);
    setTimeout(function(){ window.print(); }, 80);
  }

  // ─── Хэвлэхэд нэг A4-д багтаах (шаардвал бага зэрэг жижигрүүлнэ) ───
  var PRINT_TARGET=1030;   // ~272mm (нэг A4 хуудасны боломжит өндөр, зайтайгаар)
  // Хэвлэлийн бодит өргөн (210mm)-ээр off-screen хэмжиж, дэлгэцийн өргөнөөс хамаарахгүй болгоно
  function fitZoomFor(sh){
    if(!sh)return 1;
    try{
      var probe=sh.cloneNode(true);
      probe.removeAttribute('id');
      probe.style.cssText='position:absolute;left:-99999px;top:0;width:210mm;max-width:none;min-height:0;margin:0;padding:0;box-shadow:none;zoom:1;transform:none;filter:none';
      var pa=probe.querySelector('#answers,.ans-page'); if(pa)pa.parentNode.removeChild(pa);  // хариу хуудсыг хасна
      document.body.appendChild(probe);
      var h=probe.scrollHeight;
      document.body.removeChild(probe);
      return h>PRINT_TARGET ? Math.max(0.7, PRINT_TARGET/h) : 1;
    }catch(e){ return 1; }
  }
  function applyPrintFit(){ var sh=document.getElementById('sheet'); if(sh&&!document.getElementById('cm-batch')) sh.style.zoom=fitZoomFor(sh); }
  function clearPrintFit(){ var sh=document.getElementById('sheet'); if(sh) sh.style.zoom=''; }
  window.addEventListener('beforeprint',applyPrintFit);
  window.addEventListener('afterprint',clearPrintFit);

  function init(){ injectBrandCSS(); brandSheet(); watchSheet(); enhanceMeta(); applyEdits(); if(!IS_QR){addBtn();addBatchBtn();} applyQR(); enforcePaywall(); injectSocial(); }
  if(document.readyState!=='loading')init();
  else document.addEventListener('DOMContentLoaded',init);
})();
