// Дасгалын хуудсуудад нийтлэг — хэвлэсэн/үүсгэсэн багцыг серверт санах.
// Хуудас build() дотроо window.WS_ITEMS=[{q,a},...]; window.WS_TITLE='...'; гэж тавина.
(function(){
  window.wsSaveCurrent=function(btn){
    var items=window.WS_ITEMS||[];
    if(!items.length){alert('Хадгалах бодлого алга. Эхлээд "Шинэ бодлого" дарна уу.');return;}
    var title=window.WS_TITLE||document.title||'Дасгал';
    if(btn){btn.disabled=true;var ot=btn.textContent;btn.textContent='⏳ Хадгалж байна...';}
    fetch('/api/worksheets',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'save',title:title,items:items})})
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
    b.textContent='💾 Хадгалах';
    b.onclick=function(){window.wsSaveCurrent(b);};
    bar.appendChild(b);
  }
  if(document.readyState!=='loading')addBtn();
  else document.addEventListener('DOMContentLoaded',addBtn);
})();
