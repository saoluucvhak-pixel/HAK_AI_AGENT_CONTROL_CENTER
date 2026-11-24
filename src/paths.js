import {resolve,join} from 'node:path';
/** Single source of truth for user-data locations. Installed builds set HAK_DATA_DIR (e.g. %LOCALAPPDATA%\HAK\AI_AGENT_CONTROL_CENTER). */
export function dataDir(env=process.env){return resolve(env.HAK_DATA_DIR||'./data');}
export function dataPath(env,...parts){return join(dataDir(env),...parts);}
