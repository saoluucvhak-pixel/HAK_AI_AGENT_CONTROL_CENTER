import test from 'node:test';
import assert from 'node:assert/strict';
import {executeTestHarness,extractTestFailureSummary} from '../src/local-test-harness.js';

test('local-test-harness: executes allowable binary with success and returns passed=true', async () => {
 const result=await executeTestHarness({
  binary:'node',
  args:['-e','process.exit(0)'],
  timeoutMs:10000
 });
 assert.equal(result.passed,true);
 assert.equal(result.exitCode,0);
 assert.match(result.summary,/0 errors/);
});

test('local-test-harness: captures failure exit and extracts failure summary', async () => {
 const result=await executeTestHarness({
  binary:'node',
  args:['-e','console.error("AssertionError: 403 !== 200\\n  at TestContext"); process.exit(1)'],
  timeoutMs:10000
 });
 assert.equal(result.passed,false);
 assert.equal(result.exitCode,1);
 assert.match(result.summary,/AssertionError/);
});

test('local-test-harness: extractTestFailureSummary grabs stack trace and error keywords', () => {
 const rawOutput=`
> app test
running test suite
✔ health check passed
✖ reports.test.js:
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  "Khối lượng (Tấn)" !== "Khối lượng (m³)"
  at reports.test.js:142:10
ℹ tests 10, fail 1
 `;
 const summary=extractTestFailureSummary(rawOutput);
 assert.match(summary,/AssertionError/);
 assert.match(summary,/Khối lượng/);
});

test('local-test-harness: rejects disallowed binaries', async () => {
 await assert.rejects(
  ()=>executeTestHarness({binary:'bash',args:['-c','ls']}),
  /not permitted in test harness/
 );
});
