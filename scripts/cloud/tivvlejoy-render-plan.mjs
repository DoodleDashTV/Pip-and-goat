/**
 * TivvleJoy read-only RunPod render plan.
 * No Pod create/update/delete calls are present in this file.
 */

const GPU_TYPE_ID = 'NVIDIA GeForce RTX 4090';
const GRAPHQL_URL = 'https://api.runpod.io/graphql';
const MAX_HOURLY_USD = '0.75';
const MAX_RUNTIME_MINUTES = 20;
const MAX_COMPUTE_USD = '0.25';
const AVAILABLE_STOCK = new Set(['High', 'Medium', 'Low']);
const USD_PATTERN = /^\d+(\.\d+)?$/;

function parseUsdToMicros(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!USD_PATTERN.test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  const first6 = `${frac}000000`.slice(0, 6);
  const extra = frac.slice(6);
  const micros = Number(whole) * 1_000_000 + Number(first6);
  if (!Number.isSafeInteger(micros) || micros < 0) return null;
  if (extra && /[1-9]/.test(extra)) return micros + 1;
  return micros;
}

function ceilDiv(numerator, denominator) {
  return Math.floor((numerator + denominator - 1) / denominator);
}

function formatUsd(micros) {
  const whole = Math.floor(micros / 1_000_000);
  const frac = String(micros % 1_000_000).padStart(6, '0');
  return `$${whole}.${frac}`;
}

async function readJsonSilently(response) {
  try {
    return JSON.parse(await response.text());
  } catch {
    return null;
  }
}

async function postGraphql(apiKey, query, variables = undefined) {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (response.status < 200 || response.status > 299) return null;
  return readJsonSilently(response);
}

async function main() {
  const apiKey = process.env.RUNPOD_API_KEY ?? '';
  if (!apiKey) {
    console.log('render_plan REFUSE');
    console.log('RUNPOD_API_KEY secret is missing.');
    process.exitCode = 1;
    return;
  }

  const auth = await postGraphql(apiKey, '{ myself { id } }');
  if (!auth?.data?.myself?.id) {
    console.log('render_plan REFUSE');
    console.log('RunPod authentication could not be verified.');
    process.exitCode = 1;
    return;
  }

  const quote = await postGraphql(
    apiKey,
    `query SecurePrice($id: String) {
      gpuTypes(input: { id: $id }) {
        id
        lowestPrice(input: { gpuCount: 1, secureCloud: true }) {
          uninterruptablePrice
          stockStatus
        }
      }
    }`,
    { id: GPU_TYPE_ID },
  );

  const gpuTypes = quote?.data?.gpuTypes;
  const match = Array.isArray(gpuTypes) ? gpuTypes.find((gpu) => gpu?.id === GPU_TYPE_ID) : null;
  const lowest = match?.lowestPrice;
  const stockStatus = lowest?.stockStatus;
  const hourlyMicros = parseUsdToMicros(lowest?.uninterruptablePrice);
  const maxHourlyMicros = parseUsdToMicros(MAX_HOURLY_USD);
  const maxComputeMicros = parseUsdToMicros(MAX_COMPUTE_USD);

  let verdict = 'PASS';
  let reason = null;
  let projectedMicros = null;

  if (!match) {
    verdict = 'REFUSE';
    reason = 'Pinned RTX 4090 Secure Cloud offer was not returned.';
  } else if (!AVAILABLE_STOCK.has(stockStatus)) {
    verdict = 'REFUSE';
    reason = 'RTX 4090 Secure Cloud stock is unavailable or unverified.';
  } else if (hourlyMicros === null || maxHourlyMicros === null || maxComputeMicros === null) {
    verdict = 'REFUSE';
    reason = 'Price or safety cap could not be verified.';
  } else if (hourlyMicros > maxHourlyMicros) {
    verdict = 'REFUSE';
    reason = `Hourly price ${formatUsd(hourlyMicros)} exceeds the $${MAX_HOURLY_USD} cap.`;
  } else {
    projectedMicros = ceilDiv(hourlyMicros * MAX_RUNTIME_MINUTES, 60);
    if (projectedMicros > maxComputeMicros) {
      verdict = 'REFUSE';
      reason = `Projected compute ${formatUsd(projectedMicros)} exceeds the $${MAX_COMPUTE_USD} cap.`;
    }
  }

  console.log('=== TivvleJoy render plan ===');
  console.log(`GPU: ${GPU_TYPE_ID}`);
  console.log('Cloud: SECURE');
  console.log('GPU count: 1');
  console.log(`Stock: ${stockStatus ?? 'unverified'}`);
  console.log(`Current hourly price: ${hourlyMicros === null ? 'unverified' : formatUsd(hourlyMicros)}`);
  console.log(`Maximum runtime: ${MAX_RUNTIME_MINUTES} minutes`);
  console.log(`Projected maximum compute cost: ${projectedMicros === null ? 'unverified' : formatUsd(projectedMicros)}`);
  console.log(`Plan: ${verdict}`);
  if (reason) console.log(`Reason: ${reason}`);

  process.exitCode = verdict === 'PASS' ? 0 : 1;
}

await main();
