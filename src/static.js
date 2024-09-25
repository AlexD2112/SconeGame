export async function serveStaticAsset(path) {
    try {
        const asset = await fetch(new URL(path, 'https://stoneofscone.org/'));
        if (!asset.ok) {
            return new Response('Asset not found', { status: 404 });
        }
        return asset;
    } catch (err) {
        return new Response('Error fetching asset', { status: 500 });
    }
}
