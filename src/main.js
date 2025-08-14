import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

class FFmpegDemo {
    constructor() {
        this.ffmpeg = null;
        this.originalFile = null;
        this.isConverting = false;
        this.startTime = null;
        this.mediaSource = null;
        this.sourceBuffer = null;
        this.supportedMimeType = null;
        this.streamQueue = [];
        this.isStreaming = false;
        this.performanceMetrics = {
            conversionTime: 0,
            originalSize: 0,
            convertedSize: 0,
            memoryUsage: 0
        };
        
        // 调试设置
        this.debugMode = this.getDebugMode();
        
        // 增强的状态监控
        this.bufferMonitor = {
            totalChunksAdded: 0,
            totalChunksProcessed: 0,
            totalBytesProcessed: 0,
            lastErrorTime: null,
            consecutiveErrors: 0,
            bufferHealth: 'good',
            lastBufferCheck: Date.now()
        };
        
        // 性能监控定时器
        this.performanceMonitor = null;
        
        // 先设置事件监听器，确保 UI 响应
        this.setupEventListeners();
        this.log('FFmpeg WASM Demo 开始初始化');
        if (this.debugMode) {
            this.log('调试模式已启用', 'debug');
        }
        
        // 异步初始化 FFmpeg
        this.initFFmpeg();
    }

    async init() {
        await this.initFFmpeg();
        this.setupEventListeners();
        this.log('FFmpeg WASM Demo 初始化完成');
    }

    async initFFmpeg() {
        this.log('正在加载 FFmpeg WASM...');
        try {
            this.ffmpeg = new FFmpeg();
            
            // 设置日志和进度回调
            this.ffmpeg.on('log', (data) => {
                this.log(`FFmpeg: ${data.message}`);
            });
            
            this.ffmpeg.on('progress', (progress) => {
                this.updateProgress(progress);
            });
            
            await this.ffmpeg.load({
                corePath: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js'
            });
            
            this.log('FFmpeg WASM 加载完成');
            
            // 如果已经有文件选择，启用转码按钮
            if (this.originalFile) {
                document.getElementById('convertBtn').disabled = false;
                this.log('转码功能已启用');
            }
        } catch (error) {
            this.log(`FFmpeg WASM 加载失败: ${error.message}`, 'error');
            console.error('FFmpeg 加载失败:', error);
            // 即使 FFmpeg 加载失败，也启用基本的文件上传功能
            this.log('文件上传功能已启用，但转码功能可能不可用', 'warning');
        }
    }

    // 检查 FFmpeg 文件系统状态
    async checkFilesystemHealth() {
        try {
            // 尝试创建一个测试文件来验证文件系统
            const testFilename = 'test_fs_health.tmp';
            const testData = new Uint8Array([1, 2, 3, 4, 5]);
            
            await this.ffmpeg.writeFile(testFilename, testData);
            await this.ffmpeg.deleteFile(testFilename);
            
            this.log('FFmpeg 文件系统健康检查通过');
            return true;
        } catch (error) {
            this.log(`FFmpeg 文件系统健康检查失败: ${error.message}`, 'error');
            return false;
        }
    }

    // 获取调试模式设置
    getDebugMode() {
        // 检查 URL 参数
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('debug')) {
            return urlParams.get('debug') === 'true';
        }
        
        // 检查本地存储
        try {
            const savedDebugMode = localStorage.getItem('ffmpeg-debug-mode');
            if (savedDebugMode !== null) {
                return savedDebugMode === 'true';
            }
        } catch (e) {
            // 忽略本地存储错误
        }
        
