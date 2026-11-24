import {memoryPolicy} from './policy.js';

export function claudeMemBridge(record, {env=process.env}={}) {
  const checked=memoryPolicy(record);
  if (!checked.allowed) return {enabled:false,reason:checked.reason};
  if (env.HAK_CLAUDE_MEM_ENABLED !== 'true') return {enabled:false,reason:'Claude-Mem disabled'};
  return {enabled:true,projectId:checked.projectId,summary:checked.summary,mode:'reviewed-export-only'};
}
