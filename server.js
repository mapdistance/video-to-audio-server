// server.js - সব ধরনের ফেসবুক ভিডিও URL থেকে অডিও কনভার্টার
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const axios = require('axios');
require('dotenv').config();

// FFmpeg পাথ সেটআপ
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const app = express();
const PORT = process.env.PORT || 3000;

// ফোল্ডার সেটআপ
const uploadDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'outputs');
fs.ensureDirSync(uploadDir);
fs.ensureDirSync(outputDir);

// মিডলওয়্যার
app.use(cors());
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/outputs', express.static(outputDir));

// ============ ফেসবুক URL হ্যান্ডলিং ============

// সব ধরনের ফেসবুক URL প্যাটার্ন
const FACEBOOK_URL_PATTERNS = {
    // নতুন Share URL (সবচেয়ে গুরুত্বপূর্ণ)
    shareVideo: /facebook\.com\/share\/v\/[a-zA-Z0-9]+\/?/i,
    shareReel: /facebook\.com\/share\/r\/[a-zA-Z0-9]+\/?/i,
    sharePost: /facebook\.com\/share\/p\/[a-zA-Z0-9]+\/?/i,
    shareGeneral: /facebook\.com\/share\/[a-zA-Z0-9]+\/?/i,
    
    // Watch URL
    watch: /facebook\.com\/watch\/?\?v=\d+/i,
    watchAlt: /facebook\.com\/watch\/\d+\/?/i,
    
    // Video URL
    video: /facebook\.com\/.*\/videos\/\d+\/?/i,
    videoAlt: /facebook\.com\/.*\/videos\/\d+\/.*/i,
    
    // Reel URL
    reel: /facebook\.com\/reel\/[a-zA-Z0-9]+\/?/i,
    
    // Short URL
    fbWatch: /fb\.watch\/[a-zA-Z0-9_-]+\/?/i,
    
    // Story URL
    story: /facebook\.com\/story\.php\?story_fbid=\d+.*/i,
    
    // Group Video
    groupVideo: /facebook\.com\/groups\/.*\/posts\/\d+\/?/i,
    
    // Page Video
    pageVideo: /facebook\.com\/.*\/posts\/\d+\/?/i,
    pageVideoAlt: /facebook\.com\/.*\/videos\/\d+\/?/i,
    
    // Mobile URL
    mobileVideo: /m\.facebook\.com\/.*\/videos\/\d+\/?/i,
    mobileWatch: /m\.facebook\.com\/watch\/?\?v=\d+/i,
    
    // Live Video
    liveVideo: /facebook\.com\/.*\/live\/?/i,
    
    // Photo/Video Album
    albumVideo: /facebook\.com\/.*\/photos\/.*\?video.*/i
};

// URL ভ্যালিডেশন ফাংশন
function isValidFacebookUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    // URL ডিকোড করুন
    url = decodeURIComponent(url.trim());
    
    // facebook.com বা fb.watch থাকতে হবে
    if (!url.includes('facebook.com') && !url.includes('fb.watch')) {
        return false;
    }
    
    // সব প্যাটার্ন চেক করুন
    for (const [key, pattern] of Object.entries(FACEBOOK_URL_PATTERNS)) {
        if (pattern.test(url)) {
            console.log(`✅ URL প্যাটার্ন মিলেছে: ${key}`);
            return true;
        }
    }
    
    // সাধারণ facebook.com URL চেক
    if (url.includes('facebook.com') || url.includes('fb.watch')) {
        console.log('✅ সাধারণ ফেসবুক URL');
        return true;
    }
    
    return false;
}

// ফেসবুক URL ক্লিনিং
function cleanFacebookUrl(url) {
    url = url.trim();
    
    // URL ডিকোড
    url = decodeURIComponent(url);
    
    // ট্র্যাকিং প্যারামিটার বাদ দিন
    url = url.split('?')[0].split('#')[0];
    
    // শেষের স্ল্যাশ যোগ করুন
    if (!url.endsWith('/')) {
        url += '/';
    }
    
    return url;
}

