/* ============================================
   Sign PDF — Client-Side PDF Signing
   pdf-lib + pdf.js, all in browser
   ============================================ */

const $ = s => document.querySelector(s);

const dom = {
    pdfRemove: $('#pdfRemove'),
    pdfUploadArea: $('#pdfUploadArea'), pdfInput: $('#pdfInput'),
    pdfInfo: $('#pdfInfo'), pdfName: $('#pdfName'), pdfSize: $('#pdfSize'),
    pdfPages: $('#pdfPages'), pdfRemoveCard: $('#pdfRemoveCard'),
    pdfPrev: $('#pdfPrev'), pdfNext: $('#pdfNext'),
    pdfPageIndicator: $('#pdfPageIndicator'),
    pdfCanvasWrapper: $('#pdfCanvasWrapper'), pdfCanvas: $('#pdfCanvas'),
    pdfCanvasContainer: $('#pdfCanvasContainer'),
    ttdOverlay: $('#ttdOverlay'), ttdOverlayImg: $('#ttdOverlayImg'),
    canvasHint: $('#canvasHint'),
    viewerEmpty: $('#viewerEmpty'), viewerContent: $('#viewerContent'),
    ttdUploadArea: $('#ttdUploadArea'), ttdInput: $('#ttdInput'),
    ttdInfo: $('#ttdInfo'), ttdName: $('#ttdName'), ttdSize: $('#ttdSize'),
    ttdRemove: $('#ttdRemove'), ttdScale: $('#ttdScale'), ttdScaleLabel: $('#ttdScaleLabel'),
    drawCanvas: $('#drawCanvas'), drawClear: $('#drawClear'), drawUse: $('#drawUse'),
    btnSign: $('#btnSign'), ttdPositionInfo: $('#ttdPositionInfo'),
    ttdPageLabel: $('#ttdPageLabel'), ttdPosX: $('#ttdPosX'), ttdPosY: $('#ttdPosY'),
    signedResult: $('#signedResult'), signedPreview: $('#signedPreview'),
    signedDownload: $('#signedDownload'), signHint: $('#signHint'),
    step1: $('#step1'), step2: $('#step2'), step3: $('#step3'),
    navStatus: $('#navStatus'), toastContainer: $('#toastContainer'),
};

const state = {
    pdfBytes: null, pdfDoc: null, totalPages: 0, currentPage: 1,
    pageRendering: false, ttdImageBytes: null, ttdImageUrl: null,
    ttdScale: 1.0, ttdPlaced: false, ttdPositions: {},
    ttdAspect: 0.3, ttdIsJpg: false, // aspect = tinggi/lebar gambar TTD

};
const MAX_PDF = 10*1024*1024, MAX_TTD = 2*1024*1024;

// ---- Utils ----
const fmt = b => b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(2)+' MB';
const toast = (m,t) => {
    const e = document.createElement('div'); e.className='toast '+t;
    e.textContent=m; dom.toastContainer.appendChild(e); setTimeout(()=>e.remove(),3500);
};
function setStep(n) {
    [dom.step1,dom.step2,dom.step3].forEach((s,i) => {
        s.classList.remove('active','done');
        if (i+1 < n) s.classList.add('done');
        else if (i+1 === n) s.classList.add('active');
    });
}
function setStatus(text, cls) {
    dom.navStatus.innerHTML = '<span class="status-dot '+cls+'"></span><span>'+text+'</span>';
}
function updateBtn() {
    const ready = !!(state.pdfBytes && state.ttdImageBytes && state.ttdPlaced);
    dom.btnSign.disabled = !ready;
    dom.signHint.textContent = !state.pdfBytes ? 'Mulai dengan membuka dokumen PDF.'
        : !state.ttdImageBytes ? 'Unggah atau gambar tanda tangan Anda.'
        : !state.ttdPlaced ? 'Klik di halaman untuk menentukan posisi tanda tangan.'
        : 'Posisi sudah ditentukan. Dokumen siap ditandatangani.';
}

