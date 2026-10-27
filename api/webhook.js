// Vercel Serverless Function — Webhook receiver for Sign PDF results (berijalan)
// Saves the signed PDF to Vercel Blob (private) as signed/<fileId>.pdf so the page can preview it.
// The payload format is not documented yet, so fileId and the PDF are located by searching the body.
// View logs in Vercel → Project → Logs (filter: /api/webhook)
const { put } = require('@vercel/blob');

// Optional shared secret: if WEBHOOK_TOKEN is set, the registered URL must be
// https://<project>.vercel.app/api/webhook?token=<WEBHOOK_TOKEN>
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN;

const PDF_DATA_URL = /^data:application\/pdf;base64,/;
const PDF_BASE64_MAGIC = 'JVBER'; // base64 of "%PDF"

// Helper: shorten long strings (e.g. base64 PDF) so logs stay readable
function summarize(value) {
    if (typeof value === 'string') {
        return value.length > 200 ? `${value.slice(0, 80)}… [${value.length} chars]` : value;
    }
    if (Array.isArray(value)) return value.map(summarize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, summarize(v)]));
    }
    return value;
}

// Helper: depth-first search over every key/value pair in the payload
function findEntry(value, match, key = '') {
    if (match(key, value)) return value;
    if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            const found = findEntry(v, match, k);
            if (found !== undefined) return found;
        }
    }
    return undefined;
}

const findFileId = body => findEntry(body, (k, v) => /^file_?id$/i.test(k) && typeof v === 'string');
const findPdfBase64 = body => findEntry(body, (k, v) =>
    typeof v === 'string' && (PDF_DATA_URL.test(v) || v.startsWith(PDF_BASE64_MAGIC)));
const findPdfUrl = body => findEntry(body, (k, v) =>
    typeof v === 'string' && /^https?:\/\//.test(v) && /url|link|path|file/i.test(k));

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (WEBHOOK_TOKEN && req.query?.token !== WEBHOOK_TOKEN) {
        console.warn('Webhook rejected: invalid token');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('Webhook headers:', JSON.stringify(summarize(req.headers)));
    console.log('Webhook body:', JSON.stringify(summarize(req.body)));

    const fileId = findFileId(req.body);
    if (!fileId || !/^[\w-]{1,64}$/.test(fileId)) {
        console.warn('Webhook: no usable fileId in payload, nothing saved');
        return res.status(200).json({ status: 'received' });
    }

    try {
        const pdfBase64 = findPdfBase64(req.body);
        const pdfUrl = pdfBase64 ? undefined : findPdfUrl(req.body);
        const options = { access: 'private', addRandomSuffix: false, allowOverwrite: true };

        if (pdfBase64) {
            const pdf = Buffer.from(pdfBase64.replace(PDF_DATA_URL, ''), 'base64');
            await put(`signed/${fileId}.pdf`, pdf, { ...options, contentType: 'application/pdf' });
            console.log(`Webhook: saved signed/${fileId}.pdf (${pdf.length} bytes)`);
        } else if (pdfUrl) {
            await put(`signed/${fileId}.json`, JSON.stringify({ url: pdfUrl }), { ...options, contentType: 'application/json' });
            console.log(`Webhook: saved PDF link for ${fileId}: ${pdfUrl}`);
        } else {
            console.warn(`Webhook: no PDF found in payload for ${fileId}, nothing saved`);
        }
    } catch (err) {
        // Still acknowledge so berijalan does not keep retrying; the error is in the logs
        console.error('Webhook: failed to save result:', err);
    }

    res.status(200).json({ status: 'received' });
};
