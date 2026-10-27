/* ============================================
   Sign PDF - ACC | Vercel Ready
   ============================================ */

const state = { pdfFile: null, pdfBase64: null, ttdFile: null, ttdBase64: null };
const $ = (s) => document.querySelector(s);

const dom = {
    pdfUploadArea: $('#pdfUploadArea'), pdfInput: $('#pdfInput'),
    pdfInfo: $('#pdfInfo'), pdfName: $('#pdfName'), pdfSize: $('#pdfSize'),
    pdfRemove: $('#pdfRemove'), pdfPreview: $('#pdfPreview'), pdfIframe: $('#pdfIframe'),
    ttdUploadArea: $('#ttdUploadArea'), ttdInput: $('#ttdInput'),
    ttdInfo: $('#ttdInfo'), ttdName: $('#ttdName'), ttdSize: $('#ttdSize'),
    ttdRemove: $('#ttdRemove'), ttdPreview: $('#ttdPreview'), ttdImage: $('#ttdImage'),
    btnSubmit: $('#btnSubmit'), resultCard: $('#resultCard'),
    resultStatus: $('#resultStatus'), resultBody: $('#resultBody'),
    signedResult: $('#signedResult'), signedStatus: $('#signedStatus'),
    signedPreview: $('#signedPreview'), signedIframe: $('#signedIframe'), signedDownload: $('#signedDownload'),
    toastContainer: $('#toastContainer'),
};

// ===== CONFIG =====
const CFG = {
    proxyUrl: '/api/sign-pdf',
    resultUrl: '/api/result',
    pollIntervalMs: 5000, pollMaxTries: 60, // wait up to 5 minutes for the webhook
    namaPic: 'Vieri Sanjaya', noRegistration: '10019102276670',
    namaDocument: 'Test Dokumen', noDoc: '001_004_006_N_P', pageNo: 1,
    x1: 400, y1: 60, x2: 200, y2: 180,
};

const MAX_PDF = 5*1024*1024, MAX_TTD = 2*1024*1024;

// ===== UTILS =====
const fmt = (b) => b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(2)+' MB';
const toast = (m,t) => { const e=document.createElement('div'); e.className='toast '+t; e.textContent=m; dom.toastContainer.appendChild(e); setTimeout(()=>e.remove(),3600); };
const b64 = (f) => new Promise((ok,no)=>{ const r=new FileReader(); r.onload=()=>ok(r.result.split(',')[1]); r.onerror=()=>no(Error('Gagal baca file')); r.readAsDataURL(f); });
const ready = () => { dom.btnSubmit.disabled = !(state.pdfFile&&state.pdfBase64&&state.ttdFile&&state.ttdBase64); };

// =============================================
//  PDF UPLOAD
// =============================================
function handlePdfFile(file) {
    if (!file || file.type !== 'application/pdf') { toast('File harus PDF.', 'error'); return; }
    if (file.size > MAX_PDF) { toast('Ukuran PDF maksimal 5MB.', 'error'); return; }
    state.pdfFile = file;
    dom.pdfName.textContent = file.name;
    dom.pdfSize.textContent = fmt(file.size);
    dom.pdfInfo.style.display = 'flex';
    dom.pdfUploadArea.style.display = 'none';
    const url = URL.createObjectURL(file);
    dom.pdfIframe.src = url;
    dom.pdfPreview.style.display = 'block';
    b64(file).then(x => { state.pdfBase64 = x; ready(); });
    ready();
}
function removePdf() {
    state.pdfFile = state.pdfBase64 = null; dom.pdfInput.value = '';
    dom.pdfInfo.style.display = 'none'; dom.pdfUploadArea.style.display = '';
    dom.pdfPreview.style.display = 'none';
    if (dom.pdfIframe.src) { URL.revokeObjectURL(dom.pdfIframe.src); dom.pdfIframe.src = ''; }
    ready();
}
dom.pdfUploadArea.addEventListener('click', () => dom.pdfInput.click());
dom.pdfInput.addEventListener('change', e => { if (e.target.files[0]) handlePdfFile(e.target.files[0]); });
dom.pdfRemove.addEventListener('click', e => { e.stopPropagation(); removePdf(); });
['dragover','dragleave','drop'].forEach(ev => dom.pdfUploadArea.addEventListener(ev, e => {
    e.preventDefault();
    if (ev==='dragover') dom.pdfUploadArea.classList.add('drag-over');
    else if (ev==='dragleave') dom.pdfUploadArea.classList.remove('drag-over');
    else { dom.pdfUploadArea.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handlePdfFile(e.dataTransfer.files[0]); }
}));

// =============================================
//  TTD UPLOAD
// =============================================
function handleTtdFile(file) {
    if (!file) return;
    if (!['image/png','image/jpeg','image/jpg'].includes(file.type)) { toast('TTD harus PNG/JPG.', 'error'); return; }
    if (file.size > MAX_TTD) { toast('Ukuran TTD maksimal 2MB.', 'error'); return; }
    state.ttdFile = file;
    dom.ttdName.textContent = file.name;
    dom.ttdSize.textContent = fmt(file.size);
    dom.ttdInfo.style.display = 'flex';
    dom.ttdUploadArea.style.display = 'none';
    const url = URL.createObjectURL(file);
    dom.ttdImage.src = url;
    dom.ttdPreview.style.display = 'block';
    b64(file).then(x => { state.ttdBase64 = x; ready(); });
    ready();
}
function removeTtd() {
    state.ttdFile = state.ttdBase64 = null; dom.ttdInput.value = '';
    dom.ttdInfo.style.display = 'none'; dom.ttdUploadArea.style.display = '';
    dom.ttdPreview.style.display = 'none';
    if (dom.ttdImage.src) { URL.revokeObjectURL(dom.ttdImage.src); dom.ttdImage.src = ''; }
    ready();
}
dom.ttdUploadArea.addEventListener('click', () => dom.ttdInput.click());
dom.ttdInput.addEventListener('change', e => { if (e.target.files[0]) handleTtdFile(e.target.files[0]); });
dom.ttdRemove.addEventListener('click', e => { e.stopPropagation(); removeTtd(); });
['dragover','dragleave','drop'].forEach(ev => dom.ttdUploadArea.addEventListener(ev, e => {
    e.preventDefault();
    if (ev==='dragover') dom.ttdUploadArea.classList.add('drag-over');
    else if (ev==='dragleave') dom.ttdUploadArea.classList.remove('drag-over');
    else { dom.ttdUploadArea.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleTtdFile(e.dataTransfer.files[0]); }
}));

