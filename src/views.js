export async function serveHTMLView(path) {
    let viewPath = '/views' + path + '.html';
    if (path === '/') {
        viewPath = '/views/home.html';
    }

    try {
        console.log(viewPath);
        console.log(new URL(viewPath, 'https://stoneofscone.org/'));
        const view = await fetch(new URL(viewPath, 'https://stoneofscone.org/'));
        if (!view.ok) {
            return new Response('View not found', { status: 404 });
        }
        return view;
    } catch (err) {
        return new Response('Error fetching view', { status: 500 });
    }
}
