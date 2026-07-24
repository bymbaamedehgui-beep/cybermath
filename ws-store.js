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
    if(btn){btn.disabled=true;var ot=btn.textContent;btn.textContent='⏳ Хадгалж байна...';}
    fetch('/api/worksheets',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'save',title:title,items:items,note:note})})
      .then(function(r){return r.json();})
      .then(function(d){
        if(d&&d.ok){alert('💾 Хадгаллаа!  Код: #'+d.code+'\n\nАдмин → "Дасгалын төв" → Хадгалсан хэсгээс хариуг нь шалгана.');}
        else alert('Алдаа: '+((d&&d.error)||'хадгалж чадсангүй'));
      })
      .catch(function(e){alert('Сүлжээний алдаа: '+e.message);})
      .finally(function(){if(btn){btn.disabled=false;btn.textContent=ot;}});
  };
  function addBtn(){
    var bar=document.querySelector('.bar'); if(!bar||bar.querySelector('.ws-save'))return;
    var b=document.createElement('button');
    b.className='btn ws-save'; b.type='button';
    b.style.background='linear-gradient(135deg,#0ea5e9,#1d6c8c)';
    b.textContent='📤 Санах руу илгээх';
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
  function unlockWs(){ if(pollT){clearInterval(pollT);pollT=null;} var o=document.getElementById('wsLock'); if(o)o.parentNode.removeChild(o); var sh=document.getElementById('sheet'); if(sh){sh.style.filter='';sh.style.pointerEvents='';} }
  function showLock(){
    var sh=document.getElementById('sheet'); if(sh){sh.style.filter='blur(6px)';sh.style.pointerEvents='none';}
    var pb=document.querySelector('.bar .btn:not(.refresh)'); // хэвлэх товч (эхнийх refresh)
    var o=document.createElement('div');o.id='wsLock';
    o.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(20,15,40,.62);display:grid;place-items:center;padding:16px;font-family:"Segoe UI",Arial,sans-serif';
    o.innerHTML='<div style="background:#fff;border-radius:20px;max-width:430px;width:100%;padding:24px;text-align:center;box-shadow:0 24px 60px -18px rgba(0,0,0,.5)">'
      +'<div style="font-size:2.6rem;line-height:1">🔒</div>'
      +'<h3 style="color:#5a32d6;font-size:1.25rem;font-weight:900;margin:6px 0 2px">Ажлын хуудсын эрх</h3>'
      +'<p style="color:#7a7390;font-size:.9rem;margin-bottom:12px">Бүх ажлын хуудсыг <b>бүтэн жил</b> хязгааргүй ашиглах</p>'
      +'<div style="font-size:1.8rem;font-weight:900;color:#16a34a;margin-bottom:14px">39,900₮ <span style="font-size:.9rem;color:#7a7390;font-weight:700">/ жил</span></div>'
      +'<input id="wsEmail" type="email" placeholder="Имэйл хаяг" style="width:100%;border:1.6px solid #e7ddff;border-radius:12px;padding:.7rem .9rem;font-size:.95rem;outline:none;margin-bottom:10px" />'
      +'<button id="wsBuy" style="width:100%;font-weight:800;border:0;cursor:pointer;border-radius:999px;padding:.75rem;font-size:.95rem;color:#fff;background:linear-gradient(135deg,#7B52EE,#A855F7)">QPay-аар худалдан авах</button>'
      +'<div id="wsQr" style="margin-top:14px"></div>'
      +'<div id="wsMsg" style="font-size:.84rem;color:#7a7390;margin-top:10px;min-height:1em"></div>'
      +'<a id="wsRestore" href="#" style="display:inline-block;margin-top:10px;font-size:.82rem;color:#5a32d6;font-weight:700;text-decoration:none">Эрхээ сэргээх (имэйлээр)</a>'
      +'</div>';
    document.body.appendChild(o);
    if(pb)pb.style.display='none';
    var em=o.querySelector('#wsEmail'); if(ls('cm_last_user'))em.value=ls('cm_last_user');
    var msg=o.querySelector('#wsMsg'),qr=o.querySelector('#wsQr');
    function valid(e){return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);}
    o.querySelector('#wsBuy').onclick=function(){
      var email=(em.value||'').trim().toLowerCase();
      if(!valid(email)){msg.textContent='Зөв имэйл хаяг оруулна уу';return;}
      this.disabled=true;this.textContent='⏳ Нэхэмжлэх үүсгэж байна...';var btn=this;
      fetch('/api/qpay?action=create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,amount:WS_PRICE,plan:'wsyear'})})
        .then(function(r){return r.json();}).then(function(d){
          var inv=d&&d.invoice;
          if(!inv||!inv.invoice_id){msg.textContent='Нэхэмжлэх үүсгэж чадсангүй. Дахин оролдоно уу.';btn.disabled=false;btn.textContent='QPay-аар худалдан авах';return;}
          var img=inv.qr_image?('<img src="data:image/png;base64,'+inv.qr_image+'" style="width:190px;height:190px" alt="QPay QR"/>'):'';
          var link=inv.qPay_shortUrl?('<div style="margin-top:8px"><a href="'+inv.qPay_shortUrl+'" target="_blank" style="color:#5a32d6;font-weight:700;font-size:.85rem">📱 Утаснаас төлөх</a></div>'):'';
          qr.innerHTML='<div style="font-size:.82rem;color:#7a7390;margin-bottom:6px">QPay аппаар уншуулж төлнө үү</div>'+img+link;
          btn.style.display='none';em.disabled=true;
          msg.textContent='Төлбөрийг хүлээж байна…';
          pollT=setInterval(function(){
            fetch('/api/qpay?action=check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invoice_id:inv.invoice_id,email:email,plan:'wsyear'})})
              .then(function(r){return r.json();}).then(function(c){
                if(c&&c.paid){ if(c.ws_token)lset('cm_ws_token',c.ws_token); lset('cm_last_user',email); msg.textContent='✅ Амжилттай! Нээгдэж байна…'; setTimeout(unlockWs,700); }
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
  function enforcePaywall(){ checkAccess().then(function(ok){ if(!ok)showLock(); }); }

  function init(){ if(!IS_QR)addBtn(); applyQR(); enforcePaywall(); }
  if(document.readyState!=='loading')init();
  else document.addEventListener('DOMContentLoaded',init);
})();
