import { verifyScenario } from './verifyScenario';

const TARGET_SCENARIO_ID = 'scn_t1_college_weekend';

try {
  verifyScenario(TARGET_SCENARIO_ID);
  console.log('[verify:t1] PASS - scenario dataset and DB constraints are valid.');
} catch (error) {
  console.error(
    `[verify:t1] FAIL - ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