// ফেসবুক ভিডিও ডাউনলোড (yt-dlp ব্যবহার করে)
async function downloadFacebookVideo(facebookUrl) {
    try {
        const videoId = uuidv4();
        const videoPath = path.join(uploadDir, `fb_${videoId}.mp4`);
        
        console.log('📥 ভিডিও ডাউনলোড শুরু:', facebookUrl);
        
        // yt-dlp কমান্ড - সব ফরম্যাট সাপোর্ট
        const command = `yt-dlp \
            --no-playlist \
            --no-check-certificate \
            --force-ipv4 \
            --format "best[ext=mp4]/best" \
            --output "${videoPath}" \
            --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
            --add-header "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
            --add-header "Accept-Language: en-US,en;q=0.5" \
            --add-header "Accept-Encoding: gzip, deflate" \
            "${facebookUrl}"`;
        
        await execPromise(command, {
            maxBuffer: 1024 * 1024 * 10,
            timeout: 300000 // 5 মিনিট
        });
        
        // ডাউনলোড করা ফাইল খুঁজুন
        const files = fs.readdirSync(uploadDir);
        const downloadedFile = files.find(f => f.includes(videoId));
        
        if (downloadedFile) {
            const finalPath = path.join(uploadDir, downloadedFile);
            console.log('✅ ভিডিও ডাউনলোড সম্পন্ন:', finalPath);
            return finalPath;
        }
        
        throw new Error('ভিডিও ডাউনলোড ব্যর্থ');
        
    } catch (error) {
        console.error('❌ ডাউনলোড ত্রুটি:', error);
        
        // বিকল্প পদ্ধতি: youtube-dl চেষ্টা করুন
        try {
            console.log('🔄 বিকল্প পদ্ধতি চেষ্টা করা হচ্ছে...');
            const videoId = uuidv4();
            const videoPath = path.join(uploadDir, `fb_${videoId}.mp4`);
            
            const command = `youtube-dl \
                --no-playlist \
                --format "best[ext=mp4]/best" \
                --output "${videoPath}" \
                "${facebookUrl}"`;
            
            await execPromise(command, {
                maxBuffer: 1024 * 1024 * 10,
                timeout: 300000
            });
            
            if (fs.existsSync(videoPath)) {
                console.log('✅ বিকল্প ডাউনলোড সম্পন্ন');
                return videoPath;
            }
        } catch (altError) {
            console.error('❌ বিকল্প ডাউনলোডও ব্যর্থ:', altError);
        }
        
        throw new Error('ফেসবুক ভিডিও ডাউনলোড করা যায়নি। ভিডিওটি পাবলিক কিনা চেক করুন।');
    }
}

// ভিডিও থেকে MP3 কনভার্ট
async function convertToMP3(videoPath, quality = 'high') {
    try {
        const outputFileName = `fb_audio_${Date.now()}.mp3`;
        const outputPath = path.join(outputDir, outputFileName);
        
        const bitrates = {
            low: '128k',
            medium: '192k',
            high: '320k'
        };
        
        const bitrate = bitrates[quality] || '192k';
        
        console.log('🎵 MP3 কনভার্শন শুরু...');
        
        await new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .noVideo()
                .audioCodec('libmp3lame')
                .audioBitrate(bitrate)
                .audioChannels(2)
                .audioFrequency(44100)
                .format('mp3')
                .on('start', (commandLine) => {
                    console.log('FFmpeg:', commandLine.substring(0, 100) + '...');
                })
                .on('progress', (progress) => {
                    if (progress.percent) {
                        console.log(`🔄 প্রসেসিং: ${progress.percent.toFixed(1)}%`);
                    }
                })
                .on('end', () => {
                    console.log('✅ কনভার্শন সম্পন্ন');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('❌ কনভার্শন ত্রুটি:', err);
                    reject(err);
                })
                .save(outputPath);
        });
        
        return {
            fileName: outputFileName,
            filePath: outputPath,
            size: fs.statSync(outputPath).size,
            bitrate: bitrate
        };
        
    } catch (error) {
        console.error('❌ MP3 কনভার্শন ত্রুটি:', error);
        throw new Error('MP3 কনভার্ট করা যায়নি');
    }
}

