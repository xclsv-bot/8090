import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const healthLatency = new Trend('health_latency_ms');
const errorRate = new Rate('http_errors');

export const options = {
  scenarios: {
    baseline: {
      executor: 'ramping-vus',
      stages: [
        { duration: '2m', target: 20 },
        { duration: '3m', target: 20 },
        { duration: '2m', target: 0 },
      ],
      exec: 'runBaseline',
    },
    scale_up_trigger: {
      executor: 'ramping-arrival-rate',
      startRate: 60,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [
        { duration: '2m', target: 120 },
        { duration: '4m', target: 350 },
        { duration: '2m', target: 120 },
      ],
      exec: 'runScaleUp',
      startTime: '7m',
    },
    spike_test: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 80,
      maxVUs: 500,
      stages: [
        { duration: '1m', target: 100 },
        { duration: '90s', target: 600 },
        { duration: '3m', target: 100 },
      ],
      exec: 'runSpike',
      startTime: '15m',
    },
    scale_down_validation: {
      executor: 'constant-vus',
      vus: 10,
      duration: '10m',
      exec: 'runScaleDown',
      startTime: '21m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<600'],
    health_latency_ms: ['p(95)<400'],
    http_errors: ['rate<0.02'],
  },
};

function performRequest(endpoint) {
  const response = http.get(`${BASE_URL}${endpoint}`, {
    headers: {
      Accept: 'application/json',
    },
    timeout: '10s',
  });

  const ok = check(response, {
    'status is 200 or 503': (r) => r.status === 200 || r.status === 503,
    'has json content type': (r) => String(r.headers['Content-Type'] || '').includes('application/json'),
  });

  healthLatency.add(response.timings.duration);
  errorRate.add(!ok || response.status >= 500);

  return response;
}

export function runBaseline() {
  performRequest('/health');
  performRequest('/health/ready');
  sleep(0.5);
}

export function runScaleUp() {
  performRequest('/api/v1/dashboard');
  performRequest('/health');
  sleep(0.2);
}

export function runSpike() {
  performRequest('/api/v1/events');
  performRequest('/health/live');
}

export function runScaleDown() {
  performRequest('/health');
  performRequest('/health/live');
  sleep(1);
}
