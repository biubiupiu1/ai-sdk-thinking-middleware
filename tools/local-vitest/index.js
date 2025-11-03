const assert = require('node:assert/strict');
const {
  pushSuite,
  popSuite,
  registerTest,
  registerHook,
} = require('./state');

function describe(name, factory) {
  pushSuite(name);
  try {
    factory();
  } finally {
    popSuite();
  }
}

function it(name, handler, timeout) {
  registerTest({ name, handler, timeout });
}

const test = Object.assign(it, {
  skip(name) {
    registerTest({ name, handler: () => Promise.resolve(), skipped: true });
  },
  only(name, handler) {
    registerTest({ name, handler, only: true });
  },
});

describe.skip = function skipDescribe(name, factory) {
  // Register a suite without executing its tests.
  // For simplicity, we do nothing to skip entire suite.
};

describe.only = function onlyDescribe(name, factory) {
  pushSuite(name);
  try {
    factory();
  } finally {
    popSuite();
  }
};

function beforeAll(handler) {
  registerHook('beforeAll', handler);
}

function afterAll(handler) {
  registerHook('afterAll', handler);
}

function beforeEach(handler) {
  registerHook('beforeEach', handler);
}

function afterEach(handler) {
  registerHook('afterEach', handler);
}

function createMatcher(actual) {
  return {
    toEqual(expected) {
      assert.deepStrictEqual(actual, expected);
    },
    toStrictEqual(expected) {
      assert.deepStrictEqual(actual, expected);
    },
    toBe(expected) {
      assert.strictEqual(actual, expected);
    },
    toBeTruthy() {
      assert.ok(actual);
    },
    toBeFalsy() {
      assert.ok(!actual);
    },
    toBeUndefined() {
      assert.strictEqual(actual, undefined);
    },
    toBeNull() {
      assert.strictEqual(actual, null);
    },
    toHaveLength(length) {
      if (actual == null || typeof actual.length !== 'number') {
        assert.fail('Received value does not have a length property');
      }
      assert.strictEqual(actual.length, length);
    },
    toContain(value) {
      if (typeof actual === 'string' || Array.isArray(actual)) {
        assert.ok(actual.includes(value));
        return;
      }
      assert.fail('toContain expects a string or array');
    },
    toMatchObject(expected) {
      if (actual == null || typeof actual !== 'object') {
        assert.fail('toMatchObject expects an object');
      }
      for (const [key, value] of Object.entries(expected)) {
        assert.deepStrictEqual(actual[key], value);
      }
    },
    toThrow(expected) {
      assert.strictEqual(typeof actual, 'function', 'toThrow expects a function');
      let thrown = false;
      try {
        actual();
      } catch (error) {
        thrown = true;
        if (expected instanceof RegExp) {
          assert.match(error.message, expected);
        } else if (typeof expected === 'function') {
          assert.ok(error instanceof expected);
        } else if (expected !== undefined) {
          assert.strictEqual(error.message, expected);
        }
      }
      if (!thrown) {
        assert.fail('Expected function to throw');
      }
    },
    get resolves() {
      return createAsyncMatchers(Promise.resolve(actual));
    },
    get rejects() {
      return createAsyncRejectMatchers(Promise.resolve(actual));
    },
  };
}

function createAsyncMatchers(promise) {
  return {
    async toEqual(expected) {
      const value = await promise;
      createMatcher(value).toEqual(expected);
    },
    async toStrictEqual(expected) {
      const value = await promise;
      createMatcher(value).toStrictEqual(expected);
    },
    async toBe(expected) {
      const value = await promise;
      createMatcher(value).toBe(expected);
    },
  };
}

function createAsyncRejectMatchers(promise) {
  return {
    async toThrow(expected) {
      try {
        await promise;
      } catch (error) {
        if (expected instanceof RegExp) {
          assert.match(error.message, expected);
        } else if (typeof expected === 'function') {
          assert.ok(error instanceof expected);
        } else if (expected !== undefined) {
          assert.strictEqual(error.message, expected);
        }
        return;
      }
      assert.fail('Expected promise to reject');
    },
  };
}

function expect(value) {
  return createMatcher(value);
}

module.exports = {
  describe,
  it,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
};