// ============ API রাউটস ============

// হোম পেজ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// হেলথ চেক
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        supportedUrls: Object.keys(FACEBOOK_URL_PATTERNS)
    });
});

// ফেসবুক ভিডিও থেকে অডিও কনভার্ট API
app.post('/api/convert', async (req, res) => {
    let videoPath = null;
    let outputPath = null;
    
    try {
        const { url, quality = 'high', format = 'mp3' } = req.body;
        
        console.log('==========================================');
        console.log('🎵 নতুন কনভার্শন রিকোয়েস্ট');
        console.log('📝 URL:', url);
        console.log('⚙️ কোয়ালিটি:', quality);
        console.log('==========================================');
        
        // URL ভ্যালিডেশন
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'ফেসবুক ভিডিও URL দিন'
            });
        }
        
        // URL ক্লিন করুন
        const cleanedUrl = cleanFacebookUrl(url);
        console.log('🔗 ক্লিন URL:', cleanedUrl);
        
        // ভ্যালিডেশন চেক
        if (!isValidFacebookUrl(cleanedUrl)) {
            return res.status(400).json({
                success: false,
                error: 'সঠিক ফেসবুক ভিডিও URL দিন। শেয়ার লিংক কপি করুন।'
            });
        }
        
        // ভিডিও ডাউনলোড
        videoPath = await downloadFacebookVideo(cleanedUrl);
        
        // MP3 কনভার্ট
        const audioInfo = await convertToMP3(videoPath, quality);
        outputPath = audioInfo.filePath;
        
        // ভিডিও ফাইল ডিলিট
        if (videoPath) {
            fs.remove(videoPath).catch(() => {});
        }
        
        // রেসপন্স
        res.json({
            success: true,
            message: 'অডিও কনভার্ট সম্পন্ন',
            audio: {
                fileName: audioInfo.fileName,
                downloadUrl: `/outputs/${audioInfo.fileName}`,
                streamUrl: `/api/stream/${audioInfo.fileName}`,
                size: audioInfo.size,
                bitrate: audioInfo.bitrate,
                format: format
            }
        });
        
        // ১০ মিনিট পর অডিও ফাইল ডিলিট
        setTimeout(() => {
            if (outputPath) {
                fs.remove(outputPath).catch(() => {});
            }
        }, 600000);
        
    } catch (error) {
        console.error('❌ কনভার্শন ব্যর্থ:', error);
        
        // ক্লিনআপ
        if (videoPath) {
            fs.remove(videoPath).catch(() => {});
        }
        if (outputPath) {
            fs.remove(outputPath).catch(() => {});
        }
        
        res.status(500).json({
            success: false,
            error: error.message || 'কনভার্শন ব্যর্থ হয়েছে। ভিডিওটি পাবলিক কিনা চেক করুন।'
        });
    }
});

// ভিডিও ইনফো API
app.post('/api/video-info', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url || !isValidFacebookUrl(url)) {
            return res.status(400).json({
                success: false,
                error: 'সঠিক ফেসবুক ভিডিও URL দিন'
            });
        }
        
        const cleanedUrl = cleanFacebookUrl(url);
        
        console.log('📊 ভিডিও ইনফো ফেচ হচ্ছে:', cleanedUrl);
        
        const command = `yt-dlp --dump-json --no-playlist "${cleanedUrl}"`;
        const { stdout } = await execPromise(command, { timeout: 60000 });
        const videoInfo = JSON.parse(stdout);
        
        res.json({
            success: true,
            info: {
                title: videoInfo.title || 'ফেসবুক ভিডিও',
                duration: videoInfo.duration || 0,
                uploader: videoInfo.uploader || 'Unknown',
                thumbnail: videoInfo.thumbnail || '',
                description: videoInfo.description?.substring(0, 200) || ''
            }
        });
        
    } catch (error) {
        console.error('❌ ভিডিও ইনফো ত্রুটি:', error);
        res.status(500).json({
            success: false,
            error: 'ভিডিও তথ্য পাওয়া যায়নি'
        });
    }
});

