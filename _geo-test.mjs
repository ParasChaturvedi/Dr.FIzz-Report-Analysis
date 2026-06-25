import { chromium } from "playwright";
import fs from "fs";
const ENGINES = { chatgpt:"https://chatgpt.com/", gemini:"https://gemini.google.com/app", copilot:"https://copilot.microsoft.com/" };
const dir = ".geo-sessions";
const sleep = ms => new Promise(r=>setTimeout(r,ms));
for (const [engine,url] of Object.entries(ENGINES)) {
  const f = `${dir}/${engine}.json`;
  if (!fs.existsSync(f)) { console.log(`${engine}: NO session file`); continue; }
  const age = ((Date.now()-fs.statSync(f).mtimeMs)/86400000).toFixed(1);
  let browser, context, result="unknown";
  try {
    browser = await chromium.launch({ channel:"chrome", headless:true, args:["--disable-blink-features=AutomationControlled"] });
    context = await browser.newContext({ storageState:f, locale:"en-US" });
    if (engine==="chatgpt") {
      const r = await context.request.get("https://chatgpt.com/api/auth/session",{timeout:15000});
      const j = await r.json().catch(()=>({}));
      result = (j&&j.user&&(j.user.email||j.user.id)) ? `VALID (as ${j.user.email||j.user.id})` : "EXPIRED (no user)";
    } else {
      const page = await context.newPage();
      await page.goto(url,{waitUntil:"domcontentloaded",timeout:30000}).catch(()=>{});
      await sleep(5000);
      const cta = await page.locator(':is(a,button):has-text("Sign in"), :is(a,button):has-text("Log in"), :is(a,button):has-text("Sign up")').count().catch(()=>0);
      const composer = await page.locator('textarea, [contenteditable="true"], div[role="textbox"]').count().catch(()=>0);
      result = (composer>0&&cta===0) ? "VALID (composer present, no login CTA)" : `UNCERTAIN/EXPIRED (composer=${composer}, loginCTA=${cta})`;
    }
  } catch(e){ result="ERROR: "+(e?.message||e); }
  finally { try{await context?.close();}catch{} try{await browser?.close();}catch{} }
  console.log(`${engine} (session ${age}d old): ${result}`);
}
