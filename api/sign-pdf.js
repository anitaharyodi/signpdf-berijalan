// Vercel Serverless Function — Proxy Sign PDF (public endpoint, no X-SIGNATURE)
// Uploads PDF base64 → Vercel Blob → kirim URL ke Berijalan (karena PATH_FILE harus URL, bukan base64)
const { put } = require('@vercel/blob');

// Secrets come from environment variables (Vercel → Settings → Environment Variables)
const CFG = {
    TARGET_URL: process.env.TARGET_URL || 'https://phone-cleansing-dev.berijalan.id/gateway/ekyc/integration/public/sign-pdf',
    API_KEY:    process.env.API_KEY,
    X_APP_ID:   process.env.X_APP_ID,
    WEBHOOK_URL: process.env.WEBHOOK_URL,
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

        // --- Build webhook callback URL ---
        const webhookUrl = CFG.WEBHOOK_URL ||
            (process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}/api/webhook`
                : `http://${req.headers.host || 'localhost:3001'}/api/webhook`);
        const callbackUrl = webhookUrl + (CFG.WEBHOOK_TOKEN ? `?token=${CFG.WEBHOOK_TOKEN}` : '');

        // --- Upload PDF(s) from base64 → Vercel Blob (public, so Berijalan can download) ---
        // Berijalan expects PATH_FILE as a downloadable URL, not base64 data URL
        const body = { ...req.body, callback_url: callbackUrl };
        if (body.list_doc && Array.isArray(body.list_doc)) {
            const uploadId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
            for (let i = 0; i < body.list_doc.length; i++) {
                const doc = body.list_doc[i];
                const raw = doc.PATH_FILE;
                if (raw && /^data:application\/pdf;base64,/.test(raw)) {
                    const pdfBuf = Buffer.from(raw.replace(/^data:application\/pdf;base64,/, ''), 'base64');
                    const blobPath = `uploads/${uploadId}_${i}.pdf`;
                    const { url } = await put(blobPath, pdfBuf, {
                        access: 'public',
                        addRandomSuffix: false,
                        contentType: 'application/pdf',
                    });
                    console.log(`Uploaded PDF to Blob: ${blobPath} → ${url}`);
                    doc.PATH_FILE = url;
                }
            }
        }

        const bodyStr = JSON.stringify(body);
        console.log('Webhook callback_url:', callbackUrl);
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