// ---- PDF Upload & Render ----
async function handlePdfFile(file) {
    if (!file || file.type !== 'application/pdf') { toast('File harus PDF.','error'); return; }
    if (file.size > MAX_PDF) { toast('PDF maksimal 10MB.','error'); return; }
    const buf = await file.arrayBuffer();
    // Copy bytes safely — avoid detached buffer issues
    const bytes = new Uint8Array(buf);
    state.pdfBytes = bytes.slice(); // defensive copy
    state.currentPage=1; state.ttdPositions={}; state.ttdPlaced=false;
    dom.pdfName.textContent=file.name; dom.pdfSize.textContent=fmt(file.size);
    dom.pdfInfo.style.display='flex'; dom.pdfUploadArea.style.display='none';
    if (state.pdfDoc) { await state.pdfDoc.destroy(); }
    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
        state.pdfDoc = await pdfjsLib.getDocument({ data: state.pdfBytes.slice() }).promise;
        state.totalPages = state.pdfDoc.numPages;
    } catch(e) {
        console.error('pdf.js parse error:', e);
        toast('Gagal membaca PDF. Pastikan file tidak rusak atau terproteksi.','error');
        removePdf(); return;
    }
    dom.pdfPages.textContent = state.totalPages + ' hlm';
    dom.viewerEmpty.style.display='none'; dom.viewerContent.style.display='flex';
    setStep(2); setStatus('Siap','ready'); updateTtdOverlay(); renderPage(1); updateBtn();
    toast('Dokumen dibuka, '+state.totalPages+' halaman.','success');
}

function removePdf() {
    dom.pdfInput.value=''; dom.pdfInfo.style.display='none'; dom.pdfUploadArea.style.display='';
    dom.viewerContent.style.display='none'; dom.viewerEmpty.style.display='flex';
    state.pdfBytes=null; state.pdfDoc=null; state.totalPages=0; state.ttdPlaced=false;
    dom.ttdOverlayImg.style.display='none'; setStep(1); setStatus('Siap','ready'); updateBtn();
}

async function renderPage(pageNum) {
    if (!state.pdfDoc || state.pageRendering) return;
    state.pageRendering=true; state.currentPage=pageNum;
    dom.pdfPageIndicator.textContent = 'Hal '+pageNum+' / '+state.totalPages;
    dom.ttdPageLabel.textContent=pageNum;
    const page = await state.pdfDoc.getPage(pageNum);
    const vp = page.getViewport({ scale: 1.5 });
    dom.pdfCanvas.width=vp.width; dom.pdfCanvas.height=vp.height;
    await page.render({ canvasContext: dom.pdfCanvas.getContext('2d'), viewport: vp }).promise;
    updateTtdOverlay(); state.pageRendering=false;
}

function updateTtdOverlay() {
    const pos = state.ttdPositions[state.currentPage];
    if (pos && state.ttdImageUrl) {
        dom.ttdOverlayImg.src=state.ttdImageUrl;
        dom.ttdOverlayImg.style.display='block';
        dom.ttdOverlayImg.style.width=(200*state.ttdScale)+'px';
        dom.ttdOverlayImg.style.left=pos.x+'px'; dom.ttdOverlayImg.style.top=pos.y+'px';
        dom.ttdOverlay.style.display='block'; state.ttdPlaced=true;
        dom.ttdPositionInfo.style.display='flex';
        dom.ttdPosX.textContent=Math.round(pos.x); dom.ttdPosY.textContent=Math.round(pos.y);
        dom.canvasHint.textContent='Klik atau seret tanda tangan untuk memindahkannya';
    } else {
        dom.ttdOverlayImg.style.display='none'; dom.ttdOverlay.style.display='none';
        dom.ttdPositionInfo.style.display='none';
        dom.canvasHint.textContent='Klik pada halaman untuk menempatkan tanda tangan';
    }
}

function getCanvasPos(e) {
    const r = dom.pdfCanvas.getBoundingClientRect();
    const w = 200*state.ttdScale, h = w*state.ttdAspect;
    return { x: e.clientX-r.left-w/2, y: e.clientY-r.top-h/2 };
}

dom.pdfCanvas.addEventListener('click', e => {
    if (!state.ttdImageUrl) { toast('Siapkan tanda tangan dulu di panel kanan.','warning'); return; }
    state.ttdPositions[state.currentPage]=getCanvasPos(e);
    state.ttdPlaced=true; updateTtdOverlay(); updateBtn(); setStep(3);
});

