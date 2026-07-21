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
  function init(){ if(!IS_QR)addBtn(); applyQR(); }
  if(document.readyState!=='loading')init();
  else document.addEventListener('DOMContentLoaded',init);
})();
