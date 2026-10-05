import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { validate, paginationSchema } from '../src/validation/schemas.js';

// Express 4 let a rejected async handler become an unhandledRejection, which exits Node.
test('a rejected async handler reaches the error handler instead of crashing', async () => {
  const app = express();
  app.get('/boom', async () => { throw new Error('db down'); });
  app.use((err, req, res, next) => res.status(503).json({ caught: err.message })); // eslint-disable-line no-unused-vars
  const res = await request(app).get('/boom').expect(503);
  assert.equal(res.body.caught, 'db down');
});

test('validate() can replace req.query under Express 5', async () => {
  const app = express();
  app.get('/list', validate(paginationSchema, 'query'), (req, res) => res.json(req.query));
  const res = await request(app).get('/list').expect(200);
  assert.equal(typeof res.body, 'object');
});
