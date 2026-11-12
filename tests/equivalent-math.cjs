const assert=require('node:assert/strict');
global.math=require('../vendor/mathjs.js');
const {equivalent:eq}=require('../equivalent-math.js');
const yes=[['1/sqrt(x)','x^(-1/2)'],['1/2','0.5'],['2*x+2','2(x+1)'],['sec(x)^2','1/cos(x)^2'],['sin(x)^2+cos(x)^2','1'],['sqrt(x^2)','abs(x)'],['`3/sqrt(1-9x^2)`','3 / √(1 - 9*x²)'],['1/(1+x^2)','\\frac{1}{1+x^{2}}'],['sqrt(x)','\\sqrt{x}'],['2*x','x+x'],['1/2','2/4'],['sqrtx/2','sqrt(x)/2'],['cos(x)','sin(pi/2-x)']];
const no=[['sqrt(x^2)','x'],['1/sqrt(x)','-1/sqrt(x)'],['2*x','2*y'],['1','x'],['1/3','0.33'],['1e-20','0'],['2','2;3'],['2','import("bad")'],['2','a=2'],['2','[2]'],['word','other'],['1','1/0'],['x','sqrt(x^2)'],['x','x+0.01'],['sin(x)','cos(x)']];
for(const [a,b] of yes)assert.equal(eq(a,b),true,`${a} == ${b}`);
for(const [a,b] of no)assert.equal(eq(a,b),false,`${a} != ${b}`);
console.log(`${yes.length+no.length} equivalence checks passed`);