let dragging=false;
dom.ttdOverlayImg.addEventListener('mousedown',e=>{e.preventDefault();dragging=true;});
document.addEventListener('mousemove',e=>{if(!dragging)return;state.ttdPositions[state.currentPage]=getCanvasPos(e);updateTtdOverlay();});
document.addEventListener('mouseup',()=>{dragging=false;});
dom.ttdOverlayImg.addEventListener('touchstart',e=>{e.preventDefault();dragging=true;},{passive:false});
document.addEventListener('touchmove',e=>{if(!dragging)return;state.ttdPositions[state.currentPage]=getCanvasPos(e.touches[0]);updateTtdOverlay();},{passive:false});
document.addEventListener('touchend',()=>{dragging=false;});

dom.pdfPrev.addEventListener('click',()=>{if(state.currentPage>1)renderPage(state.currentPage-1);});
dom.pdfNext.addEventListener('click',()=>{if(state.currentPage<state.totalPages)renderPage(state.currentPage+1);});
dom.pdfUploadArea.addEventListener('click',()=>dom.pdfInput.click());
dom.pdfInput.addEventListener('change',e=>{if(e.target.files[0])handlePdfFile(e.target.files[0]);});
dom.pdfRemoveCard.addEventListener('click',e=>{e.stopPropagation();removePdf();});
dom.pdfRemove.addEventListener('click',removePdf);
['dragover','dragleave','drop'].forEach(ev=>dom.pdfUploadArea.addEventListener(ev,e=>{
    e.preventDefault();
    if(ev==='dragover')dom.pdfUploadArea.classList.add('drag-over');
    else if(ev==='dragleave')dom.pdfUploadArea.classList.remove('drag-over');
    else{dom.pdfUploadArea.classList.remove('drag-over');if(e.dataTransfer.files[0])handlePdfFile(e.dataTransfer.files[0]);}
}));

// ---- TTD Upload ----
const imgAspect = url => new Promise(r => {
    const i = new Image();
    i.onload = () => r(i.naturalWidth ? i.naturalHeight/i.naturalWidth : 0.3);
    i.onerror = () => r(0.3);
    i.src = url;
});

