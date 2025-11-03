const tests = [];
const suiteStack = [];
const hooks = {
  beforeAll: [],
  afterAll: [],
  beforeEach: [],
  afterEach: [],
};

function currentSuitePath() {
  return [...suiteStack];
}

function pushSuite(name) {
  suiteStack.push(name);
}

function popSuite() {
  suiteStack.pop();
}

function registerTest(test) {
  tests.push({ ...test, suite: currentSuitePath() });
}

function registerHook(type, hook) {
  hooks[type].push({ fn: hook, suite: currentSuitePath() });
}

function getTests() {
  return [...tests];
}

function getHooks() {
  return {
    beforeAll: [...hooks.beforeAll],
    afterAll: [...hooks.afterAll],
    beforeEach: [...hooks.beforeEach],
    afterEach: [...hooks.afterEach],
  };
}

function resetState() {
  tests.length = 0;
  suiteStack.length = 0;
  hooks.beforeAll.length = 0;
  hooks.afterAll.length = 0;
  hooks.beforeEach.length = 0;
  hooks.afterEach.length = 0;
}

module.exports = {
  currentSuitePath,
  pushSuite,
  popSuite,
  registerTest,
  registerHook,
  getTests,
  getHooks,
  resetState,
};
