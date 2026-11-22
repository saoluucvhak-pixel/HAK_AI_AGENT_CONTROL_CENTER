import {readFile} from 'node:fs/promises';
import {evaluateOcr} from './ocr-evaluation.js';
export async function runOcrAcceptance({filePath,threshold='0.02',read=readFile}={}){
 if(typeof filePath!=='string'||!filePath.trim())throw new Error('A local approved dataset path is required');
 if(typeof threshold!=='string'||! /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(threshold))throw new Error('Threshold must be a decimal between 0 and 1');
 const limit=Number(threshold);
 const raw=await read(filePath,'utf8');
 if(raw.length>300000)throw new Error('Dataset exceeds 300000 characters');
 const parsed=JSON.parse(raw);
 const evaluation=evaluateOcr(parsed);
 const passed=evaluation.characterErrorRate<=limit;
 return {schemaVersion:1,kind:'hak-ocr-local-acceptance',passed,readyForProduction:false,threshold:limit,caseCount:evaluation.caseCount,exactMatches:evaluation.exactMatches,characterErrorRate:evaluation.characterErrorRate,limitations:['Evaluates supplied OCR transcriptions only; does not execute an OCR engine','A pass is not production sign-off','Dataset contents and paths are never included in output']};
}