// ---- Auto Remove Background (color-distance based) ----
function removeWhiteBackground(imageEl) {
    const canvas = document.createElement('canvas');
    const w = imageEl.naturalWidth, h = imageEl.naturalHeight;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageEl, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const len = data.length;

    // 1. Auto-detect background color (sample 4 corners + edges)
    const samples = [
        [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
        [Math.floor(w / 2), 0], [Math.floor(w / 2), h - 1],
        [0, Math.floor(h / 2)], [w - 1, Math.floor(h / 2)]
    ];
    let bgR = 0, bgG = 0, bgB = 0;
    for (const [sx, sy] of samples) {
        const idx = (Math.min(sy, h - 1) * w + Math.min(sx, w - 1)) * 4;
        bgR += data[idx]; bgG += data[idx + 1]; bgB += data[idx + 2];
    }
    bgR = Math.round(bgR / samples.length);
    bgG = Math.round(bgG / samples.length);
    bgB = Math.round(bgB / samples.length);

    // 2. Hard cutoff: hapus warna dekat background, sisakan tinta hitam gelap
    const threshold = 45; // color distance cutoff
    for (let i = 0; i < len; i += 4) {
        const dr = data[i] - bgR, dg = data[i + 1] - bgG, db = data[i + 2] - bgB;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);

        if (dist < threshold) {
            // Background → fully transparent
            data[i] = data[i + 1] = data[i + 2] = 0;
            data[i + 3] = 0;
        } else {
            // Signature ink → opaque, hitamkan
            data[i] = data[i + 1] = data[i + 2] = 0;
            data[i + 3] = 255;
        }
    }
    ctx.putImageData(imageData, 0, 0);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function handleTtdFile(file) {
    if(!file)return;
    if(!['image/png','image/jpeg','image/jpg'].includes(file.type)){toast('TTD harus PNG/JPG.','error');return;}
    if(file.size>MAX_TTD){toast('TTD maksimal 2MB.','error');return;}

    // Load sebagai Image untuk proses remove background
    const img = new Image();
    const imgUrl = URL.createObjectURL(file);
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = imgUrl; });
    URL.revokeObjectURL(imgUrl);

    // Auto remove background
    const processedBlob = await removeWhiteBackground(img);
    const buf = await processedBlob.arrayBuffer();
    state.ttdImageBytes = new Uint8Array(buf);
    if(state.ttdImageUrl) URL.revokeObjectURL(state.ttdImageUrl);
    state.ttdImageUrl = URL.createObjectURL(processedBlob);
    state.ttdAspect = img.naturalHeight / img.naturalWidth;
    state.ttdIsJpg = false;

    dom.ttdName.textContent=file.name;dom.ttdSize.textContent=fmt(file.size);
    dom.ttdInfo.style.display='flex';dom.ttdUploadArea.style.display='none';
    state.ttdPositions={};state.ttdPlaced=false;updateTtdOverlay();updateBtn();
    toast('Tanda tangan siap. Klik halaman untuk menempatkannya.','success');
}
function removeTtd() {
    dom.ttdInput.value='';dom.ttdInfo.style.display='none';dom.ttdUploadArea.style.display='';
    if(state.ttdImageUrl)URL.revokeObjectURL(state.ttdImageUrl);
    state.ttdImageBytes=null;state.ttdImageUrl=null;state.ttdPositions={};state.ttdPlaced=false;
    updateTtdOverlay();updateBtn();setStep(state.pdfBytes?2:1);
}
dom.ttdUploadArea.addEventListener('click',()=>dom.ttdInput.click());
dom.ttdInput.addEventListener('change',e=>{if(e.target.files[0])handleTtdFile(e.target.files[0]);});
dom.ttdRemove.addEventListener('click',e=>{e.stopPropagation();removeTtd();});
['dragover','dragleave','drop'].forEach(ev=>dom.ttdUploadArea.addEventListener(ev,e=>{
    e.preventDefault();
    if(ev==='dragover')dom.ttdUploadArea.classList.add('drag-over');
    else if(ev==='dragleave')dom.ttdUploadArea.classList.remove('drag-over');
    else{dom.ttdUploadArea.classList.remove('drag-over');if(e.dataTransfer.files[0])handleTtdFile(e.dataTransfer.files[0]);}
}));
dom.ttdScale.addEventListener('input',()=>{state.ttdScale=parseInt(dom.ttdScale.value)/100;dom.ttdScaleLabel.textContent=Math.round(state.ttdScale*100)+'%';updateTtdOverlay();});

// ---- TTD Draw ----
const drawCtx=dom.drawCanvas.getContext('2d');let drawPainting=false;
function initDraw(){drawCtx.clearRect(0,0,dom.drawCanvas.width,dom.drawCanvas.height);drawCtx.strokeStyle='#0f172a';drawCtx.lineWidth=4;drawCtx.lineCap='round';drawCtx.lineJoin='round';}

