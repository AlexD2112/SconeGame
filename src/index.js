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

    if (url.pathname === '/get-user-info') {
        return await getUserInfo(request);
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

async function getUserInfo(request) {
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) {
        return new Response(JSON.stringify({ error: 'No cookie found' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 401
        });
    }

    const userID = getCookieValue(cookieHeader, 'userID');
    const username = getCookieValue(cookieHeader, 'username');
    if (!userID) {
        return new Response(JSON.stringify({ error: 'User not authenticated' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 401
        });
    }
    if (!username) {
        return new Response(JSON.stringify({ error: 'Username not found' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 401
        });
    }

    // Here, you would typically fetch more user data from a database or external API
    // For simplicity, we'll just return the userID
    const userInfo = { userID, username };

    return new Response(JSON.stringify(userInfo), {
        headers: { 'Content-Type': 'application/json' }
    });
}

function getCookieValue(cookieHeader, name) {
    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
        const [cookieName, cookieValue] = cookie.trim().split('=');
        if (cookieName === name) {
            return cookieValue;
        }
    }
    return null;
}
