const { chromium } = require('playwright');
require('fs').mkdirSync(require('path').join(__dirname,'out'),{recursive:true});
(async()=>{
  const b=await chromium.launch(); const errs=new Set(); const ends={};
  for(let run=0;run<12;run++){
    const p=await b.newPage({viewport:run%2?{width:390,height:844}:{width:1280,height:900}});
    p.on('pageerror',e=>errs.add(e.message+' '+(e.stack||'').split('\n')[1]));
    await p.goto('file://'+require('path').join(__dirname,'..','index.html'));
    const r=await p.evaluate(()=>{
      for(let i=0;i<2500;i++){
        if(S.over&&!UI.setup)return S.over.grade;
        let els=[...document.querySelectorAll('#overlay:not([hidden]) [data-act]:not([disabled])')];
        if(!els.length)els=[...document.querySelectorAll('[data-act]:not([disabled]),[data-node],[data-edge]')].filter(e=>!['new','restart','prefreport'].includes(e.dataset.act));
        const el=els[Math.floor(Math.random()*els.length)];
        el.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        if(i%97===0)document.dispatchEvent(new KeyboardEvent('keydown',{key:['e','u','Escape','?','+','-'][i%6],bubbles:true}));
      }
      return 'running t'+S.turn;
    });
    ends[r]=(ends[r]||0)+1;await p.close();
  }
  console.log(JSON.stringify({ends,errs:[...errs]}));
  // screenshots
  for(const [w,h,tag] of [[1280,900,'d'],[390,844,'m']]){
    const p=await b.newPage({viewport:{width:w,height:h}});p.on('pageerror',e=>errs.add(e.message));
    await p.goto('file://'+require('path').join(__dirname,'..','index.html'));
    await p.screenshot({path:`${__dirname}/out/s-${tag}0-setup.png`});
    await p.click('#startbtn');
    await p.screenshot({path:`${__dirname}/out/s-${tag}1-brief.png`});
    await p.evaluate(()=>{decide(0);render();});
    for(let t=0;t<7;t++){await p.evaluate((t)=>{while(S.events.length)decide(0);UI.showReport=false;if(t===1){orderEvac('brennan');orderMove('aldermoor','cedar',3);}endTurn();while(S.events.length)decide(0);UI.showReport=false;render();},t);}
    await p.screenshot({path:`${__dirname}/out/s-${tag}2-mid.png`,fullPage:tag==='d'});
    await p.evaluate(()=>{UI.sel='ashford';render();});
    await p.screenshot({path:`${__dirname}/out/s-${tag}3-sel.png`});
    const sw=await p.evaluate(()=>document.documentElement.scrollWidth);console.log(tag,'scrollWidth',sw);
    await p.evaluate(()=>{UI.sel=null;for(let t=0;t<30&&!S.over;t++){while(S.events.length)decide(0);UI.showReport=false;endTurn();}while(S.events.length&&!S.over)decide(0);render();});
    await p.screenshot({path:`${__dirname}/out/s-${tag}4-end.png`,fullPage:true});
    await p.close();
  }
  console.log('errs2',[...errs]);
  await b.close();
})();
