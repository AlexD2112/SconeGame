export async function handleAuthRequest(url) {
    const code = url.searchParams.get('code');

    if (!code) {
        return new Response('Error: no code provided', { status: 400 });
    }

    // Step 1: Exchange the code for an access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
            client_id: '1288255745544028353', // replace with your client_id
            client_secret: 'I_WPJnzpQtCs_UloqpAiimguxPo6tA8P', // replace with your client_secret
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: 'https://stoneofscone.org/auth/discord/callback' // match your redirect URI
        }),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
        return new Response('Error fetching access token', { status: 500 });
    }

    const accessToken = tokenData.access_token;

    // Step 2: Fetch the Discord user's info
    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    const discordUser = await userResponse.json();
    const userName = discordUser.username;
    const userId = discordUser.id;

    // Step 3: Set a cookie with the Discord user ID and redirect to the home page
    return new Response(null, {
        status: 302,
        headers: {
            'Location': '/', // Redirect to home page after login
            'Set-Cookie': [
                `userID=${userId}; Path=/; HttpOnly; Secure; SameSite=Lax;`,
                `username=${userName}; Path=/; HttpOnly; Secure; SameSite=Lax;`
            ]
        }
    });
}