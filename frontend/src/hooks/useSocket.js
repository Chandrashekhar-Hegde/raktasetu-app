import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config.js';
import { refreshSession } from '../api/client.js';
import { getAccessToken } from '../lib/accessToken.js';
import { isNativePlatform } from '../lib/platform.js';

export function useSocket(onEvent) {
  const socketRef = useRef(null);
  const handlersRef = useRef(onEvent);
  handlersRef.current = onEvent;

  useEffect(() => {
    if (!getAccessToken()) return undefined;

    const socket = io(SOCKET_URL, {
      // Read the token on every (re)connect: access tokens rotate every ~30 min.
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['websocket'],
    });
    socketRef.current = socket;

    // The server disconnects when the token expires, and socket.io never auto-reconnects
    // after a server-side disconnect: refresh the session, then reconnect with the new token.
    socket.on('disconnect', (reason) => {
      if (reason !== 'io server disconnect') return;
      refreshSession().then(() => socket.connect(), () => {});
    });

    const eventNames = Object.keys(handlersRef.current || {});
    const bound = {};
    eventNames.forEach((evt) => {
      bound[evt] = (...args) => {
        const handler = handlersRef.current?.[evt];
        if (typeof handler === 'function') handler(...args);
      };
      socket.on(evt, bound[evt]);
    });

    // Always listen for blood_request even if handler registers later
    if (!bound.blood_request) {
      bound.blood_request = (...args) => {
        const handler = handlersRef.current?.blood_request;
        if (typeof handler === 'function') handler(...args);
      };
      socket.on('blood_request', bound.blood_request);
    }

    const onStorage = (event) => {
      if (isNativePlatform() && event.key === 'token' && !event.newValue) {
        socket.disconnect();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('storage', onStorage);
      Object.entries(bound).forEach(([evt, handler]) => socket.off(evt, handler));
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return socketRef;
}
