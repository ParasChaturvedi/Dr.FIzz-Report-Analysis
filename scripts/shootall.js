const puppeteer=require("puppeteer-core");const fs=require("fs");
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";const OUT="/tmp/qa";
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});for(const f of fs.readdirSync(OUT))fs.unlinkSync(`${OUT}/${f}`);
  const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
  const p=await b.newPage();await p.setViewport({width:1280,height:720,deviceScaleFactor:2});
  const errs=[];p.on("pageerror",e=>errs.push(e.message));p.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
  await p.goto("http://localhost:3100/report/preview",{waitUntil:"networkidle0",timeout:60000});
  await p.waitForSelector(".df-deck .slide",{timeout:30000});await new Promise(r=>setTimeout(r,2500));
  const s=await p.$$(".df-deck .slide");
  const ov=await p.evaluate(()=>{const o=[];document.querySelectorAll(".df-deck .slide").forEach((s,i)=>{const h=s.querySelector(".head"),c=s.querySelector(".content"),f=s.querySelector(".foot");let bad=false,d="";if(h&&c){const fc=c.querySelector(".content-fit")?.firstElementChild||c.firstElementChild;if(fc&&fc.getBoundingClientRect().top<h.getBoundingClientRect().bottom-2){bad=true;d="content over head"}}if(f&&c){const lc=c.querySelector(".content-fit")?.lastElementChild||c.lastElementChild;if(lc&&lc.getBoundingClientRect().bottom>f.getBoundingClientRect().top+2){bad=true;d+=" content over foot"}}if(bad)o.push({slide:i+1,d});});return o;});
  for(let i=0;i<s.length;i++)await s[i].screenshot({path:`${OUT}/s-${String(i+1).padStart(2,"0")}.png`});
  console.log("slides:",s.length,"| console errors:",errs.length,errs.slice(0,3).join(" | "));
  console.log("overlap:",ov.length?JSON.stringify(ov):"NONE");
  await b.close();
})().catch(e=>{console.error("FAIL",e.message);process.exit(1)});
