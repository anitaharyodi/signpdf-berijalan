// Vercel Serverless Function — Proxy Sign PDF (public endpoint, no X-SIGNATURE)

// Secrets come from environment variables (Vercel → Settings → Environment Variables)
const CFG = {
    TARGET_URL: process.env.TARGET_URL || 'https://phone-cleansing-dev.berijalan.id/gateway/ekyc/integration/public/sign-pdf',
    API_KEY:    process.env.API_KEY,
    X_APP_ID:   process.env.X_APP_ID,
    // Webhook URL: Berijalan akan POST hasil sign PDF ke URL ini
    // Gunakan VERCEL_URL (auto-set oleh Vercel) atau WEBHOOK_URL kustom
    WEBHOOK_URL: process.env.WEBHOOK_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/webhook` : undefined),
    WEBHOOK_TOKEN: process.env.WEBHOOK_TOKEN,
};

// Helper: WIB timestamp
function timestampWIB() {
    // toISOString() is always UTC, so shift by +7h regardless of server timezone
    const wib = new Date(Date.now() + 7 * 3600000);
    return wib.toISOString().replace(/\.\d{3}Z$/, '+07:00');
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const ts = timestampWIB();

        // Inject callback/webhook URL into payload so Berijalan knows where to POST results
        const bodyWithCallback = { ...req.body };
        if (CFG.WEBHOOK_URL) {
            bodyWithCallback.callback_url = CFG.WEBHOOK_URL +
                (CFG.WEBHOOK_TOKEN ? `?token=${CFG.WEBHOOK_TOKEN}` : '');
            console.log('Webhook callback_url:', bodyWithCallback.callback_url);
        } else {
            console.warn('WEBHOOK_URL is not set — Berijalan will not be able to send signed PDF results back');
        }

        const bodyStr = JSON.stringify(bodyWithCallback);

        console.log('X-TIMESTAMP:', ts);

        const response = await fetch(CFG.TARGET_URL, {
            method: 'POST',
            headers: {
                'Content-Type':               'application/json',
                'X-APP-ID':                   CFG.X_APP_ID,
                // 'X-SIGNATURE':                signature,
                'X-TIMESTAMP':                ts,
                'APIKey':                     CFG.API_KEY,
                'X-Content-Type-Options':     'nosniff',
                'X-XSS-Protection':           '1; mode=block',
                'Strict-Transport-Security':  'max-age=31536000; includeSubDomains; preload',
                'X-Frame-Options':            'SAMEORIGIN',
            },
            body: bodyStr,
        });

        const contentType = response.headers.get('content-type') || '';
        let data;
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        res.status(response.status).json({
            status: response.status,
            ok: response.ok,
            data,
        });

    } catch (err) {
        console.error('Proxy Error:', err);
        res.status(500).json({
            status: 500,
            ok: false,
            error: err.message,
        });
    }
};