import {writeFileSync} from 'node:fs';
const required=['GITHUB_REPOSITORY','GITHUB_SHA','GITHUB_RUN_ID','GITHUB_EVENT_NAME','RUNNER_OS'];
for(const name of required){
 if(!process.env[name])throw new Error('Missing GitHub Actions provenance: '+name);
}
if(!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA))throw new Error('Invalid commit SHA');
if(!/^[1-9][0-9]*$/.test(process.env.GITHUB_RUN_ID))throw new Error('Invalid run ID');
const provenance={
 schemaVersion:1,
 kind:'hak-github-ci-provenance',
 repository:process.env.GITHUB_REPOSITORY,
 commitSha:process.env.GITHUB_SHA,
 runId:process.env.GITHUB_RUN_ID,
 event:process.env.GITHUB_EVENT_NAME,
 runnerOS:process.env.RUNNER_OS,
 nodeVersion:process.version,
 notice:'GitHub Actions metadata only; not a cryptographic attestation, provider execution, or production approval'
};
writeFileSync('ci-provenance.json',JSON.stringify(provenance,null,2)+'\n',{flag:'wx'});
