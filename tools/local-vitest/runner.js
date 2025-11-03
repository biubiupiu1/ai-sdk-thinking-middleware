const { getTests, getHooks, resetState } = require('./state');

function isPrefix(prefix, target) {
  if (prefix.length > target.length) {
    return false;
  }
  return prefix.every((value, index) => target[index] === value);
}

async function runHooks(hooks, suitePath) {
  for (const hook of hooks) {
    if (isPrefix(hook.suite, suitePath)) {
      await hook.fn();
    }
  }
}

async function runRegisteredTests() {
  const tests = getTests();
  const hooks = getHooks();
  const onlyTests = tests.filter((test) => test.only);
  const activeTests = onlyTests.length > 0 ? onlyTests : tests.filter((test) => !test.skipped);

  const failures = [];
  let passed = 0;

  await runHooks(hooks.beforeAll, []);

  for (const test of activeTests) {
    const label = [...test.suite, test.name].join(' > ');
    try {
      await runHooks(hooks.beforeEach, test.suite);
      await Promise.resolve(test.handler());
      await runHooks(hooks.afterEach, test.suite);
      passed += 1;
      console.log(`✓ ${label}`);
    } catch (error) {
      failures.push({ test, error });
      console.error(`✗ ${label}`);
      console.error(error);
    }
  }

  await runHooks(hooks.afterAll, []);

  console.log(`\n${passed}/${activeTests.length} tests passed`);

  const success = failures.length === 0;

  if (!success) {
    console.error(`Failures: ${failures.length}`);
  }

  resetState();

  return { success, failures };
}

module.exports = {
  runRegisteredTests,
  resetState,
};
