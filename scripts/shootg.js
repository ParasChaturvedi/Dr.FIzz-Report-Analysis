const puppeteer=require("puppeteer-core");const fs=require("fs");
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
  const p=await b.newPage();await p.setViewport({width:1280,height:720,deviceScaleFactor:2});
  await p.goto("http://localhost:3100/report/preview-real",{waitUntil:"networkidle0",timeout:60000});
  await p.waitForSelector(".df-deck .slide",{timeout:30000});await new Promise(r=>setTimeout(r,1800));
  const s=await p.$$(".df-deck .slide");
  for(const i of [3,5,12,23]){await s[i-1].screenshot({path:`/tmp/g-${i}.png`});}
  console.log("shot");await b.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