function getDrawPos(e) {
    const rect = dom.drawCanvas.getBoundingClientRect();
    const scaleX = dom.drawCanvas.width / rect.width;   // canvas pixel ratio
    const scaleY = dom.drawCanvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

function ds(e){e.preventDefault();drawPainting=true;const p=getDrawPos(e);drawCtx.beginPath();drawCtx.moveTo(p.x,p.y);}
function dm(e){if(!drawPainting)return;const p=getDrawPos(e);drawCtx.lineTo(p.x,p.y);drawCtx.stroke();}
function de(){drawPainting=false;drawCtx.closePath();}
async function useDraw(){
    const blob=await new Promise(r=>dom.drawCanvas.toBlob(r,'image/png'));
    const buf=await blob.arrayBuffer();state.ttdImageBytes=new Uint8Array(buf);
    if(state.ttdImageUrl)URL.revokeObjectURL(state.ttdImageUrl);
    state.ttdImageUrl=URL.createObjectURL(blob);
    state.ttdAspect=dom.drawCanvas.height/dom.drawCanvas.width; state.ttdIsJpg=false;
    state.ttdPositions={};state.ttdPlaced=false;updateTtdOverlay();updateBtn();
    toast('Tanda tangan siap. Klik halaman untuk menempatkannya.','success');
    document.querySelector('.ttd-tab[data-tab="upload"]').click();
}
dom.drawCanvas.addEventListener('mousedown',ds);dom.drawCanvas.addEventListener('mousemove',dm);
dom.drawCanvas.addEventListener('mouseup',de);dom.drawCanvas.addEventListener('mouseleave',de);
dom.drawCanvas.addEventListener('touchstart',e=>{e.preventDefault();const t=e.touches[0];dom.drawCanvas.dispatchEvent(new MouseEvent('mousedown',{clientX:t.clientX,clientY:t.clientY}));},{passive:false});
dom.drawCanvas.addEventListener('touchmove',e=>{e.preventDefault();const t=e.touches[0];dom.drawCanvas.dispatchEvent(new MouseEvent('mousemove',{clientX:t.clientX,clientY:t.clientY}));},{passive:false});
dom.drawCanvas.addEventListener('touchend',e=>{e.preventDefault();dom.drawCanvas.dispatchEvent(new MouseEvent('mouseup'));});
initDraw();dom.drawClear.addEventListener('click',()=>{initDraw();toast('Area gambar dikosongkan.','info');});
dom.drawUse.addEventListener('click',useDraw);

// ---- Tabs ----
document.querySelectorAll('.ttd-tab').forEach(tab=>{tab.addEventListener('click',()=>{
    document.querySelectorAll('.ttd-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.ttd-tab-content').forEach(c=>c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab'+tab.dataset.tab.charAt(0).toUpperCase()+tab.dataset.tab.slice(1)).classList.add('active');
});});

// ---- SIGN PDF ----
dom.btnSign.addEventListener('click',async()=>{
    if(!state.pdfBytes||!state.ttdImageBytes)return;
    dom.btnSign.disabled=true;dom.btnSign.innerHTML='<span class="spinner"></span> Memproses…';dom.signedResult.style.display='none';
    setStatus('Memproses','processing');
    try{
        const {PDFDocument}=PDFLib;
        const pdfDoc=await PDFDocument.load(state.pdfBytes);
        const pages=pdfDoc.getPages();
        const ttdImage=state.ttdIsJpg?await pdfDoc.embedJpg(state.ttdImageBytes):await pdfDoc.embedPng(state.ttdImageBytes);
        for(let pg=1;pg<=pages.length;pg++){
            const pos=state.ttdPositions[pg];if(!pos)continue;
            const page=pages[pg-1];
            // skala per halaman, karena ukuran tiap halaman bisa berbeda
            const vp=(await state.pdfDoc.getPage(pg)).getViewport({scale:1.5});
            const pw=page.getSize().width,ph=page.getSize().height;
            const sx=pw/vp.width,sy=ph/vp.height;
            const tw=200*state.ttdScale*sx,th=tw*(ttdImage.height/ttdImage.width);
            page.drawImage(ttdImage,{x:pos.x*sx,y:ph-(pos.y*sy)-th,width:tw,height:th,opacity:1});
        }
        const signedBytes=await pdfDoc.save();
        const blob=new Blob([signedBytes],{type:'application/pdf'});
        const url=URL.createObjectURL(blob);
        dom.signedPreview.innerHTML='<iframe src="'+url+'" style="width:100%;height:260px;border:none;border-radius:6px;"></iframe>';
        dom.signedDownload.href=url;dom.signedDownload.download='signed-document.pdf';
        dom.signedResult.style.display='block';dom.signedResult.scrollIntoView({behavior:'smooth',block:'center'});
        setStatus('Selesai','ready');toast('Dokumen berhasil ditandatangani.','success');
    }catch(err){console.error(err);toast('Gagal menandatangani: '+err.message,'error');setStatus('Error','ready');}
    dom.btnSign.disabled=false;dom.btnSign.textContent='Tanda tangani dokumen';
});

// ---- Init ----
setStep(1);setStatus('Siap','ready');updateBtn();
[dom.pdfUploadArea,dom.ttdUploadArea].forEach(z=>z.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();z.click();}}));