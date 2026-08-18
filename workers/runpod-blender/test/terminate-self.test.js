'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { canWorkerSelfTerminate, terminateSelf } = require('../src/worker');

const FAKE_PLATFORM_KEY = 'FAKE_PLATFORM_POD_KEY';

test('TivvleJoy path never calls RunPod terminate even when a platform Pod key is present', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return { status: 200 };
  };
  try {
    assert.equal(
      canWorkerSelfTerminate({
        ALLOW_WORKER_SELF_TERMINATE: 'false',
        RUNPOD_API_KEY: FAKE_PLATFORM_KEY,
      }),
      false,
    );
    await terminateSelf('single_shot_complete', {
      ALLOW_WORKER_SELF_TERMINATE: 'false',
      RUNPOD_API_KEY: FAKE_PLATFORM_KEY,
      RUNPOD_POD_ID: 'pod-test-1',
      RUNPOD_API_ENDPOINT: 'https://example.invalid/graphql',
    });
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('legacy mode still requires both the flag and a key before any terminate fetch', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return { status: 200 };
  };
  try {
    await terminateSelf('legacy', {
      ALLOW_WORKER_SELF_TERMINATE: 'true',
      RUNPOD_POD_ID: 'pod-test-1',
    });
    assert.equal(fetchCalls, 0);
    await terminateSelf('legacy-missing-flag-false-still-skips', {
      ALLOW_WORKER_SELF_TERMINATE: 'false',
      RUNPOD_API_KEY: FAKE_PLATFORM_KEY,
      RUNPOD_POD_ID: 'pod-test-1',
    });
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