        // 默认关闭调试模式
        return false;
    }

    setupEventListeners() {
        const uploadSection = document.getElementById('uploadSection');
        const fileInput = document.getElementById('fileInput');
        const convertBtn = document.getElementById('convertBtn');
        const stopStreamingBtn = document.getElementById('stopStreamingBtn');
        const crfSlider = document.getElementById('crf');
        const crfValue = document.getElementById('crfValue');

        if (!uploadSection || !fileInput || !convertBtn) {
            this.log('错误: 无法找到页面元素', 'error');
            return;
        }

        this.log('设置事件监听器...');

        // 文件上传
        uploadSection.addEventListener('click', () => {
            this.log('点击上传区域');
            fileInput.click();
        });
        
        uploadSection.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadSection.classList.add('dragover');
            this.log('拖拽文件到上传区域');
        });
        
        uploadSection.addEventListener('dragleave', () => {
            uploadSection.classList.remove('dragover');
            this.log('拖拽离开上传区域');
        });
        
        uploadSection.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadSection.classList.remove('dragover');
            this.log('文件已拖拽到上传区域');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelect(files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            this.log('文件选择器发生变化');
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files[0]);
            }
        });

        // 转码按钮
        convertBtn.addEventListener('click', () => {
            if (!this.isConverting) {
                this.startConversion();
            }
        });

        // 停止流式播放按钮
        if (stopStreamingBtn) {
            stopStreamingBtn.addEventListener('click', () => {
                this.stopStreaming();
                stopStreamingBtn.style.display = 'none';
                convertBtn.style.display = 'block';
            });
        }

        // CRF 滑块
        crfSlider.addEventListener('input', (e) => {
            crfValue.textContent = e.target.value;
        });

        // 添加键盘快捷键
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+D 切换调试模式
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                this.toggleDebugMode();
            }
        });
    }

    // 切换调试模式
    toggleDebugMode() {
        this.debugMode = !this.debugMode;
        
        // 保存到本地存储
        try {
            localStorage.setItem('ffmpeg-debug-mode', this.debugMode.toString());
        } catch (e) {
            console.warn('无法保存调试模式设置到本地存储');
        }
        
        const status = this.debugMode ? '已启用' : '已禁用';
        this.log(`调试模式${status}`, 'info');
        
        if (this.debugMode) {
            this.log('当前系统状态:', 'debug');
            this.log(`- FFmpeg 状态: ${this.ffmpeg ? '已加载' : '未加载'}`, 'debug');
            this.log(`- 是否正在转码: ${this.isConverting}`, 'debug');
            this.log(`- 是否正在流式播放: ${this.isStreaming}`, 'debug');
            this.log(`- 队列长度: ${this.streamQueue.length}`, 'debug');
            this.log(`- MediaSource 状态: ${this.mediaSource ? this.mediaSource.readyState : '不存在'}`, 'debug');
            this.log(`- SourceBuffer 状态: ${this.sourceBuffer ? '存在' : '不存在'}`, 'debug');
        }
    }

    handleFileSelect(file) {
        if (!file.type.startsWith('video/')) {
            this.log('请选择视频文件', 'error');
            return;
        }

        this.originalFile = file;
        this.performanceMetrics.originalSize = file.size;
        
        // 显示原始视频
        this.displayOriginalVideo(file);
        
        // 只有在 FFmpeg 加载完成时才启用转码按钮
        const convertBtn = document.getElementById('convertBtn');
        if (this.ffmpeg) {
            convertBtn.disabled = false;
            this.log(`已选择文件: ${file.name} (${this.formatFileSize(file.size)})`);
        } else {
            convertBtn.disabled = true;
            this.log(`已选择文件: ${file.name} (${this.formatFileSize(file.size)})`, 'warning');
            this.log('FFmpeg 正在加载中，请稍后再试', 'warning');
        }
    }

    displayOriginalVideo(file) {
        const container = document.getElementById('originalVideoContainer');
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.controls = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '400px';
        
        container.innerHTML = '';
        container.appendChild(video);
        
        video.addEventListener('loadedmetadata', () => {
            this.log(`原始视频信息: ${video.videoWidth}x${video.videoHeight}, ${video.duration.toFixed(2)}秒`);
        });
    }

    async startConversion() {
        if (!this.originalFile || this.isConverting) return;

        this.isConverting = true;
        this.startTime = performance.now();
        
        const convertBtn = document.getElementById('convertBtn');
        const stopStreamingBtn = document.getElementById('stopStreamingBtn');
        const progressSection = document.getElementById('progressSection');
        const streamingMode = document.getElementById('streamingMode').value;
        
        convertBtn.innerHTML = '转码中<span class="loading"></span>';
        convertBtn.disabled = true;
        progressSection.style.display = 'block';
        
        // 如果是实时转码，显示停止按钮
        if (streamingMode === 'realtime') {
            convertBtn.style.display = 'none';
            stopStreamingBtn.style.display = 'block';
        }
        
        this.log('开始转码...');
        
        try {
            await this.convertVideo();
            this.log('转码完成');
        } catch (error) {
            this.log(`转码失败: ${error.message}`, 'error');
            console.error('转码失败:', error);
        } finally {
            this.isConverting = false;
            convertBtn.innerHTML = '开始转码';
            convertBtn.disabled = false;
            convertBtn.style.display = 'block';
            stopStreamingBtn.style.display = 'none';
        }
    }

    async convertVideo() {
        const outputFormat = document.getElementById('outputFormat').value;
        const videoCodec = document.getElementById('videoCodec').value;
        const crf = document.getElementById('crf').value;
        const preset = document.getElementById('preset').value;
        const threads = document.getElementById('threads').value;
        const performanceMode = document.getElementById('performanceMode').value;
        const hardwareAcceleration = document.getElementById('hardwareAcceleration').value;
        const streamingMode = document.getElementById('streamingMode').value;
        
        const outputFileName = `converted_${Date.now()}.${outputFormat}`;
        
        this.log('=== 转码开始 ===');
        this.log(`输入文件: ${this.originalFile.name} (${this.formatFileSize(this.originalFile.size)})`);
        this.log(`输出格式: ${outputFormat}`);
        this.log(`视频编码器: ${videoCodec}`);
        this.log(`质量设置: CRF=${crf}`);
        this.log(`速度预设: ${preset}`);
        this.log(`线程数: ${threads === '0' ? '自动' : threads + ' 线程'}`);
        this.log(`性能模式: ${this.getPerformanceModeText(performanceMode)}`);
        this.log(`硬件加速: ${this.getHardwareAccelerationText(hardwareAcceleration)}`);
        this.log(`流式处理: ${this.getStreamingModeText(streamingMode)}`);
        
        // 检查文件系统健康状态
        this.log('检查 FFmpeg 文件系统状态...');
        const filesystemHealthy = await this.checkFilesystemHealth();
        if (!filesystemHealthy) {
            throw new Error('FFmpeg 文件系统状态异常，无法进行转码');
        }
        
        // 将文件写入 FFmpeg 文件系统
        this.log('正在将文件写入 FFmpeg 文件系统...');
        try {
            await this.ffmpeg.writeFile('input.mp4', await fetchFile(this.originalFile));
            this.log('文件写入完成');
        } catch (fileError) {
            this.log(`文件写入失败: ${fileError.message}`, 'error');
            throw new Error(`无法写入文件到FFmpeg文件系统: ${fileError.message}`);
        }
        
        // 根据流式处理模式选择转码方式
        if (streamingMode === 'none') {
            await this.normalConversion({
                input: 'input.mp4',
                output: outputFileName,
                videoCodec,
                crf,
                preset,
                threads,
                performanceMode,
                hardwareAcceleration,
                outputFormat
            });
        } else if (streamingMode === 'segment') {
            await this.segmentedConversion({
                input: 'input.mp4',
                output: outputFileName,
                videoCodec,
                crf,
                preset,
                threads,
                performanceMode,
                hardwareAcceleration,
                outputFormat
            });
        } else if (streamingMode === 'realtime') {
            await this.realtimeConversion({
                input: 'input.mp4',
                output: outputFileName,
                videoCodec,
                crf,
                preset,
                threads,
                performanceMode,
                hardwareAcceleration,
                outputFormat
            });
        }
        
        // 清理 FFmpeg 文件系统
        this.log('正在清理临时文件...');
        try {
            await this.ffmpeg.deleteFile('input.mp4');
            this.log('已删除输入文件');
        } catch (deleteError) {
            this.log(`删除输入文件失败: ${deleteError.message}`, 'warning');
        }
        
        try {
            await this.ffmpeg.deleteFile(outputFileName);
            this.log('已删除输出文件');
        } catch (deleteError) {
            this.log(`删除输出文件失败: ${deleteError.message}`, 'warning');
        }
        this.log('临时文件清理完成');
        this.log('=== 转码完成 ===');
    }

    displayConvertedVideo(blob, filename) {
        const container = document.getElementById('convertedVideoContainer');
        const video = document.createElement('video');
        video.src = URL.createObjectURL(blob);
        video.controls = true;
        video.autoplay = true;
        video.muted = true; // 自动播放时需要静音
        video.style.maxWidth = '100%';
        video.style.maxHeight = '400px';
        
        container.innerHTML = '';
        container.appendChild(video);
        
        // 添加下载链接
        const downloadLink = document.createElement('a');
        downloadLink.href = video.src;
        downloadLink.download = filename;
        downloadLink.textContent = `下载 ${filename}`;
        downloadLink.style.display = 'block';
        downloadLink.style.marginTop = '10px';
        downloadLink.style.color = '#667eea';
        downloadLink.style.textDecoration = 'none';
        
        container.appendChild(downloadLink);
        
        // 添加音量控制按钮
        const volumeControl = document.createElement('button');
        volumeControl.textContent = '🔊 取消静音';
        volumeControl.style.marginTop = '10px';
        volumeControl.style.padding = '8px 16px';
        volumeControl.style.backgroundColor = '#667eea';
        volumeControl.style.color = 'white';
        volumeControl.style.border = 'none';
        volumeControl.style.borderRadius = '5px';
        volumeControl.style.cursor = 'pointer';
        volumeControl.addEventListener('click', () => {
            video.muted = !video.muted;
            volumeControl.textContent = video.muted ? '🔊 取消静音' : '🔇 静音';
            if (!video.muted && video.paused) {
                video.play().catch(e => {
                    this.log(`自动播放失败: ${e.message}`, 'warning');
                });
            }
        });
        container.appendChild(volumeControl);
        
        video.addEventListener('loadedmetadata', () => {
            this.log(`转码后视频信息: ${video.videoWidth}x${video.videoHeight}, ${video.duration.toFixed(2)}秒`);
            // 尝试自动播放
            this.attemptAutoPlay(video);
        });
        
        video.addEventListener('canplay', () => {
            // 再次尝试自动播放
            this.attemptAutoPlay(video);
        });
    }

    updateProgress(progress) {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        // 检查进度数据的有效性
        if (!progress || typeof progress !== 'object') {
            this.log('进度数据无效', 'warning');
            return;
        }
        
        // 安全地计算百分比
        let percentage = 0;
        if (progress.ratio !== undefined && progress.ratio !== null && !isNaN(progress.ratio)) {
            percentage = Math.round(progress.ratio * 100);
        } else if (progress.progress !== undefined && progress.progress !== null && !isNaN(progress.progress)) {
            percentage = Math.round(progress.progress * 100);
        } else {
            this.log('进度比率无效，使用默认值 0%', 'warning');
        }
        
        // 限制百分比范围
        percentage = Math.max(0, Math.min(100, percentage));
        
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `转码进度: ${percentage}%`;
        
        // 处理时间信息
        if (progress.time !== undefined && progress.time !== null && !isNaN(progress.time)) {
            const time = this.formatTime(progress.time);
            progressText.textContent += ` | 已处理: ${time}`;
            
            // 每10%进度记录一次日志
            if (percentage % 10 === 0 && percentage > 0) {
                this.log(`转码进度: ${percentage}% - 已处理时间: ${time}`);
            }
        }
        
        // 详细进度信息（仅在有完整时间信息时显示）
        if (progress.duration !== undefined && progress.duration !== null && !isNaN(progress.duration) &&
            progress.time !== undefined && progress.time !== null && !isNaN(progress.time)) {
            const remaining = Math.max(0, progress.duration - progress.time);
            const remainingFormatted = this.formatTime(remaining);
            this.log(`详细进度: ${percentage}% | 已用: ${this.formatTime(progress.time)} | 剩余: ${remainingFormatted}`);
        }
        
        // 记录原始进度数据用于调试
        this.log(`原始进度数据: ${JSON.stringify(progress)}`, 'debug');
    }

    updatePerformanceMetrics() {
        const metrics = this.performanceMetrics;
        const performanceInfo = document.getElementById('performanceInfo');
        
        // 计算性能指标
        const timeSeconds = (metrics.conversionTime / 1000).toFixed(2);
        const sizeChange = ((metrics.convertedSize - metrics.originalSize) / metrics.originalSize * 100).toFixed(1);
        const speed = (metrics.originalSize / 1024 / 1024 / (metrics.conversionTime / 1000)).toFixed(2);
        
        // 更新显示
        document.getElementById('conversionTime').textContent = `${timeSeconds} 秒`;
        document.getElementById('fileSizeChange').textContent = `${sizeChange > 0 ? '+' : ''}${sizeChange}%`;
        document.getElementById('processingSpeed').textContent = `${speed} MB/s`;
        
        // 内存使用（估算）
        if (performance.memory) {
            const memoryMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1);
            document.getElementById('memoryUsage').textContent = `${memoryMB} MB`;
            metrics.memoryUsage = parseFloat(memoryMB);
        } else {
            document.getElementById('memoryUsage').textContent = '不支持';
        }
        
        performanceInfo.style.display = 'block';
        
        this.log(`性能指标 - 时间: ${timeSeconds}s, 大小变化: ${sizeChange}%, 速度: ${speed}MB/s`);
    }

    log(message, type = 'info') {
        // 调试信息处理
        if (type === 'debug') {
            if (this.debugMode) {
                console.log(`[FFmpeg Demo DEBUG] ${message}`);
                // 可选：在界面上显示调试信息
                if (this.debugMode) {
                    this.addToLogUI(message, type);
                }
            }
            return;
        }
        
        // 其他类型的日志信息
        console.log(`[FFmpeg Demo] ${message}`);
        this.addToLogUI(message, type);
    }

    // 添加日志到UI
    addToLogUI(message, type = 'info') {
        const logSection = document.getElementById('logSection');
        const logContent = document.getElementById('logContent');
        
        if (!logSection || !logContent) {
            console.warn('日志区域元素不存在');
            return;
        }
        
        logSection.style.display = 'block';
        
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.style.marginBottom = '4px';
        
        let color = '#00ff00';
        if (type === 'error') color = '#ff4444';
        if (type === 'warning') color = '#ffaa00';
        if (type === 'debug') color = '#888888';
        
        logEntry.innerHTML = `<span style="color: #888">${timestamp}</span> <span style="color: ${color}">${message}</span>`;
        
        logContent.appendChild(logEntry);
        logContent.scrollTop = logContent.scrollHeight;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatTime(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    buildOptimizedCommand(options) {
        const {
            input,
            output,
            videoCodec,
            crf,
            preset,
            threads,
            performanceMode,
            hardwareAcceleration,
            outputFormat
        } = options;

        const command = ['-i', input];

        // 硬件加速设置
        if (hardwareAcceleration !== 'none') {
            const hwAccel = this.getHardwareAccelerationParams(hardwareAcceleration, videoCodec);
            command.push(...hwAccel);
        }

        // 性能模式优化
        const performanceParams = this.getPerformanceParams(performanceMode, videoCodec, crf, preset);
        command.push(...performanceParams);

        // 线程设置
        if (threads !== '0') {
            command.push('-threads', threads);
        }

        // 音频设置
        command.push('-c:a', 'aac', '-b:a', '128k');

        // 容器格式特定设置
        if (outputFormat === 'mp4') {
            command.push('-movflags', '+faststart');
        }

        command.push('-y', output);
        return command;
    }

    getHardwareAccelerationParams(hwType, videoCodec) {
        const params = [];
        
        switch (hwType) {
            case 'cuda':
                params.push('-hwaccel', 'cuda');
                if (videoCodec === 'libx264') {
                    params.push('-c:v', 'h264_nvenc');
                } else if (videoCodec === 'libx265') {
                    params.push('-c:v', 'hevc_nvenc');
                }
                break;
            case 'qsv':
                params.push('-hwaccel', 'qsv');
                if (videoCodec === 'libx264') {
                    params.push('-c:v', 'h264_qsv');
                } else if (videoCodec === 'libx265') {
                    params.push('-c:v', 'hevc_qsv');
                }
                break;
            case 'videotoolbox':
                params.push('-hwaccel', 'videotoolbox');
                if (videoCodec === 'libx264') {
                    params.push('-c:v', 'h264_videotoolbox');
                }
                break;
            case 'auto':
                params.push('-hwaccel', 'auto');
                break;
        }
        
        return params;
    }

    getPerformanceParams(mode, videoCodec, crf, preset) {
        const params = [];
        
        switch (mode) {
            case 'speed':
                // 速度优先：降低质量要求，使用更快的预设
                params.push('-c:v', videoCodec);
                params.push('-crf', Math.max(18, parseInt(crf) + 4).toString());
                params.push('-preset', preset === 'veryslow' ? 'medium' : 'ultrafast');
                params.push('-tune', 'fastdecode');
                break;
                
            case 'quality':
                // 质量优先：提高质量，使用更慢的预设
                params.push('-c:v', videoCodec);
                params.push('-crf', Math.min(30, parseInt(crf) - 2).toString());
                params.push('-preset', preset === 'ultrafast' ? 'medium' : 'slow');
                params.push('-tune', 'film');
                break;
                
            case 'lowcpu':
                // 低CPU占用：使用更快的预设，降低分辨率
                params.push('-c:v', videoCodec);
                params.push('-crf', Math.max(18, parseInt(crf) + 6).toString());
                params.push('-preset', 'ultrafast');
                params.push('-vf', 'scale=1280:-2'); // 限制宽度为1280px
                break;
                
            default: // balanced
                params.push('-c:v', videoCodec);
                params.push('-crf', crf);
                params.push('-preset', preset);
                break;
        }
        
        return params;
    }

    getPerformanceModeText(mode) {
        const modes = {
            'balanced': '平衡模式',
            'speed': '速度优先',
            'quality': '质量优先',
            'lowcpu': '低CPU占用'
        };
        return modes[mode] || mode;
    }

    getHardwareAccelerationText(hwType) {
        const types = {
            'none': '无',
            'auto': '自动检测',
            'cuda': 'CUDA (NVIDIA)',
            'qsv': 'Intel QSV',
            'videotoolbox': 'VideoToolbox (Mac)'
        };
        return types[hwType] || hwType;
    }

    getStreamingModeText(mode) {
        const modes = {
            'none': '禁用',
            'segment': '分段转码',
            'realtime': '实时转码'
        };
        return modes[mode] || mode;
    }

    async normalConversion(options) {
        const command = this.buildOptimizedCommand(options);
        this.log(`执行命令: ffmpeg ${command.join(' ')}`);
        this.log('开始转码处理，请稍候...');
        
        // 执行转码
        try {
            await this.ffmpeg.exec(command);
            this.log('转码命令执行完成');
        } catch (execError) {
            this.log(`FFmpeg 执行失败: ${execError.message}`, 'error');
            throw new Error(`转码执行失败: ${execError.message}`);
        }
        
        // 读取转码后的文件
        this.log('正在读取转码后的文件...');
        let data;
        try {
            data = await this.ffmpeg.readFile(options.output);
            const convertedBlob = new Blob([data], { type: `video/${options.outputFormat}` });
            this.log(`转码后文件大小: ${this.formatFileSize(convertedBlob.size)}`);
            
            this.performanceMetrics.convertedSize = convertedBlob.size;
            this.performanceMetrics.conversionTime = performance.now() - this.startTime;
            
            // 显示转码后的视频
            this.log('正在生成转码后的视频预览...');
            this.displayConvertedVideo(convertedBlob, options.output);
            
            // 更新性能指标
            this.updatePerformanceMetrics();
        } catch (readError) {
            this.log(`读取转码后文件失败: ${readError.message}`, 'error');
            throw new Error(`无法读取转码后的文件: ${readError.message}`);
        }
    }

    async segmentedConversion(options) {
        this.log('开始分段转码处理...');
        
        // 分段转码：将视频分成多个小段进行处理
        const segmentDuration = 10; // 每段10秒
        const segments = [];
        
        // 创建分段列表文件
        const segmentList = [];
        
        // 简化的分段处理（在实际应用中需要更复杂的逻辑）
        for (let i = 0; i < 5; i++) { // 假设分成5段
            const startTime = i * segmentDuration;
            const segmentName = `segment_${i}.${options.outputFormat}`;
            
            const command = [
                '-ss', startTime.toString(),
                '-i', options.input,
                '-t', segmentDuration.toString(),
                '-c:v', options.videoCodec,
                '-crf', options.crf,
                '-preset', options.preset,
                '-c:a', 'aac',
                '-b:a', '128k',
                '-y', segmentName
            ];
            
            this.log(`转码第 ${i + 1} 段 (开始时间: ${startTime}s)...`);
            try {
                await this.ffmpeg.exec(command);
            } catch (execError) {
                this.log(`第 ${i + 1} 段转码失败: ${execError.message}`, 'error');
                // 继续处理下一段，而不是中断整个过程
                continue;
            }
            
            // 读取分段数据
            const segmentData = await this.ffmpeg.readFile(segmentName);
            segments.push(segmentData);
            segmentList.push(segmentName);
            
            // 清理分段文件
            await this.ffmpeg.deleteFile(segmentName);
            
            this.log(`第 ${i + 1} 段转码完成`);
        }
        
        // 合并所有分段
        this.log('合并分段文件...');
        const combinedData = new Blob(segments, { type: `video/${options.outputFormat}` });
        
        this.performanceMetrics.convertedSize = combinedData.size;
        this.performanceMetrics.conversionTime = performance.now() - this.startTime;
        
        // 显示转码后的视频
        this.log('正在生成转码后的视频预览...');
        this.displayConvertedVideo(combinedData, options.output);
        
        // 更新性能指标
        this.updatePerformanceMetrics();
        
        this.log('分段转码完成');
    }

    async realtimeConversion(options) {
        this.log('开始实时转码和流式播放...');
        
        let streamingAttempt = 0;
        const maxStreamingAttempts = 2;
        
        while (streamingAttempt < maxStreamingAttempts) {
            streamingAttempt++;
            this.log(`流式播放尝试 ${streamingAttempt}/${maxStreamingAttempts}`);
            
            try {
                // 重置状态
                this.supportedMimeType = null;
                this.isStreaming = true;
                this.streamQueue = [];
                
                // 重置缓冲区监控数据
                this.bufferMonitor = {
                    totalChunksAdded: 0,
                    totalChunksProcessed: 0,
                    totalBytesProcessed: 0,
                    lastErrorTime: null,
                    consecutiveErrors: 0,
                    bufferHealth: 'good',
                    lastBufferCheck: Date.now()
                };
                
                // 启动性能监控
                this.startPerformanceMonitoring();
                
                // 初始化MediaSource
                await this.initMediaSource();
                
                // 实时转码：分片处理
                const chunkDuration = 8; // 增加到每片8秒，提高播放连续性
                let currentChunk = 0;
                let totalDuration = 0;
                let consecutiveErrors = 0;
                const maxConsecutiveErrors = 3;
                
                // 获取视频总时长
                totalDuration = await this.getVideoDuration(options.input);
                this.log(`视频总时长: ${totalDuration}秒`);
                
                // 设置 SourceBuffer 时间戳偏移
                if (this.sourceBuffer) {
                    this.sourceBuffer.timestampOffset = 0;
                    this.log('设置 SourceBuffer 时间戳偏移为 0');
                }
                
                // 分片转码和播放
                while (currentChunk * chunkDuration < totalDuration && this.isStreaming) {
                    if (consecutiveErrors >= maxConsecutiveErrors) {
                        this.log('连续错误过多，停止流式播放', 'error');
                        throw new Error('流式播放连续错误过多');
                    }
                    
                    const startTime = currentChunk * chunkDuration;
                    let chunkExtension = '.ts';
                    
                    // 根据支持的MIME类型确定文件扩展名
                    if (this.supportedMimeType) {
                        if (this.supportedMimeType.includes('video/mp4')) {
                            chunkExtension = '.mp4';
                        } else if (this.supportedMimeType.includes('video/webm')) {
                            chunkExtension = '.webm';
                        }
                    }
                    
                    const chunkName = `chunk_${currentChunk}${chunkExtension}`;
                    
                    try {
                        this.log(`转码第 ${currentChunk + 1} 片 (开始时间: ${startTime}s, 时长: ${chunkDuration}s)...`);
                        
                        // 转码当前分片
                        await this.transcodeChunk({
                            input: options.input,
                            output: chunkName,
                            startTime,
                            duration: chunkDuration,
                            videoCodec: options.videoCodec,
                            crf: options.crf,
                            preset: 'ultrafast',
                            outputFormat: chunkExtension.substring(1) // 去掉点号
                        });
                        
                        // 读取分片数据并添加到播放队列
                        let chunkData;
                        try {
                            chunkData = await this.ffmpeg.readFile(chunkName);
                            console.log('读取分片数据成功', chunkData);
                            
                            // 更新时间戳偏移以确保连续播放
                            if (this.sourceBuffer && currentChunk > 0) {
                                this.sourceBuffer.timestampOffset = startTime;
                                this.log(`更新时间戳偏移为: ${startTime}s`);
                            }
                            
                            await this.addChunkToStreamWithRetry(chunkData, 3);
                        } catch (readError) {
                            this.log(`读取分片文件失败: ${readError.message}`, 'error');
                            throw new Error(`无法读取分片文件: ${readError.message}`);
                        }
                        
                        // 清理分片文件
                        try {
                            await this.ffmpeg.deleteFile(chunkName);
                        } catch (deleteError) {
                            this.log(`删除分片文件失败: ${deleteError.message}`, 'warning');
                        }
                        
                        currentChunk++;
                        consecutiveErrors = 0; // 重置错误计数
                        this.log(`第 ${currentChunk} 片已添加到播放队列 (已处理时长: ${currentChunk * chunkDuration}s)`);
                        
                        // 添加小延迟避免过度占用CPU
                        await new Promise(resolve => setTimeout(resolve, 200));
                        
                    } catch (chunkError) {
                        consecutiveErrors++;
                        this.log(`转码第 ${currentChunk + 1} 片失败: ${chunkError.message}`, 'error');
                        console.error('分片转码错误:', chunkError);
                        
                        // 如果是最后一个分片，可以忽略错误
                        if (currentChunk * chunkDuration >= totalDuration - chunkDuration) {
                            this.log('已处理到最后一个分片，忽略错误', 'warning');
                            break;
                        }
                        
                        // 短暂等待后重试
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
                
                this.log('所有分片转码完成');
                break; // 成功完成，退出重试循环
                
            } catch (error) {
                this.log(`流式播放尝试 ${streamingAttempt} 失败: ${error.message}`, 'error');
                console.error('实时转码错误:', error);
                
                // 清理当前失败的流式播放
                this.stopStreaming();
                
                if (streamingAttempt >= maxStreamingAttempts) {
                    this.log('流式播放多次尝试失败，降级到普通转码模式', 'warning');
                    await this.fallbackToNormalConversion(options);
                    return;
                }
                
                // 等待一段时间后重试
                this.log('等待 2 秒后重试...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            } finally {
                this.isStreaming = false;
                // 停止性能监控
                this.stopPerformanceMonitoring();
            }
        }
        
        this.performanceMetrics.conversionTime = performance.now() - this.startTime;
        this.updatePerformanceMetrics();
        
        this.log('实时转码和流式播放完成');
    }

    async initMediaSource() {
        return new Promise((resolve, reject) => {
            if (!window.MediaSource) {
                reject(new Error('浏览器不支持MediaSource API'));
                return;
            }
            
            this.mediaSource = new MediaSource();
            this.mediaSource.addEventListener('sourceopen', () => {
                this.log('MediaSource已打开');
                
                try {
                    // 尝试多种 MIME 类型，按优先级排序（MPEG-TS优先）
                    const mimeTypes = [
                        'video/mp2t; codecs="avc1.42E01E,mp4a.40.2"',
                        'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
                        'video/webm; codecs="vp9,opus"'
                    ];
                    
                    let supportedMimeType = null;
                    for (const mimeType of mimeTypes) {
                        this.log(`检查 MIME 类型支持: ${mimeType}`);
                        if (MediaSource.isTypeSupported(mimeType)) {
                            supportedMimeType = mimeType;
                            break;
                        }
                    }
                    
                    if (!supportedMimeType) {
                        reject(new Error('浏览器不支持任何流媒体视频格式'));
                        return;
                    }
                    
                    this.log(`使用支持的 MIME 类型: ${supportedMimeType}`);
                    this.supportedMimeType = supportedMimeType;
                    this.sourceBuffer = this.mediaSource.addSourceBuffer(supportedMimeType);
                    console.log('SourceBuffer 创建成功', this.sourceBuffer);
                    
                    // 添加事件监听器
                    this.sourceBuffer.addEventListener('updateend', () => {
                        this.processStreamQueue();
                    });
                    
                    this.sourceBuffer.addEventListener('error', (e) => {
                        const errorMessage = e.message || e.error || JSON.stringify(e);
                        this.log(`SourceBuffer错误: ${errorMessage}`, 'error');
                        console.error('SourceBuffer错误详情:', e);
                        
                        // 增强的错误诊断
                        this.diagnoseSourceBufferError(e);
                    });
                    
                    this.sourceBuffer.addEventListener('abort', (e) => {
                        this.log('SourceBuffer操作被中止', 'warning');
                    });
                    
                    this.log('SourceBuffer创建成功');
                    resolve();
                } catch (error) {
                    this.log(`创建SourceBuffer失败: ${error.message}`, 'error');
                    console.error('创建SourceBuffer失败详情:', error);
                    reject(error);
                }
            });
            
            this.mediaSource.addEventListener('error', (e) => {
                const errorMessage = e.message || e.error || JSON.stringify(e);
                this.log(`MediaSource错误: ${errorMessage}`, 'error');
                console.error('MediaSource错误详情:', e);
            });
            
            // 创建流式播放视频元素
            this.createStreamingVideo();
        });
    }

    createStreamingVideo() {
        const container = document.getElementById('convertedVideoContainer');
        container.innerHTML = '';
        
        const video = document.createElement('video');
        video.src = URL.createObjectURL(this.mediaSource);
        video.controls = true;
        video.autoplay = true;
        video.muted = true; // 自动播放时需要静音
        video.style.maxWidth = '100%';
        video.style.maxHeight = '400px';
        video.style.backgroundColor = '#000';
        
        // 添加视频错误处理
        video.addEventListener('error', (e) => {
            this.log(`视频元素错误: ${video.error ? video.error.message : '未知错误'}`, 'error');
            this.updateStreamingStatus('视频播放错误');
            this.stopStreaming();
        });
        
        container.appendChild(video);
        
        // 添加播放状态显示
        const statusDiv = document.createElement('div');
        statusDiv.id = 'streamingStatus';
        statusDiv.style.marginTop = '10px';
        statusDiv.style.padding = '10px';
        statusDiv.style.backgroundColor = '#f0f0f0';
        statusDiv.style.borderRadius = '5px';
        statusDiv.style.fontSize = '14px';
        statusDiv.textContent = '正在准备流式播放...';
        container.appendChild(statusDiv);
        
        // 添加音量控制按钮
        const volumeControl = document.createElement('button');
        volumeControl.textContent = '🔊 取消静音';
        volumeControl.style.marginTop = '10px';
        volumeControl.style.padding = '8px 16px';
        volumeControl.style.backgroundColor = '#667eea';
        volumeControl.style.color = 'white';
        volumeControl.style.border = 'none';
        volumeControl.style.borderRadius = '5px';
        volumeControl.style.cursor = 'pointer';
        volumeControl.addEventListener('click', () => {
            video.muted = !video.muted;
            volumeControl.textContent = video.muted ? '🔊 取消静音' : '🔇 静音';
            if (!video.muted && video.paused) {
                video.play().catch(e => {
                    this.log(`自动播放失败: ${e.message}`, 'warning');
                });
            }
        });
        container.appendChild(volumeControl);
        
        video.addEventListener('loadstart', () => {
            this.updateStreamingStatus('开始加载...');
        });
        
        video.addEventListener('loadedmetadata', () => {
            this.updateStreamingStatus('元数据加载完成');
            // 尝试自动播放
            this.attemptAutoPlay(video);
        });
        
        video.addEventListener('canplay', () => {
            this.updateStreamingStatus('可以播放');
            // 再次尝试自动播放
            this.attemptAutoPlay(video);
        });
        
        video.addEventListener('play', () => {
            this.updateStreamingStatus('正在播放');
        });
        
        video.addEventListener('pause', () => {
            this.updateStreamingStatus('已暂停');
        });
        
        video.addEventListener('waiting', () => {
            this.updateStreamingStatus('缓冲中...');
        });
        
        video.addEventListener('playing', () => {
            this.updateStreamingStatus('正在播放');
        });
        
        video.addEventListener('ended', () => {
            this.updateStreamingStatus('播放结束');
        });
        
        video.addEventListener('stalled', () => {
            this.updateStreamingStatus('网络卡顿');
        });
        
        // 监听第一个分片添加成功后尝试播放
        this.waitForFirstChunkAndPlay(video);
    }

    updateStreamingStatus(status) {
        const statusDiv = document.getElementById('streamingStatus');
        if (statusDiv) {
            statusDiv.textContent = `流式播放状态: ${status}`;
        }
    }

    // 尝试自动播放视频
    async attemptAutoPlay(video) {
        // 检查视频元素和 MediaSource 状态
        if (!video || !this.mediaSource || this.mediaSource.readyState !== 'open') {
            this.log('视频或 MediaSource 不可用，无法自动播放', 'warning');
            return;
        }
        
        // 检查是否有足够的数据可以播放
        if (this.sourceBuffer && this.sourceBuffer.buffered.length > 0) {
            const bufferedEnd = this.sourceBuffer.buffered.end(this.sourceBuffer.buffered.length - 1);
            if (bufferedEnd < 2) { // 至少需要2秒的数据
                this.log('缓冲数据不足，等待更多数据...', 'warning');
                return;
            }
        }
        
        if (video.paused) {
            try {
                await video.play();
                this.log('视频自动播放成功');
                this.updateStreamingStatus('正在播放');
            } catch (error) {
                this.log(`自动播放失败: ${error.message}`, 'warning');
                // 如果自动播放失败，显示用户交互提示
                this.updateStreamingStatus('点击播放按钮开始播放');
            }
        }
    }

    // 等待第一个分片添加后尝试播放
    waitForFirstChunkAndPlay(video) {
        const checkInterval = setInterval(() => {
            // 安全检查：确保 SourceBuffer 仍然有效
            if (!this.sourceBuffer || !this.mediaSource || this.mediaSource.readyState !== 'open') {
                clearInterval(checkInterval);
                this.log('MediaSource 或 SourceBuffer 已不可用', 'warning');
                return;
            }
            
            // 检查是否有数据
            let hasData = false;
            try {
                hasData = this.streamQueue.length > 0 || (this.sourceBuffer && this.sourceBuffer.buffered.length > 0);
            } catch (error) {
                // 如果访问 buffered 属性出错，说明 SourceBuffer 已被移除
                clearInterval(checkInterval);
                this.log('SourceBuffer 已被移除，停止等待', 'warning');
                return;
            }
            
            if (hasData) {
                clearInterval(checkInterval);
                this.log('检测到视频数据，尝试自动播放');
                setTimeout(() => {
                    this.attemptAutoPlay(video);
                }, 500); // 稍微延迟确保数据已准备好
            }
        }, 100);

        // 30秒后停止检查
        setTimeout(() => {
            clearInterval(checkInterval);
            if (video && video.paused) {
                this.log('等待视频数据超时', 'warning');
            }
        }, 30000);
    }

  
    async transcodeChunk(options) {
        // 优先使用MPEG-TS格式，因为它对流式播放更友好
        let outputFormat = 'mpegts';
        let outputExtension = '.ts';
        
        if (this.supportedMimeType) {
            // 即使支持MP4，也优先使用MPEG-TS进行流式播放
            if (this.supportedMimeType.includes('video/mp2t')) {
                outputFormat = 'mpegts';
                outputExtension = '.ts';
            } else if (this.supportedMimeType.includes('video/mp4')) {
                // 只有在明确需要MP4时才使用
                outputFormat = 'mp4';
                outputExtension = '.mp4';
            } else if (this.supportedMimeType.includes('video/webm')) {
                outputFormat = 'webm';
                outputExtension = '.webm';
            }
        }
        
        this.log(`使用输出格式: ${outputFormat}`);
        
        // 为流式播放优化的FFmpeg命令
        let command = [];
        
        if (outputFormat === 'mpegts') {
            // MPEG-TS格式的优化命令
            command = [
                '-ss', options.startTime.toString(),
                '-i', options.input,
                '-t', options.duration.toString(),
                '-c:v', options.videoCodec,
                '-crf', options.crf,
                '-preset', 'ultrafast',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-mpegts_m2ts_mode', '1',
                '-f', 'mpegts',
                '-y', options.output
            ];
        } else {
            // MP4/WebM格式的命令
            command = [
                '-ss', options.startTime.toString(),
                '-i', options.input,
                '-t', options.duration.toString(),
                '-c:v', options.videoCodec,
                '-crf', options.crf,
                '-preset', 'ultrafast',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-profile:v', 'baseline',
                '-level', '3.0',
                '-movflags', '+frag_keyframe+empty_moov+faststart+default_base_moof',
                '-frag_duration', options.duration.toString(),
                '-f', outputFormat,
                '-y', options.output
            ];
        }
        
        try {
            await this.ffmpeg.exec(command);
            this.log(`分片转码完成: ${options.output} (开始时间: ${options.startTime}s, 时长: ${options.duration}s)`);
        } catch (execError) {
            this.log(`分片转码失败: ${execError.message}`, 'error');
            throw new Error(`分片转码失败: ${execError.message}`);
        }
    }

    addChunkToStream(chunkData) {
        if (!this.isStreaming) {
            this.log('流式播放已停止，跳过添加分片', 'warning');
            return;
        }
        
        this.streamQueue.push(chunkData);
        
        // 如果是第一个分片，记录日志并准备播放
        if (this.streamQueue.length === 1) {
            this.log('第一个视频分片已添加，准备播放');
        }
        
        this.processStreamQueue();
    }

    // 带重试的添加分片到流
    async addChunkToStreamWithRetry(chunkData, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.log(`尝试添加分片到流 (第 ${attempt} 次)`);
                
                // 返回一个新的 Promise 来跟踪添加操作
                return new Promise((resolve, reject) => {
                    const originalAddChunk = () => {
                        if (!this.isStreaming) {
                            reject(new Error('流式播放已停止'));
                            return;
                        }
                        
                        this.streamQueue.push(chunkData);
                        this.processStreamQueue();
                        
                        // 等待处理完成或超时
                        const timeout = setTimeout(() => {
                            if (this.streamQueue.length === 0) {
                                resolve(); // 成功处理
                            } else {
                                reject(new Error('添加分片超时'));
                            }
                        }, 5000);
                        
                        // 监听队列处理
                        const checkQueue = setInterval(() => {
                            if (this.streamQueue.length === 0) {
                                clearTimeout(timeout);
                                clearInterval(checkQueue);
                                resolve();
                            }
                        }, 100);
                    };
                    
                    originalAddChunk();
                });
                
            } catch (error) {
                this.log(`第 ${attempt} 次添加分片失败: ${error.message}`, 'warning');
                
                if (attempt === maxRetries) {
                    throw new Error(`添加分片到流失败，已重试 ${maxRetries} 次`);
                }
                
                // 等待后重试
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    // 降级到普通转码模式
    async fallbackToNormalConversion(options) {
        this.log('开始降级到普通转码模式...', 'warning');
        
        try {
            // 更新UI状态
            this.updateStreamingStatus('正在降级到普通转码模式...');
            
            // 执行普通转码
            await this.normalConversion(options);
            
            this.log('已成功降级到普通转码模式', 'info');
            
        } catch (error) {
            this.log(`降级转码也失败: ${error.message}`, 'error');
            throw error;
        }
    }

    processStreamQueue() {
        // 基本状态检查
        if (!this.sourceBuffer || !this.mediaSource || this.mediaSource.readyState !== 'open') {
            this.log('MediaSource 或 SourceBuffer 不可用，停止处理队列', 'warning');
            this.streamQueue = [];
            return;
        }
        
        if (this.sourceBuffer.updating || this.streamQueue.length === 0) {
            return;
        }
        
        // 检查视频元素状态
        const video = document.querySelector('#convertedVideoContainer video');
        if (video && video.error) {
            this.log(`视频元素错误: ${video.error.message}`, 'error');
            this.stopStreaming();
            return;
        }
        
        // 智能缓冲区管理
        const bufferStatus = this.analyzeBufferHealth();
        if (bufferStatus.shouldWait) {
            this.log(bufferStatus.message, 'warning');
            setTimeout(() => this.processStreamQueue(), bufferStatus.waitTime);
            return;
        }
        
        const chunk = this.streamQueue.shift();
        try {
            this.log(`正在添加分片到SourceBuffer，大小: ${chunk.length} 字节`);
            
            // 更新监控数据
            this.bufferMonitor.totalChunksAdded++;
            this.bufferMonitor.totalBytesProcessed += chunk.length;
            
            // 添加错误监听器用于这个特定的 appendBuffer 操作
            const errorHandler = (event) => {
                this.sourceBuffer.removeEventListener('error', errorHandler);
                this.bufferMonitor.lastErrorTime = Date.now();
                this.bufferMonitor.consecutiveErrors++;
                this.bufferMonitor.bufferHealth = 'poor';
                this.log(`分片添加过程中发生错误`, 'error');
                this.handleSourceBufferErrorRecovery();
            };
            
            this.sourceBuffer.addEventListener('error', errorHandler);
            
            // 使用 setTimeout 确保错误监听器已设置
            setTimeout(() => {
                try {
                    this.sourceBuffer.appendBuffer(chunk);
                    this.log(`已添加分片到播放队列，剩余队列: ${this.streamQueue.length}`);
                    
                    // 更新监控数据
                    this.bufferMonitor.totalChunksProcessed++;
                    this.bufferMonitor.consecutiveErrors = 0;
                    this.bufferMonitor.bufferHealth = 'good';
                    
                    // 移除临时错误监听器
                    this.sourceBuffer.removeEventListener('error', errorHandler);
                    
                    // 检查是否应该触发播放
                    if (video && video.paused) {
                        const bufferedLength = this.sourceBuffer.buffered.length;
                        let totalBufferedDuration = 0;
                        
                        if (bufferedLength > 0) {
                            const lastBufferedEnd = this.sourceBuffer.buffered.end(bufferedLength - 1);
                            totalBufferedDuration = lastBufferedEnd;
                        }
                        
                        // 如果有足够的缓冲数据，尝试播放
                        if (totalBufferedDuration >= 3) { // 至少3秒数据
                            setTimeout(() => {
                                this.attemptAutoPlay(video);
                            }, 500);
                        }
                    }
                } catch (appendError) {
                    this.sourceBuffer.removeEventListener('error', errorHandler);
                    this.handleAppendError(appendError, chunk);
                }
            }, 0);
            
        } catch (error) {
            this.log(`添加分片失败: ${error.message}`, 'error');
            console.error('SourceBuffer appendBuffer error:', error);
            this.handleAppendError(error, chunk);
        }
    }

    // 分析缓冲区健康状态
    analyzeBufferHealth() {
        const result = {
            shouldWait: false,
            waitTime: 1000,
            message: ''
        };
        
        try {
            const video = document.querySelector('#convertedVideoContainer video');
            
            if (!this.sourceBuffer || !this.sourceBuffer.buffered || this.sourceBuffer.buffered.length === 0) {
                // 缓冲区为空，可以添加
                return result;
            }
            
            const bufferedEnd = this.sourceBuffer.buffered.end(this.sourceBuffer.buffered.length - 1);
            const currentTime = video ? video.currentTime : 0;
            const bufferAhead = bufferedEnd - currentTime;
            
            // 检查缓冲区长度
            if (this.sourceBuffer.buffered.length > 5) {
                result.shouldWait = true;
                result.message = '缓冲区段数过多，暂停添加';
                result.waitTime = 2000;
                return result;
            }
            
            // 检查缓冲区提前量
            if (bufferAhead > 30) {
                result.shouldWait = true;
                result.message = `缓冲区提前过多 (${bufferAhead.toFixed(1)}s)，暂停添加`;
                result.waitTime = 2000;
                return result;
            }
            
            // 检查队列长度
            if (this.streamQueue.length > 5) {
                result.shouldWait = true;
                result.message = '队列过长，暂停添加';
                result.waitTime = 500;
                return result;
            }
            
            // 检查内存使用情况
            if (performance.memory) {
                const usedHeapSize = performance.memory.usedJSHeapSize;
                const totalHeapSize = performance.memory.totalJSHeapSize;
                const memoryUsage = usedHeapSize / totalHeapSize;
                
                if (memoryUsage > 0.8) {
                    result.shouldWait = true;
                    result.message = `内存使用过高 (${(memoryUsage * 100).toFixed(1)}%)，暂停添加`;
                    result.waitTime = 5000;
                    return result;
                }
            }
            
        } catch (error) {
            this.log(`分析缓冲区健康状态失败: ${error.message}`, 'warning');
            result.shouldWait = true;
            result.message = '缓冲区分析失败，暂停添加';
            result.waitTime = 2000;
        }
        
        return result;
    }

    // 启动性能监控
    startPerformanceMonitoring() {
        if (this.performanceMonitor) {
            clearInterval(this.performanceMonitor);
        }
        
        this.performanceMonitor = setInterval(() => {
            this.logPerformanceStats();
        }, 10000); // 每10秒记录一次
    }

    // 停止性能监控
    stopPerformanceMonitoring() {
        if (this.performanceMonitor) {
            clearInterval(this.performanceMonitor);
            this.performanceMonitor = null;
        }
    }

    // 记录性能统计
    logPerformanceStats() {
        const stats = {
            totalChunksAdded: this.bufferMonitor.totalChunksAdded,
            totalChunksProcessed: this.bufferMonitor.totalChunksProcessed,
            totalBytesProcessed: this.bufferMonitor.totalBytesProcessed,
            queueLength: this.streamQueue.length,
            bufferHealth: this.bufferMonitor.bufferHealth,
            consecutiveErrors: this.bufferMonitor.consecutiveErrors,
            isStreaming: this.isStreaming,
            memoryUsage: this.performanceMetrics.memoryUsage
        };
        
        this.log(`性能统计: ${JSON.stringify(stats)}`, 'debug');
        
        // 如果连续错误过多，触发恢复机制
        if (stats.consecutiveErrors > 5) {
            this.log('检测到连续错误过多，触发恢复机制', 'warning');
            this.handleSourceBufferErrorRecovery();
        }
    }

    // 处理 appendBuffer 错误
    handleAppendError(error, chunk) {
        this.log(`处理 appendBuffer 错误: ${error.name} - ${error.message}`, 'error');
        
        // 根据错误类型采取不同的恢复策略
        switch (error.name) {
            case 'QuotaExceededError':
                this.log('缓冲区配额超出，尝试清理旧数据', 'warning');
                this.handleBufferQuotaExceeded();
                break;
                
            case 'InvalidStateError':
                this.log('SourceBuffer 状态无效，尝试恢复', 'warning');
                this.handleSourceBufferErrorRecovery();
                break;
                
            case 'NotSupportedError':
                this.log('不支持的数据格式，尝试重新初始化MediaSource', 'warning');
                this.handleFormatIncompatibility();
                break;
                
            default:
                this.log(`未知错误类型: ${error.name}，尝试恢复`, 'warning');
                this.handleSourceBufferErrorRecovery();
                break;
        }
    }

    // 处理格式不兼容
    handleFormatIncompatibility() {
        this.log('处理格式不兼容问题...', 'warning');
        
        // 如果当前使用的是MPEG-TS格式，尝试切换到MP4
        if (this.supportedMimeType && this.supportedMimeType.includes('video/mp2t')) {
            this.log('当前使用MPEG-TS格式，尝试切换到MP4格式', 'info');
            
            // 停止当前流
            this.stopStreaming();
            
            // 重新初始化，优先使用MP4
            setTimeout(() => {
                if (this.isStreaming) {
                    this.log('重新初始化MediaSource，优先使用MP4格式', 'info');
                    // 临时修改MIME类型优先级
                    const originalSupportedMimeType = this.supportedMimeType;
                    this.supportedMimeType = 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"';
                    
                    this.initMediaSource().catch(error => {
                        this.log(`重新初始化失败: ${error.message}`, 'error');
                        this.supportedMimeType = originalSupportedMimeType;
                    });
                }
            }, 2000);
        } else {
            // 如果不是MPEG-TS格式，直接停止流式播放
            this.stopStreaming();
        }
    }

    // 处理缓冲区配额超出
    handleBufferQuotaExceeded() {
        try {
            if (this.sourceBuffer && this.sourceBuffer.buffered.length > 1) {
                // 移除最早的缓冲区段
                const removeEnd = this.sourceBuffer.buffered.start(1);
                this.sourceBuffer.remove(0, removeEnd);
                this.log(`已移除 0-${removeEnd.toFixed(2)} 的缓冲区`, 'info');
                
                // 等待移除完成后继续处理
                setTimeout(() => this.processStreamQueue(), 100);
            } else {
                // 没有可移除的段，停止流式播放
                this.log('缓冲区已满且无法清理，停止流式播放', 'warning');
                this.stopStreaming();
            }
        } catch (error) {
            this.log(`清理缓冲区失败: ${error.message}`, 'error');
            this.stopStreaming();
        }
    }

    stopStreaming() {
        this.log('正在停止流式播放...', 'info');
        this.isStreaming = false;
        
        // 清空队列
        this.streamQueue = [];
        
        // 安全地清理 MediaSource 和 SourceBuffer
        this.cleanupMediaSource();
        
        this.updateStreamingStatus('流式播放已停止');
        this.log('流式播放已停止');
    }

    // 清理 MediaSource 资源
    cleanupMediaSource() {
        try {
            // 清理 SourceBuffer
            if (this.sourceBuffer) {
                try {
                    // 移除所有事件监听器
                    this.sourceBuffer.removeEventListener('updateend', this.processStreamQueue);
                    this.sourceBuffer.removeEventListener('error', this.handleSourceBufferError);
                    
                    // 如果 SourceBuffer 仍在更新，等待完成
                    if (this.sourceBuffer.updating) {
                        this.log('等待 SourceBuffer 更新完成...', 'debug');
                        setTimeout(() => this.cleanupMediaSource(), 100);
                        return;
                    }
                    
                    // 从 MediaSource 中移除 SourceBuffer
                    if (this.mediaSource && this.mediaSource.sourceBuffers.length > 0) {
                        this.mediaSource.removeSourceBuffer(this.sourceBuffer);
                        this.log('已从 MediaSource 移除 SourceBuffer', 'debug');
                    }
                } catch (sbError) {
                    this.log(`移除 SourceBuffer 失败: ${sbError.message}`, 'warning');
                } finally {
                    this.sourceBuffer = null;
                }
            }
            
            // 清理 MediaSource
            if (this.mediaSource) {
                try {
                    if (this.mediaSource.readyState === 'open') {
                        this.mediaSource.endOfStream();
                        this.log('MediaSource 流已结束', 'debug');
                    }
                } catch (msError) {
                    this.log(`结束 MediaSource 流失败: ${msError.message}`, 'warning');
                } finally {
                    this.mediaSource = null;
                }
            }
            
            // 清理视频元素的 MediaSource URL
            const video = document.querySelector('#convertedVideoContainer video');
            if (video && video.src.startsWith('blob:')) {
                URL.revokeObjectURL(video.src);
                this.log('已清理视频元素的 MediaSource URL', 'debug');
            }
            
        } catch (cleanupError) {
            this.log(`清理 MediaSource 资源时出错: ${cleanupError.message}`, 'error');
            console.error('清理资源失败:', cleanupError);
        }
    }

    // 诊断 SourceBuffer 错误
    diagnoseSourceBufferError(errorEvent) {
        try {
            this.log('=== SourceBuffer 错误诊断 ===', 'debug');
            
            // 检查 MediaSource 状态
            if (this.mediaSource) {
                this.log(`MediaSource 状态: ${this.mediaSource.readyState}`, 'debug');
            } else {
                this.log('MediaSource 对象不存在', 'error');
            }
            
            // 检查 SourceBuffer 状态
            if (this.sourceBuffer) {
                this.log(`SourceBuffer 更新状态: ${this.sourceBuffer.updating}`, 'debug');
                this.log(`SourceBuffer 模式: ${this.sourceBuffer.mode}`, 'debug');
                
                // 安全地检查缓冲区
                try {
                    if (this.sourceBuffer.buffered && this.sourceBuffer.buffered.length > 0) {
                        this.log(`缓冲区段数: ${this.sourceBuffer.buffered.length}`, 'debug');
                        for (let i = 0; i < this.sourceBuffer.buffered.length; i++) {
                            const start = this.sourceBuffer.buffered.start(i);
                            const end = this.sourceBuffer.buffered.end(i);
                            this.log(`缓冲区 ${i}: ${start.toFixed(2)} - ${end.toFixed(2)}`, 'debug');
                        }
                    } else {
                        this.log('SourceBuffer 缓冲区为空', 'debug');
                    }
                } catch (bufferError) {
                    this.log(`访问缓冲区失败: ${bufferError.message}`, 'warning');
                }
                
                // 检查时间戳偏移
                this.log(`时间戳偏移: ${this.sourceBuffer.timestampOffset}`, 'debug');
                this.log(`追加窗口: ${this.sourceBuffer.appendWindowStart} - ${this.sourceBuffer.appendWindowEnd}`, 'debug');
            } else {
                this.log('SourceBuffer 对象不存在', 'error');
            }
            
            // 检查队列状态
            this.log(`流队列长度: ${this.streamQueue.length}`, 'debug');
            this.log(`是否正在流式播放: ${this.isStreaming}`, 'debug');
            
            // 检查视频元素状态
            const video = document.querySelector('#convertedVideoContainer video');
            if (video) {
                this.log(`视频当前时间: ${video.currentTime}`, 'debug');
                this.log(`视频就绪状态: ${video.readyState}`, 'debug');
                this.log(`视频网络状态: ${video.networkState}`, 'debug');
                if (video.error) {
                    this.log(`视频错误: ${video.error.message}`, 'error');
                }
            }
            
            this.log('=== 诊断结束 ===', 'debug');
            
            // 根据诊断结果采取恢复措施
            this.handleSourceBufferErrorRecovery();
            
        } catch (diagnosisError) {
            this.log(`诊断过程中出错: ${diagnosisError.message}`, 'error');
        }
    }

    // 处理 SourceBuffer 错误恢复
    handleSourceBufferErrorRecovery() {
        this.log('尝试 SourceBuffer 错误恢复...', 'warning');
        
        // 策略1: 如果 SourceBuffer 仍然可用，尝试重置
        if (this.sourceBuffer && this.mediaSource && this.mediaSource.readyState === 'open') {
            try {
                // 清空队列防止继续添加数据
                this.streamQueue = [];
                
                // 如果 SourceBuffer 正在更新，等待完成
                if (this.sourceBuffer.updating) {
                    this.log('SourceBuffer 正在更新，等待完成...', 'warning');
                    setTimeout(() => this.handleSourceBufferErrorRecovery(), 1000);
                    return;
                }
                
                // 尝试安全地结束流
                this.safeEndStream();
                
                this.log('SourceBuffer 错误恢复处理完成', 'info');
                return;
                
            } catch (recoveryError) {
                this.log(`恢复策略1失败: ${recoveryError.message}`, 'error');
            }
        }
        
        // 策略2: 完全重置流式播放
        this.log('执行完全重置策略...', 'warning');
        this.stopStreaming();
        
        // 可选：重新初始化 MediaSource
        setTimeout(() => {
            if (this.isStreaming) {
                this.log('尝试重新初始化 MediaSource...', 'info');
                this.initMediaSource().catch(error => {
                    this.log(`重新初始化失败: ${error.message}`, 'error');
                });
            }
        }, 2000);
    }

    // 安全地结束MediaSource流
    safeEndStream() {
        if (this.mediaSource && this.mediaSource.readyState === 'open') {
            try {
                // 检查 SourceBuffer 是否仍然可用
                if (this.sourceBuffer && !this.sourceBuffer.updating) {
                    // 先移除 SourceBuffer
                    if (this.mediaSource.sourceBuffers.length > 0) {
                        this.mediaSource.removeSourceBuffer(this.sourceBuffer);
                        this.log('已移除 SourceBuffer', 'debug');
                    }
                    
                    // 然后结束流
                    this.mediaSource.endOfStream();
                    this.log('MediaSource 流已安全结束', 'debug');
                } else {
                    this.log('SourceBuffer 正在更新或不可用，跳过结束流', 'warning');
                }
            } catch (error) {
                this.log(`结束MediaSource流失败: ${error.message}`, 'warning');
                console.error('结束流失败详情:', error);
            }
        }
    }

    async getVideoDuration(inputFile) {
        // 由于 inputFile 已经在 FFmpeg 文件系统中，直接使用
        const command = [
            '-i', inputFile,
            '-f', 'null',
            '-'
        ];
        
        try {
            // 执行命令获取时长
            await this.ffmpeg.exec(command);
            
            // 简化处理，返回默认值
            // 在实际应用中，应该从FFmpeg的输出中解析时长信息
            this.log('使用默认视频时长: 60秒');
            return 60; // 默认60秒
        } catch (error) {
            this.log(`获取视频时长失败: ${error.message}`, 'warning');
            this.log('使用默认视频时长: 60秒');
            return 60; // 默认值
        }
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new FFmpegDemo();
});

// 添加全局错误处理
window.addEventListener('error', (event) => {
    console.error('全局错误:', event.error);
    
    // 特殊处理 SourceBuffer 相关错误
    if (event.error && event.error.name === 'InvalidStateError') {
        console.warn('检测到 SourceBuffer 状态错误，可能是正常的状态清理过程');
        // 不显示给用户，因为这通常是正常的资源清理过程
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('未处理的 Promise 拒绝:', event.reason);
});