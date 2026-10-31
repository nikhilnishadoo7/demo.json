import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { server } from './server.js';

const users = JSON.parse(readFileSync(new URL('./data/users.json', import.meta.url), 'utf8'));
let url;

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}/api/v1/customers/metadata`;
});
after(() => server.close());

const hit = async () => {
  const res = await fetch(url);
  return { status: res.status, json: await res.json(), headers: res.headers };
};

test('has the one user, with both photos empty', () => {
  assert.equal(users.length, 1);
  assert.equal(users[0].ApplicantDeclaredInfo.ApplicantFullNameAsDeclared, 'Romil Meghani');
  assert.equal(users[0].ApplicantDeclaredInfo.ApplicantPhotographAsDeclared, '');
  assert.equal(users[0].AadhaarKyc.ApplicantPhotographasPerAadhaar, '');
});

test('every hit returns the record from the file and nothing else', async () => {
  for (let i = 0; i < 3; i++) {
    const { status, json } = await hit();
    assert.equal(status, 200);
    assert.deepEqual(json, users[0]);
    assert.deepEqual(Object.keys(json), ['ApplicantDeclaredInfo', 'AadhaarKyc', 'PanKyc', 'FaceMatchingScore']);
  }
});

test('responses are not cached, so every GET reaches the server', async () => {
  assert.equal((await hit()).headers.get('cache-control'), 'no-store');
});

test('only GET on the route is served', async () => {
  const wrongMethod = await fetch(url, { method: 'POST' });
  assert.equal(wrongMethod.status, 404);
  assert.equal((await wrongMethod.json()).resultStatus, 'Error');
  const wrongRoute = await fetch(url.replace('metadata', 'other'));
  assert.equal(wrongRoute.status, 404);
});

test('stays correct for 2000 requests over 100 parallel clients', async () => {
  const results = [];
  let sent = 0;
  const client = async () => {
    while (sent++ < 2000) results.push(await hit());
  };
  await Promise.all(Array.from({ length: 100 }, client));
  assert.equal(results.length, 2000);
  assert.ok(results.every((r) => r.status === 200));
  results.forEach((r) => assert.deepEqual(r.json, users[0]));
});
