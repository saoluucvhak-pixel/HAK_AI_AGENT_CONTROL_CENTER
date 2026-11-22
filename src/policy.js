export const ALLOWED_ROLES = Object.freeze(['orchestrator','coder','reviewer','tester','ocr']);
export function validateTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) throw new TypeError('Invalid task');
  if (!ALLOWED_ROLES.includes(task.role)) throw new Error('Unrecognized role');
  if (typeof task.prompt !== 'string' || !task.prompt.trim() || task.prompt.length > 32000) throw new Error('Invalid prompt');
  if (task.sensitive === true) throw new Error('Sensitive tasks require explicit policy approval');
  return {role:task.role,prompt:task.prompt};
}
export function memoryPolicy(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('Invalid memory record');
  if (record.approved !== true || record.sensitive === true) return {allowed:false,reason:'Memory requires approval and non-sensitive classification'};
  if (typeof record.projectId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(record.projectId)) throw new Error('Invalid project scope');
  if (typeof record.summary !== 'string' || !record.summary.trim() || record.summary.length > 4000) throw new Error('Invalid summary');
  return {allowed:true,projectId:record.projectId,summary:record.summary};
}
