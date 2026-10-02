"use strict";
// Runs in the head so the correct palette is applied before the first paint.
(()=>{
  const key="wuriLeagueTheme",system=window.matchMedia?.("(prefers-color-scheme: dark)");
  let preference=null;
  try{const stored=localStorage.getItem(key);if(stored==="light"||stored==="dark")preference=stored}catch{}
  const current=()=>preference||(system?.matches?"dark":"light");
  const apply=()=>{document.documentElement.dataset.theme=current();window.dispatchEvent(new Event("wuri-theme-change"))};
  window.WuriLeagueTheme=Object.freeze({current,set(value){if(value!=="light"&&value!=="dark")return;preference=value;try{localStorage.setItem(key,value)}catch{}apply()}});
  system?.addEventListener("change",()=>{if(!preference)apply()});
  apply();
})();