// =============================================
//  SIGNED RESULT → poll until the webhook has delivered the PDF
// =============================================
let pollTimer = null;

function resetSignedResult() {
    clearTimeout(pollTimer);
    dom.signedResult.style.display = 'none';
    dom.signedPreview.style.display = 'none';
    dom.signedDownload.style.display = 'none';
    if (dom.signedIframe.src.startsWith('blob:')) URL.revokeObjectURL(dom.signedIframe.src);
    dom.signedIframe.removeAttribute('src');
}

function setSignedStatus(text, type) {
    dom.signedStatus.className = 'result-status ' + type;
    dom.signedStatus.textContent = text;
}

function showSignedPdf(url, fileId) {
    dom.signedIframe.src = url;
    dom.signedDownload.href = url;
    dom.signedDownload.download = `signed-${fileId}.pdf`;
    dom.signedPreview.style.display = 'block';
    dom.signedDownload.style.display = 'inline-block';
    setSignedStatus('✅ PDF hasil tanda tangan sudah tersedia', 'success');
    toast('PDF hasil tanda tangan sudah tersedia!', 'success');
}

function pollSignedResult(fileId, attempt = 1) {
    dom.signedResult.style.display = 'block';
    setSignedStatus(`⏳ Menunggu hasil tanda tangan dari server… (${attempt}/${CFG.pollMaxTries})`, 'pending');

    pollTimer = setTimeout(async () => {
        try {
            const res = await fetch(`${CFG.resultUrl}?fileId=${encodeURIComponent(fileId)}`);
            if ((res.headers.get('content-type') || '').includes('application/pdf')) {
                return showSignedPdf(URL.createObjectURL(await res.blob()), fileId);
            }
            const data = await res.json();
            if (data.status === 'ready' && data.url) return showSignedPdf(data.url, fileId);
            if (data.status === 'error') throw new Error(data.error);
        } catch (err) {
            console.error('Poll error:', err);
        }
        if (attempt >= CFG.pollMaxTries) {
            return setSignedStatus('⚠️ Hasil belum diterima. Webhook dari server belum masuk — coba cek lagi nanti.', 'error');
        }
        pollSignedResult(fileId, attempt + 1);
    }, CFG.pollIntervalMs);
}

// =============================================
//  SUBMIT → via Vercel serverless proxy
// =============================================
dom.btnSubmit.addEventListener('click', async () => {
    const payload = {
        NAMA_PIC: CFG.namaPic,
        NO_REGISTRATION: CFG.noRegistration,
        list_doc: [{
            PATH_FILE: `data:application/pdf;base64,${state.pdfBase64}`,
            NAMA_DOCUMENT: CFG.namaDocument,
            NO_DOC: CFG.noDoc,
            coordinates: [{
                X1: CFG.x1, Y1: CFG.y1, X2: CFG.x2, Y2: CFG.y2,
                PAGE_NO: CFG.pageNo,
            }],
        }],
        file_ttd: { base64string: state.ttdBase64 },
    };

    // UI loading
    dom.btnSubmit.disabled = true;
    dom.btnSubmit.querySelector('.btn-text').style.display = 'none';
    dom.btnSubmit.querySelector('.btn-loader').style.display = 'inline-flex';
    dom.resultCard.style.display = 'none';
    resetSignedResult();

    try {
        const res = await fetch(CFG.proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await res.json();

        dom.resultCard.style.display = 'block';
        dom.resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

        if (result.ok) {
            dom.resultStatus.className = 'result-status success';
            dom.resultStatus.textContent = `✅ Terkirim — Status: ${result.status}`;
            toast('PDF terkirim, menunggu hasil tanda tangan…', 'success');
            const fileId = result.data?.data?.[0]?.fileId;
            if (fileId) pollSignedResult(fileId);
        } else {
            dom.resultStatus.className = 'result-status error';
            dom.resultStatus.textContent = `❌ Gagal — Status: ${result.status}`;
            toast(`Gagal: ${result.status}`, 'error');
        }
        dom.resultBody.textContent = JSON.stringify(result.data, null, 2);

    } catch (err) {
        dom.resultCard.style.display = 'block';
        dom.resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        dom.resultStatus.className = 'result-status error';
        dom.resultStatus.textContent = '❌ Error';
        dom.resultBody.textContent = err.stack || err.toString();
        toast('Gagal: ' + err.message, 'error');
        console.error(err);
    }

    dom.btnSubmit.disabled = false;
    dom.btnSubmit.querySelector('.btn-text').style.display = '';
    dom.btnSubmit.querySelector('.btn-loader').style.display = 'none';
});

// =============================================
//  INIT
// =============================================
ready();
console.log('✅ Sign PDF App siap! (Vercel mode)');
console.log('📡 Proxy:', CFG.proxyUrl);