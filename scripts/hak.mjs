#!/usr/bin/env node
// Entry point for containers and CI: `hak review|write|publish|serve`. See `hak help`.
import {main} from '../src/cli.js';
const argv=process.argv.slice(2);
if(argv[0]==='serve'){await import('../src/server.js');}
else process.exitCode=await main(argv);
