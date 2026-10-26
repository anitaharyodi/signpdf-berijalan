// Vercel Serverless Function — Proxy Sign PDF + X-SIGNATURE Generation
const crypto = require('crypto');

// Secrets come from environment variables (Vercel → Settings → Environment Variables)
// PEM may be stored with literal "\n" sequences, so normalize to real newlines
const PRIVATE_KEY_PEM = (process.env.PRIVATE_KEY_PEM || '').replace(/\\n/g, '\n');

const CFG = {
    TARGET_URL: process.env.TARGET_URL || 'https://phone-cleansing-dev.berijalan.id/gateway/master-tenant/integration/sign-pdf',
    API_KEY:    process.env.API_KEY,
    X_APP_ID:   process.env.X_APP_ID,
};

// Helper: WIB timestamp
function timestampWIB() {
    // toISOString() is always UTC, so shift by +7h regardless of server timezone
    const wib = new Date(Date.now() + 7 * 3600000);
    return wib.toISOString().replace(/\.\d{3}Z$/, '+07:00');
}

// Helper: SHA256 → lowercase hex
function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex').toLowerCase();
}

// Generate X-SIGNATURE
// DataToSign = HTTPMethod + ":" + RequestUrl + ":" + Lowercase(SHA256(RequestBody)) + ":" + AppID + ":" + Timestamp
// X-SIGNATURE = Base64( SHA256withRSA(PrivateKey, DataToSign) )
function generateSignature(httpMethod, requestUrl, bodyStr, timestamp) {
    const bodyHash = sha256(bodyStr);
    const dataToSign = `${httpMethod}:${requestUrl}:${bodyHash}:${CFG.X_APP_ID}:${timestamp}`;
    console.log('DataToSign:', dataToSign);
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(dataToSign);
    sign.end();
    return sign.sign(PRIVATE_KEY_PEM, 'base64');
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
        const bodyStr = JSON.stringify(req.body);

        // Parse target URL path
        const targetUrl = new URL(CFG.TARGET_URL);
        const signature = generateSignature('POST', targetUrl.pathname, bodyStr, ts);

        console.log('X-SIGNATURE:', signature);
        console.log('X-TIMESTAMP:', ts);

        const response = await fetch(CFG.TARGET_URL, {
            method: 'POST',
            headers: {
                'Content-Type':               'application/json',
                'X-APP-ID':                   CFG.X_APP_ID,
                'X-SIGNATURE':                signature,
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