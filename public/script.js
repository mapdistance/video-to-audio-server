// script.js - ফেসবুক অডিও কনভার্টার ফ্রন্টএন্ড লজিক
let selectedQuality = 'high';

// DOM এলিমেন্টস
const urlInput = document.getElementById('urlInput');
const convertBtn = document.getElementById('convertBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const result = document.getElementById('result');
const resultInfo = document.getElementById('resultInfo');
const downloadLink = document.getElementById('downloadLink');
const playLink = document.getElementById('playLink');
const errorBox = document.getElementById('error');

// কোয়ালিটি সিলেকশন
document.querySelectorAll('.quality-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedQuality = btn.dataset.quality;
    });
});

// কনভার্ট ফাংশন
async function convertVideo() {
    const url = urlInput.value.trim();
    
    // URL ভ্যালিডেশন
    if (!url) {
        showError('ফেসবুক ভিডিও লিংক পেস্ট করুন');
        return;
    }
    
    if (!url.includes('facebook.com') && !url.includes('fb.watch')) {
        showError('সঠিক ফেসবুক ভিডিও লিংক দিন');
        return;
    }
    
    // UI আপডেট
    convertBtn.disabled = true;
    convertBtn.textContent = '⏳ প্রসেসিং...';
    progressContainer.style.display = 'block';
    result.classList.remove('show');
    errorBox.classList.remove('show');
    progressFill.style.width = '0%';
    progressText.textContent = 'ফেসবুক ভিডিও ডাউনলোড হচ্ছে...';
    
    // প্রগ্রেস অ্যানিমেশন
    let progress = 0;
    const progressInterval = setInterval(() => {
        if (progress < 90) {
            progress += Math.random() * 5;
            if (progress > 90) progress = 90;
            progressFill.style.width = progress + '%';
        }
    }, 1000);
    
    try {
        const response = await fetch('/api/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: url,
                quality: selectedQuality,
                format: 'mp3'
            })
        });
        
        const data = await response.json();
        clearInterval(progressInterval);
        
        if (data.success) {
            progressFill.style.width = '100%';
            progressText.textContent = 'কনভার্শন সম্পন্ন!';
            
            setTimeout(() => {
                progressContainer.style.display = 'none';
                showResult(data);
            }, 1000);
        } else {
            showError(data.error || 'কনভার্শন ব্যর্থ হয়েছে');
        }
    } catch (err) {
        clearInterval(progressInterval);
        showError('সার্ভার ত্রুটি: ' + err.message);
    } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = '🎵 কনভার্ট';
    }
}

// রেজাল্ট দেখানো
function showResult(data) {
    const audio = data.audio;
    
    resultInfo.innerHTML = `
        <strong>ফাইল সাইজ:</strong> ${(audio.size / 1024 / 1024).toFixed(2)} MB<br>
        <strong>বিটরেট:</strong> ${audio.bitrate}<br>
        <strong>ফরম্যাট:</strong> ${audio.format.toUpperCase()}
    `;
    
    downloadLink.href = audio.downloadUrl;
    downloadLink.download = audio.fileName;
    playLink.href = audio.streamUrl;
    
    result.classList.add('show');
}

// এরর দেখানো
function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.add('show');
    progressContainer.style.display = 'none';
    
    setTimeout(() => {
        errorBox.classList.remove('show');
    }, 5000);
}

// Enter কী ইভেন্ট
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        convertVideo();
    }
});

// পেস্ট ইভেন্ট
urlInput.addEventListener('paste', (e) => {
    setTimeout(() => {
        // পেস্ট করা URL ক্লিন করুন
        urlInput.value = urlInput.value.trim();
    }, 100);
});
