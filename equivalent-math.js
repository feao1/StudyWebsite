/* Bounded real-expression comparison. No user code, assignments or property access. */
const EquivalentMath = (() => {
  const functions = new Set(['sqrt','cbrt','abs','sin','cos','tan','sec','csc','cot','asin','acos','atan','asec','acsc','acot','exp','log']);
  function normalize(value) {
    if(String(value).length>300)throw Error('Expression too long');
    let s=String(value).trim().replace(/`/g,'').replace(/\\[()[\]]/g,'').replace(/\\(?:left|right)/g,'');
    s=s.replace(/[−–]/g,'-').replace(/[×·]/g,'*').replace(/÷/g,'/').replace(/π/g,'pi');
    s=s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g,m=>'^('+[...m].map(c=>'⁰¹²³⁴⁵⁶⁷⁸⁹'.includes(c)?'⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c):'-').join('')+')');
    // Process innermost commands before ordinary grouping braces.
    for(let i=0;i<12;i++) {
      const prev=s;
      s=s.replace(/\\(?:d?frac|tfrac)\{([^{}]*)\}\{([^{}]*)\}/g,'(($1)/($2))').replace(/\\sqrt\{([^{}]*)\}/g,'sqrt($1)').replace(/\^\{([^{}]*)\}/g,'^($1)');
      if(s===prev)break;
    }
    s=s.replace(/[{}]/g,c=>c==='{'?'(':')');
    s=s.replace(/\\(?:cdot|times)/g,'*').replace(/\\pi\b/g,'pi').replace(/\\(sin|cos|tan|sec|csc|cot|ln|log|exp|abs)\b/g,'$1');
    s=s.replace(/\b(arcsin|arccos|arctan|arcsec|arccsc|arccot)\b/g,m=>({arcsin:'asin',arccos:'acos',arctan:'atan',arcsec:'asec',arccsc:'acsc',arccot:'acot'}[m]));
    s=s.replace(/\bln\b/g,'log').replace(/root\(3\)/g,'cbrt').replace(/∛\s*/g,'cbrt').replace(/√\s*/g,'sqrt');
    s=s.replace(/\|([^|]+)\|/g,'abs($1)');
    s=s.replace(/\b(sqrt|cbrt)([a-z]|\d+(?:\.\d+)?)(?![a-z0-9])/g,'$1($2)');
    s=s.replace(/\b(sin|cos|tan|sec|csc|cot)\s*\^\s*(\d+)\s*\(([^()]*)\)/g,'($1($3)^$2)');
    return s;
  }
  function parse(value) {
    const s=normalize(value);if(!s||s.length>300)throw Error('Expression too long');
    const node=math.parse(s), vars=new Set();let count=0;
    node.traverse((n,path,parent)=>{
      if(++count>100)throw Error('Expression too complex');
      if(n.isConstantNode){if(typeof n.value!=='number'||!Number.isFinite(n.value))throw Error('Not a real number');}
      else if(n.isSymbolNode){if(parent?.isFunctionNode&&path==='fn')return;if(['pi','e'].includes(n.name))return;if(!/^[a-zA-Z]$/.test(n.name))throw Error('Unknown variable');vars.add(n.name);}
      else if(n.isFunctionNode){if(!n.fn.isSymbolNode||!functions.has(n.fn.name)||n.args.length!==1)throw Error('Unsupported function');}
      else if(n.isOperatorNode){if(!['+','-','*','/','^'].includes(n.op))throw Error('Unsupported operator');}
      else if(!n.isParenthesisNode)throw Error('Unsupported expression');
    });
    if(vars.size>3)throw Error('Too many variables');
    return {code:node.compile(),vars};
  }
  function numberAt(expr,scope){try {const v=expr.code.evaluate(scope);return typeof v==='number'&&Number.isFinite(v)?v:null;}catch{return null;}}
  function near(a,b){return a===b||Math.abs(a-b)<=1e-10*Math.max(Math.abs(a),Math.abs(b));}
  function equivalent(expected,entered){
    try{
      const a=parse(expected),b=parse(entered);
      if([...b.vars].some(v=>!a.vars.has(v)))return false;
      const vars=[...a.vars];
      if(!vars.length){const x=numberAt(a,{}),y=numberAt(b,{});return x!==null&&y!==null&&near(x,y);}
      // Check both signs, endpoints and a spread of independent values. Require
      // many defined reference values; never accept two undefined expressions.
      const anchors=[0,1,-1,2,-2,.5,-.5,Math.PI/2,-Math.PI/2,Math.PI];
      let checked=0,seed=17431;
      for(let i=0;i<106;i++){
        const scope={};vars.forEach((v,j)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;scope[v]=i<anchors.length?anchors[(i+j)%anchors.length]:(seed/4294967296*2-1)*[.25,1,4,16][i%4];});
        const x=numberAt(a,scope);if(x===null)continue;
        const y=numberAt(b,scope);if(y===null||(!near(x,y)&&Math.abs(x-y)>1e-12))return false;checked++;
      }
      return checked>=16;
    }catch{return false;}
  }
  return {equivalent,normalize};
})();
if(typeof module!=='undefined')module.exports=EquivalentMath;
