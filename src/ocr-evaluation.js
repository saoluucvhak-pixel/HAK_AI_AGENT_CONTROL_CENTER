// Offline OCR evaluation only: consumes approved reference/transcription pairs, never invokes a provider.
function normalize(value){
 if(typeof value!=='string')throw new TypeError('OCR text must be a string');
 return value.normalize('NFC').replace(/\r\n?/g,'\n').trim();
}
function distance(a,b){
 const x=Array.from(a),y=Array.from(b);
 let prev=Array.from({length:y.length+1},(_,i)=>i);
 for(let i=1;i<=x.length;i++){
  const next=[i];
  for(let j=1;j<=y.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));
  prev=next;
 }
 return prev[y.length];
}
export function evaluateOcr(cases,{maxCharacters=20000}={}){
 if(!Array.isArray(cases)||cases.length===0||cases.length>1000)throw new Error('Expected 1..1000 OCR cases');
 let edits=0,characters=0,passed=0;
 const checks=cases.map((item,i)=>{
  if(!item||typeof item!=='object'||item.approved!==true||item.sensitive!==false)throw new Error('Case '+i+' requires approval and explicit non-sensitive classification');
  const expected=normalize(item.expected),actual=normalize(item.actual);
  if(expected.length===0||expected.length>maxCharacters||actual.length>maxCharacters)throw new Error('Invalid OCR case length');
  const errors=distance(expected,actual);
  edits+=errors;characters+=Array.from(expected).length;
  const exact=expected===actual;if(exact)passed++;
  return {index:i+1,exact,editDistance:errors,referenceCharacters:Array.from(expected).length};
 });
 return {schemaVersion:1,kind:'hak-ocr-offline-evaluation',readyForProduction:false,caseCount:checks.length,exactMatches:passed,characterErrorRate:edits/characters,checks,limitations:['Only compares supplied transcriptions; does not run OCR','Requires independently approved representative real documents and human review','No text, document paths, identifiers or image data are exported']};
}
