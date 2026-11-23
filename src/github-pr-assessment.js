export function assessGithubPrEvidence(evidence){
 if(!evidence||evidence.kind!=='hak-github-pr-ci-evidence'||!Array.isArray(evidence.checks)||typeof evidence.headSha!=='string')throw new Error('Invalid GitHub PR evidence');
 const checks=evidence.checks;
 const failures=checks.filter(c=>c.conclusion==='failure'||c.conclusion==='timed_out'||c.conclusion==='cancelled'||c.conclusion==='action_required');
 const pending=checks.filter(c=>c.status!=='completed'||c.conclusion==null);
 const warnings=[];
 if(evidence.prState!=='open')warnings.push('PR is not open');
 if(evidence.draft)warnings.push('PR is draft');
 if(evidence.commitListTruncated)warnings.push('Commit listing was truncated at 100');
 if(checks.length===0)warnings.push('No GitHub check runs returned');
 const status=failures.length?'ci-failed':pending.length?'ci-pending':checks.length===0?'ci-missing':checks.every(c=>c.conclusion==='success')?'ci-passed':'ci-inconclusive';
 const actions=status==='ci-failed'?['Inspect failing GitHub Actions logs','Create a fix on the PR branch and rerun CI']:status==='ci-pending'?['Wait for CI to complete and recheck the same head SHA']:status==='ci-missing'?['Confirm GitHub Actions or required checks are configured']:status==='ci-inconclusive'?['Review skipped, neutral or action-required check conclusions']:['Review code changes, security impact and branch protection before approving'];
 if(evidence.prState!=='open'||evidence.draft)actions.push('Confirm PR state before considering merge');
 return {kind:'hak-github-pr-assessment',repository:evidence.repository,prNumber:evidence.prNumber,headSha:evidence.headSha,status,failures:failures.map(c=>c.name),pending:pending.map(c=>c.name),warnings,actions,codeReviewed:false,readyToMerge:false,notice:'CI results alone do not establish correctness, security, agent execution, or authorization to merge.'};
}
