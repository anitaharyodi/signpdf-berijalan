// Vercel Serverless Function — Signed PDF result lookup
// GET /api/result?fileId=<id>
//   → application/pdf          when the webhook saved the PDF itself
//   → { status: 'ready', url } when the webhook only sent a link
//   → { status: 'pending' }    when nothing has arrived yet
const { get } = require('@vercel/blob');

async function readBlob(pathname) {
    const result = await get(pathname, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
}

module.exports = async (req, res) => {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const fileId = req.query?.fileId;
    if (!fileId || !/^[\w-]{1,64}$/.test(fileId)) return res.status(400).json({ error: 'Invalid fileId' });

    try {
        const pdf = await readBlob(`signed/${fileId}.pdf`);
        if (pdf) {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Cache-Control', 'private, no-store');
            return res.status(200).end(pdf);
        }

        const link = await readBlob(`signed/${fileId}.json`);
        if (link) return res.status(200).json({ status: 'ready', ...JSON.parse(link.toString()) });

        res.status(200).json({ status: 'pending' });
    } catch (err) {
        console.error('Result Error:', err);
        res.status(500).json({ status: 'error', error: err.message });
    }
};
