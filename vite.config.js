import { defineConfig, loadEnv } from 'vite';

function amapDevRoutes(env) {
  const installRoutes = (server) => {
      server.middlewares.use('/api/amap-config', (_request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify({ key: env.AMAP_WEB_KEY || env.VITE_AMAP_KEY || '' }));
      });

      server.middlewares.use('/api/amap-pois', async (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        if (request.method !== 'GET') {
          response.statusCode = 405;
          response.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        const serviceKey = env.AMAP_SERVICE_KEY || env.AMAP_WEB_SERVICE_KEY || '';
        if (!serviceKey || !env.AMAP_SECURITY_JS_CODE) {
          response.statusCode = 503;
          response.end(JSON.stringify({ code: 'AMAP_SERVICE_KEY_REQUIRED', error: 'Configure AMAP_SERVICE_KEY and AMAP_SECURITY_JS_CODE in .env.local' }));
          return;
        }
        try {
          const params = new URL(request.url || '/', 'http://localhost').searchParams;
          const location = params.get('location') || '';
          const [lng, lat] = location.split(',').map(Number);
          const radius = Number(params.get('radius') || 1200);
          const page = Number(params.get('page') || 1);
          if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < 73 || lng > 135 || lat < 3 || lat > 54 || radius < 1 || radius > 50000 || !Number.isInteger(page) || page < 1 || page > 100) {
            response.statusCode = 400;
            response.end(JSON.stringify({ error: 'Invalid POI search parameters' }));
            return;
          }
          const upstreamUrl = new URL('https://restapi.amap.com/v3/place/around');
          upstreamUrl.searchParams.set('key', serviceKey);
          upstreamUrl.searchParams.set('jscode', env.AMAP_SECURITY_JS_CODE);
          upstreamUrl.searchParams.set('location', `${lng},${lat}`);
          upstreamUrl.searchParams.set('radius', String(radius));
          upstreamUrl.searchParams.set('types', '050000|060000|070000|080000');
          upstreamUrl.searchParams.set('offset', '25');
          upstreamUrl.searchParams.set('page', String(page));
          upstreamUrl.searchParams.set('extensions', 'base');
          const upstream = await fetch(upstreamUrl);
          const data = await upstream.json();
          response.statusCode = upstream.status;
          response.end(JSON.stringify(data));
        } catch (error) {
          response.statusCode = 502;
          response.end(JSON.stringify({ error: error.message || 'AMap POI search failed' }));
        }
      });

      server.middlewares.use('/_AMapService', async (request, response) => {
        if (!['GET', 'HEAD', 'POST'].includes(request.method || 'GET')) {
          response.statusCode = 405;
          response.end('Method not allowed');
          return;
        }
        if (!env.AMAP_SECURITY_JS_CODE) {
          response.statusCode = 503;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ error: 'Set AMAP_SECURITY_JS_CODE in .env.local' }));
          return;
        }

        try {
          const incoming = new URL(request.url || '/', 'http://localhost');
          const path = incoming.pathname;
          if (!/^\/(?:v3|v4)\/[A-Za-z0-9_./-]+$/.test(path) || path.includes('..')) {
            response.statusCode = 404;
            response.end('Not found');
            return;
          }
          const host = path.startsWith('/v4/map/styles') ? 'https://webapi.amap.com' : 'https://restapi.amap.com';
          const upstreamUrl = new URL(path, host);
          incoming.searchParams.forEach((value, key) => upstreamUrl.searchParams.set(key, value));
          upstreamUrl.searchParams.set('jscode', env.AMAP_SECURITY_JS_CODE);
          const chunks = [];
          for await (const chunk of request) chunks.push(chunk);
          const upstream = await fetch(upstreamUrl, {
            method: request.method,
            headers: {
              ...(request.headers.accept ? { Accept: request.headers.accept } : {}),
              ...(request.headers['content-type'] ? { 'Content-Type': request.headers['content-type'] } : {}),
            },
            ...(request.method === 'GET' || request.method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }),
          });
          response.statusCode = upstream.status;
          upstream.headers.forEach((value, key) => {
            if (!['transfer-encoding', 'connection', 'content-encoding', 'content-length'].includes(key.toLowerCase())) response.setHeader(key, value);
          });
          if (request.method === 'HEAD') response.end();
          else response.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (error) {
          response.statusCode = 502;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ error: error.message || 'AMap proxy request failed' }));
        }
      });
  };
  return {
    name: 'amap-dev-routes',
    configureServer: installRoutes,
    configurePreviewServer: installRoutes,
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return { plugins: [amapDevRoutes(env)] };
});
