/* General study modes, independent of the preserved SAT examination engine. */
const STUDY_MODES = {
  flashcards: ['Flashcards', 'Flip cards, shuffle, and sort into know or still learning.'],
  learn: ['Learn', 'Start with choices, then recall each answer in writing. Missed items repeat.'],
  test: ['Test', 'A mixed test with written, multiple-choice, and true-or-false questions.'],
  write: ['Write', 'Type each answer. Repeat missed items until you get them right.'],
  spell: ['Spell', 'Listen to the answer, then type what you hear.'],
  match: ['Match', 'Pair every term with its definition against the clock.'],
  blast: ['Blast', 'Choose the matching answer. Score as many as you can in 60 seconds.'],
  blocks: ['Blocks', 'Answer questions to earn pieces. Fill rows and columns on the board.']
};
let study = null;
let studyClock = null;
function shuffled(items) { const result = [...items]; for (let i=result.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1)); [result[i],result[j]]=[result[j],result[i]];} return result; }
function studyCards(set) { return set.questions.map(q => ({id:q.id,front:q.prompt,back:isText(q)?q.acceptedAnswers[0]:q.choices.find(c=>c.id===q.correctChoiceID).text,accepted:isText(q)?q.acceptedAnswers:[q.choices.find(c=>c.id===q.correctChoiceID).text],passage:q.passage||'',explanation:q.explanation||''})); }
function matchesCard(card, answer) { const clean = text => {const s=String(text).replace(/`/g,'').normalize('NFKC').trim();return study.prefs.grading==='exact'?s:s.replace(/\s+/g,'').toLocaleLowerCase();}; return !!clean(answer) && card.accepted.some(value=>clean(value)===clean(answer) || (study.mode!=='spell' && EquivalentMath.equivalent(value,answer))); }
function studyModeRows() { return `<div class="mode-grid">${Object.entries(STUDY_MODES).map(([key,[name,description]])=>`<button class="mode" data-study-mode="${key}"><strong>${name}</strong><small>${description}</small></button>`).join('')}</div>`; }
function startStudy(mode) {
  if(!pendingSet||isSATSet(pendingSet.pack,pendingSet.set)||!STUDY_MODES[mode])return;
  clearInterval(studyClock);
  const {pack,set}=pendingSet;
  const prefs=setPrefs(set);
  let cards=studyCards(set).filter(c=>!prefs.starredOnly||stars(set).includes(c.id));
  if(!cards.length)return toast('Star at least one term, or turn off Starred only.');
  if(prefs.direction==='term')cards=cards.map(c=>({...c,front:c.back,back:c.front,accepted:[c.front]}));
  study={mode,pack,set,cards,order:shuffled(cards),index:0,flipped:false,reverse:false,known:[],queue:shuffled(cards.map(c=>c.id)),levels:{},answers:{},feedback:null,attempts:0,right:0,started:Date.now(),score:0,done:false};
  study.prefs=prefs;study.order=prefs.shuffle?shuffled(cards):[...cards];study.queue=study.order.map(c=>c.id);
  if(mode==='match') {study.round=0;study.matched=[];makeMatchRound();}
  if(mode==='blast') {study.deadline=Date.now()+60000;newStudyQuestion();}
  if(mode==='blocks') {study.board=Array(36).fill(false);study.pieces=[];study.pieceIndex=0;newStudyQuestion();}
  if(mode==='test') study.test=study.order.slice(0,Number(prefs.limit)).map((card,i)=>makeTestItem(card,i));
  route='study'; renderStudy();
  if(mode==='match'||mode==='blast') studyClock=setInterval(()=>{
    if(route!=='study'||!study||study.done){clearInterval(studyClock);return;}
    if(mode==='blast'&&Date.now()>=study.deadline){finishStudyGame();return;}
    const timer=document.querySelector('#study-clock'); if(timer)timer.textContent=mode==='blast'?`${Math.max(0,Math.ceil((study.deadline-Date.now())/1000))} seconds left`:`${((Date.now()-study.started)/1000).toFixed(1)} seconds`;
  },100);
}
function makeMatchRound() {
  const batch=study.order.slice(study.round*6,study.round*6+6);
  study.tiles=shuffled(batch.flatMap(card=>[{id:card.id,side:'term',text:card.front},{id:card.id,side:'definition',text:card.back}]));study.selectedTile=null;study.matchMessage='';
}
function choiceAnswers(card) {return shuffled([card.back,...shuffled([...new Set(study.cards.map(c=>c.back))].filter(value=>value!==card.back)).slice(0,3)]);}
function makeTestItem(card,index) {
  if(study.prefs.testType!=='mixed')index={written:0,choice:1,boolean:2}[study.prefs.testType];
  if(index%3===0||study.cards.length<2) return {card,type:'written'};
  if(index%3===1) return {card,type:'choice',options:choiceAnswers(card)};
  const different=study.cards.filter(c=>c.back!==card.back);const truth=!different.length||Math.random()<.5;
  return {card,type:'boolean',statement:truth?card.back:shuffled(different)[0].back,answer:truth?'True':'False'};
}
function newStudyQuestion(){study.current=study.order[study.index%study.order.length];study.options=choiceAnswers(study.current);study.feedback=null;}
function studyHeader(){return `<header class="exam-header"><button data-study="exit">Back to modes</button><div><div class="exam-title">${esc(study.set.title)}</div><div class="exam-subtitle">${STUDY_MODES[study.mode][0]}</div></div>${['match','blast'].includes(study.mode)?`<span class="timer" id="study-clock">${study.mode==='blast'?'60 seconds left':'0.0 seconds'}</span>`:''}</header>`;}
function renderStudy(){
  if(!study)return;
  let body='';
  if(study.done) body=studySummary();
  else if(study.mode==='flashcards')body=flashcardView();
  else if(study.mode==='test')body=testView();
  else if(study.mode==='match')body=matchView();
  else if(study.mode==='blast')body=blastView();
  else if(study.mode==='blocks')body=blocksView();
  else body=recallView();
  app.innerHTML=`<div class="exam">${studyHeader()}<main class="study-content">${body}</main></div>`;
}
function flashcardView(){
  const c=study.order[study.index];const front=study.reverse?c.back:c.front,back=study.reverse?c.front:c.back;
  return `<div class="study-toolbar"><span>Card ${study.index+1} / ${study.order.length} · ${study.order.filter(c=>study.known.includes(c.id)).length} known</span><div><button data-study="shuffle">Shuffle</button> <button data-study="reverse">${study.reverse?'Definitions first':'Terms first'}</button></div></div>
  <button class="flashcard" data-study="flip" aria-label="Flip card"><small>${study.flipped?'Answer':'Prompt'} · Select to flip</small><span>${esc(study.flipped?back:front)}</span></button>
  <div class="study-toolbar"><button data-study="card-prev" ${study.index===0?'disabled':''}>Previous</button><button data-study="speak">Read aloud</button><button data-study="card-next" ${study.index===study.order.length-1?'disabled':''}>Next</button></div>
  <div class="study-toolbar"><button data-study="learning">Still learning</button><button class="primary" data-study="known">Know this</button><button data-study="review-missed" ${study.cards.every(c=>study.known.includes(c.id))?'disabled':''}>Review still learning</button></div><p class="study-note">Use Space to flip, and the left / right arrows to move through cards.</p>`;
}
function recallView(){
  if(!study.queue.length){study.done=true;return studySummary();}
  const c=study.cards.find(c=>c.id===study.queue[0]);const level=study.levels[c.id]||0;
  if(!study.current||study.current.id!==c.id||study.questionLevel!==level){study.current=c;study.questionLevel=level;study.options=choiceAnswers(c);}
  const choices=study.mode==='learn'&&study.prefs.learnType!=='written'&&(study.prefs.learnType==='choice'||level===0)&&study.options.length>1;
  return `<div class="study-toolbar"><span>${study.cards.length-study.queue.length} / ${study.cards.length} completed</span><span>${study.attempts} attempts</span></div><h1>${study.mode==='spell'?'Listen and spell.':study.mode==='learn'?'Recall the answer.':'Write the answer.'}</h1>
  ${study.mode==='spell'?`<button data-study="speak" class="primary">Play answer</button><p class="study-note">Uses your browser’s speech voice. Replay as often as needed.</p>`:`<p class="recall-prompt">${esc(c.front)}</p>${c.passage?`<p class="study-passage">${esc(c.passage)}</p>`:''}`}
  ${study.feedback?`<div class="feedback" role="status"><strong>${study.feedback.ok?'Correct.':'Not quite.'}</strong><p>Answer: ${esc(c.back)}</p>${c.explanation?`<p>${esc(c.explanation)}</p>`:''}</div><button class="primary" data-study="recall-next">Continue</button>`:choices?`<div class="study-options">${study.options.map((text,i)=>`<button class="choice" data-study="recall-choice" data-option="${i}">${esc(text)}</button>`).join('')}</div>`:`<form id="recall-form"><label class="label" for="recall-answer">Your answer</label><input id="recall-answer" class="text-answer" autocomplete="off" required><button class="primary" type="submit">Check answer</button></form>`}`;
}
function testView(){return `<h1>Test your recall.</h1><p>${study.test.length} questions. Answers appear after submission.</p><form id="study-test">${study.test.map((item,i)=>`<fieldset class="test-question"><legend>${i+1}. ${esc(item.card.front)}</legend>${item.type==='written'?`<label for="test-${i}">Your answer</label><input class="text-answer" id="test-${i}" name="q${i}" value="${esc(study.answers[i]||'')}" autocomplete="off">`:item.type==='boolean'?`<p>${esc(item.statement)}</p>${['True','False'].map(value=>testRadio(i,value)).join('')}`:item.options.map(value=>testRadio(i,value)).join('')}</fieldset>`).join('')}<button class="primary" type="submit">Finish & review</button></form>`;}
function testRadio(index,value){return `<label class="test-option"><input type="radio" name="q${index}" value="${esc(value)}" ${study.answers[index]===value?'checked':''}> ${esc(value)}</label>`;}
function matchView(){return `<h1>Match the pairs.</h1><p>Choose a term and its definition. ${study.matched.length} / ${study.cards.length} pairs matched.</p><div class="match-grid">${study.tiles.map((tile,i)=>`<button class="match-tile ${study.selectedTile===i?'selected':''}" data-study="tile" data-tile="${i}" ${study.matched.includes(tile.id)?'disabled':''}><small>${tile.side}</small>${study.matched.includes(tile.id)?'Matched':esc(tile.text)}</button>`).join('')}</div><p role="status" class="study-note">${esc(study.matchMessage||'Select two matching tiles.')}</p>`;}
function blastView(){return `<div class="study-toolbar"><span>${study.score} points</span><span>${study.right} correct / ${study.attempts} attempts</span></div><h1>Blast</h1><p class="recall-prompt">${esc(study.current.front)}</p><p>Choose the matching answer before the minute ends.</p><div class="blast-field">${study.options.map((value,i)=>`<button class="blast-target" data-study="blast-answer" data-option="${i}" style="--drift:${i%2?1:-1};animation-delay:-${i}s">${esc(value)}</button>`).join('')}</div><p role="status">${esc(study.blastMessage||'Correct answers earn 10 points; incorrect answers lose 5.')}</p>`;}
const BLOCK_SHAPES=[[[0,0]],[[0,0],[0,1]],[[0,0],[1,0]],[[0,0],[0,1],[1,0]],[[0,0],[0,1],[1,0],[1,1]],[[0,0],[0,1],[0,2]]];
function blocksView(){return `<div class="study-toolbar"><span>${study.score} points</span><span>${study.right} questions correct</span><button data-study="end-game">End game</button></div><h1>Blocks</h1><p>Answer to earn three pieces. Select a piece, then its top-left position on the board. Full rows and columns clear.</p><div class="blocks-layout"><div class="blocks-grid" role="group" aria-label="Block board">${study.board.map((filled,i)=>`<button class="block-cell ${filled?'filled':''}" data-study="place" data-cell="${i}" aria-label="Row ${Math.floor(i/6)+1}, column ${i%6+1}${filled?', filled':''}" ${filled||!study.pieces.length?'disabled':''}></button>`).join('')}</div><div>${study.pieces.length?`<h2>Select a piece</h2><div class="pieces">${study.pieces.map((piece,i)=>`<button class="piece ${i===study.pieceIndex?'selected':''}" data-study="piece" data-piece="${i}" aria-label="Piece ${i+1}: ${piece.length} cells"><span class="piece-grid">${Array.from({length:9},(_,j)=>`<span class="${piece.some(([r,c])=>r===Math.floor(j/3)&&c===j%3)?'filled':''}"></span>`).join('')}</span></button>`).join('')}</div>`:`<p class="recall-prompt">${esc(study.current.front)}</p>${study.options.map((value,i)=>`<button class="choice" data-study="blocks-answer" data-option="${i}">${esc(value)}</button>`).join('')}`}<p role="status">${esc(study.blockMessage||'')}</p></div></div>`;}
function canPlace(piece,index){const r=Math.floor(index/6),c=index%6;return piece.every(([dr,dc])=>r+dr<6&&c+dc<6&&!study.board[(r+dr)*6+c+dc]);}
function placePiece(index){
  if(!study.pieces.length)return;
  const piece=study.pieces[study.pieceIndex];
  if(!canPlace(piece,index)){study.blockMessage='That piece does not fit there.';renderStudy();return;}
  piece.forEach(([dr,dc])=>study.board[(Math.floor(index/6)+dr)*6+index%6+dc]=true);
  study.score+=piece.length;study.pieces.splice(study.pieceIndex,1);study.pieceIndex=0;
  const clear=new Set();for(let r=0;r<6;r++)if(Array.from({length:6},(_,c)=>study.board[r*6+c]).every(Boolean))for(let c=0;c<6;c++)clear.add(r*6+c);
  for(let c=0;c<6;c++)if(Array.from({length:6},(_,r)=>study.board[r*6+c]).every(Boolean))for(let r=0;r<6;r++)clear.add(r*6+c);
  clear.forEach(i=>study.board[i]=false);study.score+=clear.size*2;study.blockMessage=clear.size?`${clear.size} cells cleared.`:'Piece placed.';
  if(!study.pieces.length){study.index++;newStudyQuestion();}
  else if(!study.pieces.some(piece=>study.board.some((_,i)=>canPlace(piece,i)))){finishStudyGame();return;}
  renderStudy();
}
function finishStudyGame(){study.done=true;study.elapsed=(Date.now()-study.started)/1000;clearInterval(studyClock);renderStudy();}
function studySummary(){
  if(study.mode==='test')return `<h1>Review your answers.</h1><div class="score">${study.right} / ${study.test.length}<small>correct</small></div><section class="section">${study.test.map((item,i)=>`<details class="review-question"><summary>${study.testResults[i]?'Correct':'Incorrect'} · ${i+1}. ${esc(item.card.front)}</summary><div class="review-detail"><p>Your answer: ${esc(study.answers[i]||'Not answered')}</p><p>Correct answer: ${esc(item.type==='boolean'?item.answer:item.card.back)}</p>${item.card.explanation?`<p>${esc(item.card.explanation)}</p>`:''}</div></details>`).join('')}</section><button data-study="restart" class="primary">Try another test</button>`;
  if(study.mode==='match')return `<h1>All pairs matched.</h1><div class="score">${study.elapsed.toFixed(1)}<small>seconds · ${study.cards.length} pairs</small></div><button data-study="restart">Play again</button>`;
  if(['blast','blocks'].includes(study.mode))return `<h1>${study.mode==='blast'?'Time is up.':'Game complete.'}</h1><div class="score">${study.score}<small>points · ${study.right} correct / ${study.attempts} attempts</small></div><button data-study="restart">Play again</button>`;
  return `<h1>Set complete.</h1><p>${study.cards.length} items completed in ${study.attempts} attempts.</p><button data-study="restart" class="primary">Practice again</button>`;
}
function gradeRecall(value){const c=study.current;const ok=matchesCard(c,value);study.attempts++;if(ok)study.right++;study.feedback={ok};renderStudy();document.querySelector('[data-study="recall-next"]')?.focus();}
function speakStudy(){if(!('speechSynthesis' in window)){toast('Speech is not available in this browser. Use Write mode instead.');return;}const c=study.mode==='flashcards'?study.order[study.index]:study.current;const value=study.mode==='spell'?c.back:study.mode==='flashcards'?(study.flipped!==study.reverse?c.back:c.front):c.front;window.speechSynthesis.cancel();window.speechSynthesis.speak(new SpeechSynthesisUtterance(value));}
app.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.studyMode){startStudy(button.dataset.studyMode);return;}
 const action=button.dataset.study;if(!action||!study)return;
 if(action==='exit'){clearInterval(studyClock);window.speechSynthesis?.cancel();route='mode';pendingSet={pack:study.pack,set:study.set};study=null;render();return;}
 if(action==='restart'){pendingSet={pack:study.pack,set:study.set};startStudy(study.mode);return;}
 if(action==='flip')study.flipped=!study.flipped;
 if(action==='reverse'){study.reverse=!study.reverse;study.flipped=false;}
 if(action==='shuffle'){study.order=shuffled(study.order);study.index=0;study.flipped=false;}
 if(action==='card-prev'){study.index=Math.max(0,study.index-1);study.flipped=false;}
 if(action==='card-next'){study.index=Math.min(study.order.length-1,study.index+1);study.flipped=false;}
 if(action==='known'||action==='learning'){const id=study.order[study.index].id;study.known=study.known.filter(value=>value!==id);if(action==='known')study.known.push(id);if(study.index<study.order.length-1)study.index++;study.flipped=false;}
 if(action==='review-missed'){study.order=study.cards.filter(c=>!study.known.includes(c.id));study.index=0;study.flipped=false;}
 if(action==='speak'){speakStudy();return;}
 if(action==='recall-choice'){gradeRecall(study.options[Number(button.dataset.option)]);return;}
 if(action==='recall-next'){
   const id=study.queue.shift();const ok=study.feedback.ok;
   if(ok)study.levels[id]=(study.levels[id]||0)+1;
   else study.levels[id]=Math.max(0,(study.levels[id]||0)-1);
   if(!ok||(study.mode==='learn'&&study.levels[id]<2))study.queue.push(id);
   study.feedback=null;study.current=null;
 }
 if(action==='tile'){
   const index=Number(button.dataset.tile),tile=study.tiles[index];
   if(study.selectedTile===null){study.selectedTile=index;study.matchMessage='Now choose its matching term or definition.';}
   else if(study.selectedTile===index)study.selectedTile=null;
   else {const first=study.tiles[study.selectedTile];if(first.side!==tile.side&&(first.id===tile.id||study.cards.find(c=>c.id===first.id).back===study.cards.find(c=>c.id===tile.id).back)){
     // Pair IDs remain stable even when definitions repeat.
     const a=first.id,b=tile.id;if(a!==b){const other=study.tiles.find(t=>t.id===b&&t.side===first.side);const partner=study.tiles.find(t=>t.id===a&&t.side===tile.side);if(other&&partner){other.id=a;first.id=b;}}
     study.matched.push(tile.id);study.matchMessage='Matched.';
   }else study.matchMessage='Those do not match. Try again.';study.selectedTile=null;
   if(study.tiles.every(t=>study.matched.includes(t.id))){if(study.matched.length===study.cards.length){finishStudyGame();return;}study.round++;makeMatchRound();}}
 }
 if(action==='blast-answer'||action==='blocks-answer'){
   const ok=study.options[Number(button.dataset.option)]===study.current.back;study.attempts++;if(ok)study.right++;
   if(action==='blast-answer'){if(Date.now()>=study.deadline){finishStudyGame();return;}study.score=Math.max(0,study.score+(ok?10:-5));study.blastMessage=ok?'Correct.':`Answer: ${study.current.back}`;study.index++;newStudyQuestion();}
   else if(ok){study.pieces=Array.from({length:3},()=>BLOCK_SHAPES[Math.floor(Math.random()*BLOCK_SHAPES.length)]);study.blockMessage='Correct. Place your pieces.';if(!study.pieces.some(piece=>study.board.some((_,i)=>canPlace(piece,i)))){finishStudyGame();return;}}
   else {study.blockMessage=`Answer: ${study.current.back}. Try the next question.`;study.index++;newStudyQuestion();}
 }
 if(action==='piece')study.pieceIndex=Number(button.dataset.piece);
 if(action==='place'){placePiece(Number(button.dataset.cell));return;}
 if(action==='end-game'){finishStudyGame();return;}
 renderStudy();
});
app.addEventListener('submit',event=>{
 if(event.target.id==='recall-form'){event.preventDefault();gradeRecall(document.querySelector('#recall-answer').value);}
 if(event.target.id==='study-test'){event.preventDefault();const data=new FormData(event.target);study.testResults=study.test.map((item,i)=>{study.answers[i]=String(data.get('q'+i)||'');return item.type==='boolean'?study.answers[i]===item.answer:matchesCard(item.card,study.answers[i]);});study.right=study.testResults.filter(Boolean).length;study.done=true;
 const history=readJSON(STORE.history,[]);history.unshift({id:crypto.randomUUID(),setTitle:study.set.title+' · Test',correct:study.right,total:study.test.length,completedAt:new Date().toISOString()});saveJSON(STORE.history,history.slice(0,100));window.scrollTo(0,0);renderStudy();}
});
document.addEventListener('keydown',event=>{if(route!=='study'||study?.mode!=='flashcards'||/INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName))return;const actions={' ':'flip',ArrowLeft:'card-prev',ArrowRight:'card-next'};if(actions[event.key]){event.preventDefault();document.querySelector(`[data-study="${actions[event.key]}"]`)?.click();}});
