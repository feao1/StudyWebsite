/* Typeset explicit LaTeX and AsciiMath delimiters; never interpret imported HTML. */
window.MathJax = {loader:{load:['input/asciimath','ui/safe']},tex:{inlineMath:[['\\(','\\)']],displayMath:[['\\[','\\]']]},options:{enableMenu:false},startup:{ready(){MathJax.startup.defaultReady();MathJax.startup.promise.then(queueMath);}}};
let mathBusy=false, mathPending=false;
function queueMath(){
  if(!window.MathJax?.typesetPromise)return;
  if(mathBusy){mathPending=true;return;}
  mathBusy=true;
  Promise.resolve().then(()=>MathJax.typesetPromise([app])).catch(()=>{}).finally(()=>{mathBusy=false;if(mathPending){mathPending=false;queueMath();}});
}
new MutationObserver(records=>{if(records.some(r=>r.target===app)) {window.MathJax?.typesetClear?.();queueMath();}}).observe(app,{childList:true});
