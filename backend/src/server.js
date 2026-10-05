import 'dotenv/config';
import http from 'http';
import { Server } from 'socket.io';
import { createApp, buildAllowedOrigins } from './app.js';
import { pool, runtimeRoleBypassesRls } from './db.js';
import { attachSocketAuthorization } from './realtime/socketAuthorization.js';
import { configurePublisher } from './realtime/publisher.js';

const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);
if (isProduction && process.env.MIGRATION_DATABASE_URL) {
  console.error('Refusing to boot: MIGRATION_DATABASE_URL must not be set on the application service');
  process.exit(1);
}

if (isProduction) {
  // Fail closed on a proven RLS bypass; a DB outage only warns so /api/health keeps serving the SPA.
  runtimeRoleBypassesRls().then((bypass) => {
    if (bypass) {
      console.error('Refusing to run: database runtime role bypasses row-level security (set DB_RUNTIME_ROLE)');
      process.exit(1);
    }
  }, (error) => console.warn('RLS role check skipped, database unavailable:', error.code || error.message));
}

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: buildAllowedOrigins(),
    methods: ['GET', 'POST'],
  },
});

attachSocketAuthorization(io);
configurePublisher(io);

const port = Number(process.env.PORT || 3001);
server.listen(port, () => {
  console.log(`RaktaSetu API listening on port ${port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  io.close();
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    shutdown(signal)
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
}

export { app, server, io };
