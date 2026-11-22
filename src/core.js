export const STATUSES = Object.freeze(['queued','running','passed','failed','blocked']);
export function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('event must be object');
  for (const key of ['taskId','agentId','status']) {
    if (typeof event[key] !== 'string' || !event[key].trim() || event[key].length > 128) throw new Error(`invalid ${key}`);
  }
  if (!STATUSES.includes(event.status)) throw new Error('invalid status');
  return {taskId:event.taskId,agentId:event.agentId,status:event.status,at:new Date().toISOString()};
}
export class TaskRegistry {
  #events = [];
  add(event) {const normalized=validateEvent(event);this.#events.push(normalized);return normalized;}
  list() {return this.#events.map(e=>({...e}));}
  summary() {const latest=new Map();for(const e of this.#events)latest.set(e.taskId,e);return [...latest.values()].map(e=>({...e}));}
}
export function skillObservation({skill,problem,proposal}) {
  for(const value of [skill,problem,proposal]) if(typeof value!=='string'||!value.trim()||value.length>2000) throw new Error('invalid observation');
  return {skill,problem,proposal,approval:'pending'};
}
