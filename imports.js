/* Plain-text imports. Source data remains in the existing QPACK schema. */
function parseTextSet(source, filename = 'Study set.txt') {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw new Error('The text file is empty.');
  if (text.length > 1000000) throw new Error('Text files must be smaller than 1 MB.');
  let title = filename.replace(/\.txt$/i, '');
  let body = text;
  if (/^Title:/i.test(body)) { const lines = body.split('\n'); title = lines.shift().slice(6).trim(); body = lines.join('\n').trim(); }
  const questions = [];
  if (!/^Question:/im.test(body)) {
    body.split('\n').filter(line => line.trim()).forEach((line, index) => {
      const parts = line.split('\t');
      if (parts.length !== 2 || parts.some(part => !part.trim())) throw new Error(`Line ${index + 1}: use a term, a tab, and its definition, or download the question template.`);
      questions.push({ id: `q${index+1}`, number: index+1, prompt: parts[0].trim(), answerType: 'textEntry', acceptedAnswers: [parts[1].trim()], explanation: parts[1].trim() });
    });
  } else {
    body.split(/^\s*---\s*$/m).filter(block => block.trim()).forEach((block, index) => {
      const fields = {}; let key;
      for (const line of block.trim().split('\n')) {
        const match = line.match(/^(Question|Passage|Answer|Explanation|[A-D])[.:]\s*(.*)$/i);
        if (match) { key = match[1].toLowerCase(); if (key in fields) throw new Error(`Question ${index+1}: repeated ${key} field.`); fields[key] = match[2]; }
        else if (key) fields[key] += '\n' + line;
        else if (line.trim()) throw new Error(`Question ${index+1}: unrecognized line. Start with Question:.`);
      }
      if (!fields.question?.trim() || !fields.answer?.trim()) throw new Error(`Question ${index+1}: Question and Answer are required.`);
      const choices = ['a','b','c','d'].filter(key => key in fields).map(key => ({id:key.toUpperCase(), text:fields[key].trim()}));
      if (choices.some(c => !c.text) || (choices.length && choices.length < 2)) throw new Error(`Question ${index+1}: provide at least two non-empty choices.`);
      const q = {id:`q${index+1}`, number:index+1, prompt:fields.question.trim(), passage:fields.passage?.trim(), explanation:fields.explanation?.trim()};
      if (choices.length) { q.choices = choices; q.correctChoiceID = fields.answer.trim().toUpperCase(); }
      else { q.answerType = 'textEntry'; q.acceptedAnswers = fields.answer.split('|').map(answer => answer.trim()); }
      questions.push(q);
    });
  }
  const packID = crypto.randomUUID();
  return decodePack('QPACK/1\n' + JSON.stringify({id:packID,title,source:'Text import',sets:[{id:`${packID}-set`,title,questions}]}));
}
async function shareSet(packID, setID) {
  try {
    const pack = packs.find(pack => pack.id === packID);
    const set = pack?.sets.find(set => set.id === setID);
    if (!set) throw new Error('This set could not be found.');
    const url = new URL(location.href); url.hash = ''; url.search = '';
    if (builtinIDs.has(packID)) { url.searchParams.set('pack',packID); url.searchParams.set('set',setID); }
    else {
      const text = JSON.stringify({...pack,sets:[set]});
      const bytes = new TextEncoder().encode(text);
      if (bytes.length > 60000) throw new Error('This set is too large for a share link. Share the original QPACK or text file instead.');
      let binary = ''; bytes.forEach(byte => binary += String.fromCharCode(byte));
      url.hash = 'study=' + btoa(binary);
    }
    try { await navigator.clipboard.writeText(url.href); toast('Set link copied. Anyone with the link can open it.'); }
    catch { window.prompt('Copy this set link:',url.href); }
  } catch (error) { toast(error.message); }
}
async function openSharedSet() {
  try {
    if (location.hash.startsWith('#study=')) {
      const payload = location.hash.slice(7);
      if (payload.length > 85000) throw new Error('This shared set is too large.');
      const text = new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(payload),c=>c.charCodeAt(0)));
      const pack = decodePack('QPACK/1\n'+text);
      // Shared content is transient; never overwrite a saved or included pack.
      pack.id = 'shared-' + crypto.randomUUID();
      packs.push(pack); chooseSet(pack.id,pack.sets[0].id);
    } else {
      const params = new URLSearchParams(location.search);
      if (params.has('pack') && params.has('set')) chooseSet(params.get('pack'),params.get('set'));
    }
  } catch (error) { toast(`Could not open shared set: ${error.message}`); }
}