// অডিও ডাউনলোড API
app.get('/api/download/:fileName', (req, res) => {
    const filePath = path.join(outputDir, req.params.fileName);
    
    if (fs.existsSync(filePath)) {
        res.download(filePath, `facebook-audio-${Date.now()}.mp3`, (err) => {
            if (err) {
                console.error('❌ ডাউনলোড ত্রুটি:', err);
            }
            setTimeout(() => {
                fs.remove(filePath).catch(() => {});
            }, 60000);
        });
    } else {
        res.status(404).json({
            success: false,
            error: 'ফাইল পাওয়া যায়নি'
        });
    }
});

// অডিও স্ট্রিম API
app.get('/api/stream/:fileName', (req, res) => {
    const filePath = path.join(outputDir, req.params.fileName);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            error: 'ফাইল পাওয়া যায়নি'
        });
    }
    
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'audio/mpeg',
        };
        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'audio/mpeg',
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
    }
});

// সাপোর্টেড URL প্যাটার্ন API
app.get('/api/supported-urls', (req, res) => {
    res.json({
        success: true,
        supportedPatterns: [
            {
                type: 'Share Video',
                example: 'https://www.facebook.com/share/v/14wESMXunvx/',
                pattern: 'facebook.com/share/v/...'
            },
            {
                type: 'Share Reel',
                example: 'https://www.facebook.com/share/r/abcdef/',
                pattern: 'facebook.com/share/r/...'
            },
            {
                type: 'Share Post',
                example: 'https://www.facebook.com/share/p/abcdef/',
                pattern: 'facebook.com/share/p/...'
            },
            {
                type: 'Watch',
                example: 'https://www.facebook.com/watch/?v=123456789',
                pattern: 'facebook.com/watch/?v=...'
            },
            {
                type: 'Video',
                example: 'https://www.facebook.com/username/videos/123456789/',
                pattern: 'facebook.com/.../videos/...'
            },
            {
                type: 'Reel',
                example: 'https://www.facebook.com/reel/abcdef/',
                pattern: 'facebook.com/reel/...'
            },
            {
                type: 'Short URL',
                example: 'https://fb.watch/abcdef/',
                pattern: 'fb.watch/...'
            },
            {
                type: 'Story',
                example: 'https://www.facebook.com/story.php?story_fbid=123',
                pattern: 'facebook.com/story.php?...'
            },
            {
                type: 'Mobile',
                example: 'https://m.facebook.com/watch/?v=123',
                pattern: 'm.facebook.com/...'
            }
        ]
    });
});

// 404 হ্যান্ডলিং
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'রুট পাওয়া যায়নি'
    });
});

// এরর হ্যান্ডলিং
app.use((err, req, res, next) => {
    console.error('❌ সার্ভার ত্রুটি:', err);
    res.status(500).json({
        success: false,
        error: 'সার্ভার ত্রুটি: ' + err.message
    });
});

// সার্ভার শুরু
app.listen(PORT, () => {
    console.log('==========================================');
    console.log('🎵 ফেসবুক ভিডিও থেকে অডিও কনভার্টার v2.0');
    console.log('==========================================');
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`📁 ডাউনলোড ফোল্ডার: ${uploadDir}`);
    console.log(`📁 আউটপুট ফোল্ডার: ${outputDir}`);
    console.log('');
    console.log('✅ সাপোর্টেড URL টাইপ:');
    console.log('   • facebook.com/share/v/...');
    console.log('   • facebook.com/share/r/...');
    console.log('   • facebook.com/share/p/...');
    console.log('   • facebook.com/watch/?v=...');
    console.log('   • facebook.com/.../videos/...');
    console.log('   • facebook.com/reel/...');
    console.log('   • fb.watch/...');
    console.log('   • m.facebook.com/...');
    console.log('==========================================');
    console.log('✅ সার্ভার চালু হয়েছে');
    console.log('==========================================');
});