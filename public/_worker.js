export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/amap-config') {
      return Response.json({ key: env.AMAP_WEB_KEY || '' }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    if (url.pathname === '/api/amap-pois') {
      if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405 });
      const serviceKey = env.AMAP_SERVICE_KEY || env.AMAP_WEB_SERVICE_KEY || '';
      if (!serviceKey || !env.AMAP_SECURITY_JS_CODE) {
        return Response.json({
          code: 'AMAP_SERVICE_KEY_REQUIRED',
          error: 'Configure AMAP_SERVICE_KEY and AMAP_SECURITY_JS_CODE',
        }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
      }
      const location = url.searchParams.get('location') || '';
      const [lng, lat] = location.split(',').map(Number);
      const radius = Number(url.searchParams.get('radius') || 1200);
      const page = Number(url.searchParams.get('page') || 1);
      if (!Number.isFinite(lng) || lng < 73 || lng > 135 || !Number.isFinite(lat) || lat < 3 || lat > 54 || radius < 1 || radius > 50000 || !Number.isInteger(page) || page < 1 || page > 100) {
        return Response.json({ error: 'Invalid POI search parameters' }, { status: 400 });
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
      return Response.json(data, {
        status: upstream.status,
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    if (url.pathname.startsWith('/_AMapService/')) {
      if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
        return new Response('Method not allowed', { status: 405 });
      }
      if (!env.AMAP_SECURITY_JS_CODE) {
        return Response.json({ error: 'AMAP_SECURITY_JS_CODE is not configured' }, { status: 503 });
      }

      const path = url.pathname.slice('/_AMapService'.length);
      if (!/^\/(?:v3|v4)\/[A-Za-z0-9_./-]+$/.test(path) || path.includes('..')) {
        return new Response('Not found', { status: 404 });
      }
      const upstreamHost = path.startsWith('/v4/map/styles')
        ? 'https://webapi.amap.com'
        : 'https://restapi.amap.com';
      const upstreamUrl = new URL(path, upstreamHost);
      url.searchParams.forEach((value, key) => upstreamUrl.searchParams.set(key, value));
      upstreamUrl.searchParams.set('jscode', env.AMAP_SECURITY_JS_CODE);

      const headers = new Headers();
      const accept = request.headers.get('Accept');
      const contentType = request.headers.get('Content-Type');
      if (accept) headers.set('Accept', accept);
      if (contentType) headers.set('Content-Type', contentType);
      const init = { method: request.method, headers };
      if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer();
      const upstream = await fetch(new Request(upstreamUrl, init));
      const responseHeaders = new Headers(upstream.headers);
      for (const header of ['content-encoding', 'content-length', 'transfer-encoding', 'connection']) {
        responseHeaders.delete(header);
      }
      return new Response(request.method === 'HEAD' ? null : upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
