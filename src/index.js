import { handleAuthRequest } from './auth.js';
import { serveStaticAsset } from './static.js';
import { serveHTMLView } from './views.js';

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const url = new URL(request.url);

    if (url.pathname === '/auth/discord/callback') {
        return await handleAuthRequest(url);
    }

    // Serve static assets (CSS, images, etc.) or views
    return await serveRequest(url.pathname);
}

async function serveRequest(path) {
    if (path.startsWith('/assets') || path.startsWith('/css') || path.startsWith('/js') || path.startsWith('/data')) {
        return await serveStaticAsset(path);
    }

    if (path === '/' || path === '/map' || path === '/estate' || path === '/claimants' || path === '/profile') {
        return await serveHTMLView(path);
    }

    return new Response('Not Found', { status: 404 });
}
