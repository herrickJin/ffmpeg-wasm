import FFmpegProcessor from './ffmpeg-processor.js';
import { FFmpegTools } from './ffmpeg-tools';

interface BufferMonitor {
    totalChunksAdded: number;
    totalChunksProcessed: number;
    totalBytesProcessed: number;
    lastErrorTime: number | null;
    consecutiveErrors: number;
    bufferHealth: string;
    lastBufferCheck: number;
}

interface PerformanceMetrics {
    conversionTime: number;
    originalSize: number;
    convertedSize: number;
    memoryUsage: number;
}

class FFmpegDemo {
    private ffmpegProcessor: FFmpegProcessor | null = null;
    private originalFile: File | null = null;
    private isConverting: boolean = false;
    private startTime: number | null = null;
    private mediaSource: MediaSource | null = null;
    private sourceBuffer: SourceBuffer | null = null;
    private supportedMimeType: string | null = null;
    private streamQueue: Uint8Array[] = [];
    private isStreaming: boolean = false;
    private performanceMetrics: PerformanceMetrics = {
        conversionTime: 0,
        originalSize: 0,
        convertedSize: 0,
        memoryUsage: 0
    };
    private debugMode: boolean = false;
    private bufferMonitor: BufferMonitor = {
        totalChunksAdded: 0,
        totalChunksProcessed: 0,
        totalBytesProcessed: 0,
        lastErrorTime: null,
        consecutiveErrors: 0,
        bufferHealth: 'good',
        lastBufferCheck: Date.now()
    };
    private performanceMonitor: number | null = null;

    constructor() {
        this.debugMode = this.getDebugMode();
        this.initFFmpegProcessor();
        this.setupEventListeners();
        this.log('FFmpeg WASM Demo 开始初始化');
        if (this.debugMode) {
            this.log('调试模式已启用', 'debug');
        }
    }

    async init(): Promise<void> {
        await this.initFFmpegProcessor();
        this.setupEventListeners();
        this.log('FFmpeg WASM Demo 初始化完成');
    }

    async initFFmpegProcessor(): Promise<void> {
        this.log('正在初始化 FFmpeg 处理器...');
        
        try {
            this.ffmpegProcessor = new FFmpegProcessor({
                debugMode: this.debugMode
            });
            
            this.ffmpegProcessor
                .onProgress((progress) => this.updateProgress(progress))
                .onLog((message, type) => this.log(message, type))
                .onError((error) => this.log(`FFmpeg 错误: ${error.message}`, 'error'));
            
            await this.ffmpegProcessor.initialize();
            
            this.log('FFmpeg 处理器初始化完成');
            
            if (this.originalFile) {
                const convertBtn = document.getElementById('convertBtn') as HTMLButtonElement;
                if (convertBtn) {
                    convertBtn.disabled = false;
                }
                this.log('转码功能已启用');
            }
            
        } catch (error) {
            this.log(`FFmpeg 处理器初始化失败: ${(error as Error).message}`, 'error');
            console.error('FFmpeg 处理器初始化失败:', error);
            this.log('文件上传功能已启用，但转码功能可能不可用', 'warning');
        }
    }

    async checkFilesystemHealth(): Promise<boolean> {
        if (!this.ffmpegProcessor) {
            this.log('FFmpeg 处理器未初始化', 'error');
            return false;
        }
        
        return await this.ffmpegProcessor.checkFilesystemHealth();
    }

    getDebugMode(): boolean {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('debug')) {
            return urlParams.get('debug') === 'true';
        }
        
        try {
            const savedDebugMode = localStorage.getItem('ffmpeg-debug-mode');
            if (savedDebugMode !== null) {
                return savedDebugMode === 'true';
            }
        } catch (e) {
            // 忽略本地存储错误
        }
        
        return false;
    }

    setupEventListeners(): void {
        const uploadSection = document.getElementById('uploadSection');
        const fileInput = document.getElementById('fileInput') as HTMLInputElement;
        const convertBtn = document.getElementById('convertBtn') as HTMLButtonElement;
        const stopStreamingBtn = document.getElementById('stopStreamingBtn') as HTMLButtonElement;
        const crfSlider = document.getElementById('crf') as HTMLInputElement;
        const crfValue = document.getElementById('crfValue');

        if (!uploadSection || !fileInput || !convertBtn) {
            this.log('错误: 无法找到页面元素', 'error');
            return;
        }

        this.log('设置事件监听器...');

        uploadSection.addEventListener('click', () => {
            this.log('点击上传区域');
            fileInput.click();
        });
        
        uploadSection.addEventListener('dragover', (e: DragEvent) => {
            e.preventDefault();
            uploadSection.classList.add('dragover');
            this.log('拖拽文件到上传区域');
        });
        
        uploadSection.addEventListener('dragleave', () => {
            uploadSection.classList.remove('dragover');
            this.log('拖拽离开上传区域');
        });
        
        uploadSection.addEventListener('drop', (e: DragEvent) => {
            e.preventDefault();
            uploadSection.classList.remove('dragover');
            this.log('文件已拖拽到上传区域');
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                this.handleFileSelect(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', (e: Event) => {
            this.log('文件选择器发生变化');
            const target = e.target as HTMLInputElement;
            if (target.files && target.files.length > 0) {
                this.handleFileSelect(target.files[0]);
            }
        });

        convertBtn.addEventListener('click', () => {
            if (!this.isConverting) {
                this.startConversion();
            }
        });

        if (stopStreamingBtn) {
            stopStreamingBtn.addEventListener('click', () => {
                this.stopStreaming();
                stopStreamingBtn.style.display = 'none';
                convertBtn.style.display = 'block';
            });
        }

        if (crfSlider && crfValue) {
            crfSlider.addEventListener('input', (e: Event) => {
                crfValue.textContent = (e.target as HTMLInputElement).value;
            });
        }

        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                this.toggleDebugMode();
            }
        });
    }

    toggleDebugMode(): void {
        this.debugMode = !this.debugMode;
        
        try {
            localStorage.setItem('ffmpeg-debug-mode', this.debugMode.toString());
        } catch (e) {
            console.warn('无法保存调试模式设置到本地存储');
        }
        
        const status = this.debugMode ? '已启用' : '已禁用';
        this.log(`调试模式${status}`, 'info');
        
        if (this.debugMode) {
            this.log('当前系统状态:', 'debug');
            this.log(`- FFmpeg 处理器状态: ${this.ffmpegProcessor ? '已加载' : '未加载'}`, 'debug');
            this.log(`- 是否正在转码: ${this.isConverting}`, 'debug');
            this.log(`- 是否正在流式播放: ${this.isStreaming}`, 'debug');
            this.log(`- 队列长度: ${this.streamQueue.length}`, 'debug');
            this.log(`- MediaSource 状态: ${this.mediaSource ? this.mediaSource.readyState : '不存在'}`, 'debug');
            this.log(`- SourceBuffer 状态: ${this.sourceBuffer ? '存在' : '不存在'}`, 'debug');
            
            if (this.ffmpegProcessor) {
                const stats = this.ffmpegProcessor.getPerformanceStats();
                this.log(`- FFmpeg 处理器统计: ${JSON.stringify(stats)}`, 'debug');
            }
        }
    }

    handleFileSelect(file: File): void {
        if (!file.type.startsWith('video/')) {
            this.log('请选择视频文件', 'error');
            return;
        }

        this.originalFile = file;
        this.performanceMetrics.originalSize = file.size;
        
        this.displayOriginalVideo(file);
        
        const convertBtn = document.getElementById('convertBtn') as HTMLButtonElement;
        if (convertBtn) {
            if (this.ffmpegProcessor) {
                convertBtn.disabled = false;
                this.log(`已选择文件: ${file.name} (${FFmpegTools.formatFileSize(file.size)})`);
            } else {
                convertBtn.disabled = true;
                this.log(`已选择文件: ${file.name} (${FFmpegTools.formatFileSize(file.size)})`, 'warning');
                this.log('FFmpeg 正在加载中，请稍后再试', 'warning');
            }
        }
    }

    displayOriginalVideo(file: File): void {
        const container = document.getElementById('originalVideoContainer');
        if (!container) return;
        
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

    async startConversion(): Promise<void> {
        if (!this.originalFile || this.isConverting) return;

        this.isConverting = true;
        this.startTime = performance.now();
        
        const convertBtn = document.getElementById('convertBtn') as HTMLButtonElement;
        const stopStreamingBtn = document.getElementById('stopStreamingBtn') as HTMLButtonElement;
        const progressSection = document.getElementById('progressSection');
        const streamingModeSelect = document.getElementById('streamingMode') as HTMLSelectElement;
        
        if (!convertBtn || !progressSection || !streamingModeSelect) return;
        
        const streamingMode = streamingModeSelect.value;
        
        convertBtn.innerHTML = '转码中<span class="loading"></span>';
        convertBtn.disabled = true;
        progressSection.style.display = 'block';
        
        if (streamingMode === 'realtime') {
            convertBtn.style.display = 'none';
            if (stopStreamingBtn) {
                stopStreamingBtn.style.display = 'block';
            }
        }
        
        this.log('开始转码...');
        
        try {
            await this.convertVideo();
            this.log('转码完成');
        } catch (error) {
            this.log(`转码失败: ${(error as Error).message}`, 'error');
            console.error('转码失败:', error);
        } finally {
            this.isConverting = false;
            convertBtn.innerHTML = '开始转码';
            convertBtn.disabled = false;
            convertBtn.style.display = 'block';
            if (stopStreamingBtn) {
                stopStreamingBtn.style.display = 'none';
            }
        }
    }

    async convertVideo(): Promise<void> {
        if (!this.ffmpegProcessor) {
            throw new Error('FFmpeg 处理器未初始化');
        }

        const outputFormatSelect = document.getElementById('outputFormat') as HTMLSelectElement;
        const videoCodecSelect = document.getElementById('videoCodec') as HTMLSelectElement;
        const crfInput = document.getElementById('crf') as HTMLInputElement;
        const presetSelect = document.getElementById('preset') as HTMLSelectElement;
        const threadsSelect = document.getElementById('threads') as HTMLSelectElement;
        const performanceModeSelect = document.getElementById('performanceMode') as HTMLSelectElement;
        const hardwareAccelerationSelect = document.getElementById('hardwareAcceleration') as HTMLSelectElement;
        const streamingModeSelect = document.getElementById('streamingMode') as HTMLSelectElement;
        
        if (!outputFormatSelect || !videoCodecSelect || !crfInput || !presetSelect || 
            !threadsSelect || !performanceModeSelect || !hardwareAccelerationSelect || !streamingModeSelect) {
            throw new Error('无法获取转码参数');
        }
        
        const outputFormat = outputFormatSelect.value;
        const videoCodec = videoCodecSelect.value;
        const crf = crfInput.value;
        const preset = presetSelect.value;
        const threads = threadsSelect.value;
        const performanceMode = performanceModeSelect.value;
        const hardwareAcceleration = hardwareAccelerationSelect.value;
        const streamingMode = streamingModeSelect.value;
        
        const outputFileName = `converted_${Date.now()}.${outputFormat}`;
        
        this.log('=== 转码开始 ===');
        this.log(`输入文件: ${this.originalFile!.name} (${FFmpegTools.formatFileSize(this.originalFile!.size)})`);
        this.log(`输出格式: ${outputFormat}`);
        this.log(`视频编码器: ${videoCodec}`);
        this.log(`质量设置: CRF=${crf}`);
        this.log(`速度预设: ${preset}`);
        this.log(`线程数: ${threads === '0' ? '自动' : threads + ' 线程'}`);
        this.log(`性能模式: ${this.getPerformanceModeText(performanceMode)}`);
        this.log(`硬件加速: ${this.getHardwareAccelerationText(hardwareAcceleration)}`);
        this.log(`流式处理: ${this.getStreamingModeText(streamingMode)}`);
        
        const filesystemHealthy = await this.checkFilesystemHealth();
        if (!filesystemHealthy) {
            throw new Error('FFmpeg 文件系统状态异常，无法进行转码');
        }
        
        if (streamingMode === 'none') {
            await this.normalConversion({
                inputFile: this.originalFile!,
                outputFileName,
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
                inputFile: this.originalFile!,
                outputFileName,
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
                inputFile: this.originalFile!,
                outputFileName,
                videoCodec,
                crf,
                preset,
                threads,
                performanceMode,
                hardwareAcceleration,
                outputFormat
            });
        }
        
        this.log('=== 转码完成 ===');
    }

    displayConvertedVideo(blob: Blob, filename: string): void {
        const container = document.getElementById('convertedVideoContainer');
        if (!container) return;
        
        const video = document.createElement('video');
        video.src = URL.createObjectURL(blob);
        video.controls = true;
        video.autoplay = true;
        video.muted = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '400px';
        
        container.innerHTML = '';
        container.appendChild(video);
        
        const downloadLink = document.createElement('a');
        downloadLink.href = video.src;
        downloadLink.download = filename;
        downloadLink.textContent = `下载 ${filename}`;
        downloadLink.style.display = 'block';
        downloadLink.style.marginTop = '10px';
        downloadLink.style.color = '#667eea';
        downloadLink.style.textDecoration = 'none';
        
        container.appendChild(downloadLink);
        
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
            this.attemptAutoPlay(video);
        });
        
        video.addEventListener('canplay', () => {
            this.attemptAutoPlay(video);
        });
    }

    updateProgress(progress: any): void {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        if (!progressFill || !progressText || !progress || typeof progress !== 'object') {
            this.log('进度数据无效', 'warning');
            return;
        }
        
        let percentage = 0;
        if (progress.ratio !== undefined && progress.ratio !== null && !isNaN(progress.ratio)) {
            percentage = Math.round(progress.ratio * 100);
        } else if (progress.progress !== undefined && progress.progress !== null && !isNaN(progress.progress)) {
            percentage = Math.round(progress.progress * 100);
        } else {
            this.log('进度比率无效，使用默认值 0%', 'warning');
        }
        
        percentage = Math.max(0, Math.min(100, percentage));
        
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `转码进度: ${percentage}%`;
        
        if (progress.time !== undefined && progress.time !== null && !isNaN(progress.time)) {
            const time = FFmpegTools.formatTime(progress.time);
            progressText.textContent += ` | 已处理: ${time}`;
            
            if (percentage % 10 === 0 && percentage > 0) {
                this.log(`转码进度: ${percentage}% - 已处理时间: ${time}`);
            }
        }
        
        if (progress.duration !== undefined && progress.duration !== null && !isNaN(progress.duration) &&
            progress.time !== undefined && progress.time !== null && !isNaN(progress.time)) {
            const remaining = Math.max(0, progress.duration - progress.time);
            const remainingFormatted = FFmpegTools.formatTime(remaining);
            this.log(`详细进度: ${percentage}% | 已用: ${FFmpegTools.formatTime(progress.time)} | 剩余: ${remainingFormatted}`);
        }
        
        this.log(`原始进度数据: ${JSON.stringify(progress)}`, 'debug');
    }

    updatePerformanceMetrics(): void {
        const metrics = this.performanceMetrics;
        const performanceInfo = document.getElementById('performanceInfo');
        
        if (!performanceInfo) return;
        
        const timeSeconds = (metrics.conversionTime / 1000).toFixed(2);
        const sizeChangeNum = (metrics.convertedSize - metrics.originalSize) / metrics.originalSize * 100;
        const sizeChange = sizeChangeNum.toFixed(1);
        const speed = (metrics.originalSize / 1024 / 1024 / (metrics.conversionTime / 1000)).toFixed(2);
        
        const conversionTimeElement = document.getElementById('conversionTime');
        const fileSizeChangeElement = document.getElementById('fileSizeChange');
        const processingSpeedElement = document.getElementById('processingSpeed');
        const memoryUsageElement = document.getElementById('memoryUsage');
        
        if (conversionTimeElement) conversionTimeElement.textContent = `${timeSeconds} 秒`;
        if (fileSizeChangeElement) fileSizeChangeElement.textContent = `${sizeChangeNum > 0 ? '+' : ''}${sizeChange}%`;
        if (processingSpeedElement) processingSpeedElement.textContent = `${speed} MB/s`;
        
        if (performance.memory) {
            const memoryMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1);
            if (memoryUsageElement) memoryUsageElement.textContent = `${memoryMB} MB`;
            metrics.memoryUsage = parseFloat(memoryMB);
        } else {
            if (memoryUsageElement) memoryUsageElement.textContent = '不支持';
        }
        
        performanceInfo.style.display = 'block';
        
        this.log(`性能指标 - 时间: ${timeSeconds}s, 大小变化: ${sizeChange}%, 速度: ${speed}MB/s`);
    }

    log(message: string, type: string = 'info'): void {
        if (type === 'debug') {
            if (this.debugMode) {
                console.log(`[FFmpeg Demo DEBUG] ${message}`);
                if (this.debugMode) {
                    this.addToLogUI(message, type);
                }
            }
            return;
        }
        
        console.log(`[FFmpeg Demo] ${message}`);
        this.addToLogUI(message, type);
    }

    addToLogUI(message: string, type: string = 'info'): void {
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

  
    getPerformanceModeText(mode: string): string {
        const modes: Record<string, string> = {
            'balanced': '平衡模式',
            'speed': '速度优先',
            'quality': '质量优先',
            'lowcpu': '低CPU占用'
        };
        return modes[mode] || mode;
    }

    getHardwareAccelerationText(hwType: string): string {
        const types: Record<string, string> = {
            'none': '无',
            'auto': '自动检测',
            'cuda': 'CUDA (NVIDIA)',
            'qsv': 'Intel QSV',
            'videotoolbox': 'VideoToolbox (Mac)'
        };
        return types[hwType] || hwType;
    }

    getStreamingModeText(mode: string): string {
        const modes: Record<string, string> = {
            'none': '禁用',
            'segment': '分段转码',
            'realtime': '实时转码'
        };
        return modes[mode] || mode;
    }

    async normalConversion(options: any): Promise<void> {
        this.log('开始普通转码处理...');
        
        try {
            const outputData = await this.ffmpegProcessor!.convertFile(options);
            const convertedBlob = new Blob([outputData as BlobPart], { type: `video/${options.outputFormat}` });
            
            this.log(`转码后文件大小: ${FFmpegTools.formatFileSize(convertedBlob.size)}`);
            
            this.performanceMetrics.convertedSize = convertedBlob.size;
            this.performanceMetrics.conversionTime = performance.now() - (this.startTime || 0);
            
            this.log('正在生成转码后的视频预览...');
            this.displayConvertedVideo(convertedBlob, options.outputFileName);
            
            this.updatePerformanceMetrics();
            
        } catch (error) {
            this.log(`普通转码失败: ${(error as Error).message}`, 'error');
            throw new Error(`转码失败: ${(error as Error).message}`);
        }
    }

    async segmentedConversion(options: any): Promise<void> {
        this.log('开始分段转码处理...');
        
        try {
            const segments = await this.ffmpegProcessor!.convertSegmented(options);
            
            this.log('合并分段文件...');
            const combinedData = new Blob(segments as BlobPart[], { type: `video/${options.outputFormat}` });
            
            this.performanceMetrics.convertedSize = combinedData.size;
            this.performanceMetrics.conversionTime = performance.now() - (this.startTime || 0);
            
            this.log('正在生成转码后的视频预览...');
            this.displayConvertedVideo(combinedData, options.outputFileName);
            
            this.updatePerformanceMetrics();
            
        } catch (error) {
            this.log(`分段转码失败: ${(error as Error).message}`, 'error');
            throw new Error(`分段转码失败: ${(error as Error).message}`);
        }
    }

    async realtimeConversion(options: any): Promise<void> {
        if (!this.ffmpegProcessor) {
            throw new Error('FFmpeg 处理器未初始化');
        }

        this.log('开始实时转码和流式播放...');
        
        await this.ffmpegProcessor.writeFile('input.mp4', options.inputFile);
        
        let streamingAttempt = 0;
        const maxStreamingAttempts = 2;
        
        while (streamingAttempt < maxStreamingAttempts) {
            streamingAttempt++;
            this.log(`流式播放尝试 ${streamingAttempt}/${maxStreamingAttempts}`);
            
            try {
                this.supportedMimeType = null;
                this.isStreaming = true;
                this.streamQueue = [];
                
                this.bufferMonitor = {
                    totalChunksAdded: 0,
                    totalChunksProcessed: 0,
                    totalBytesProcessed: 0,
                    lastErrorTime: null,
                    consecutiveErrors: 0,
                    bufferHealth: 'good',
                    lastBufferCheck: Date.now()
                };
                
                this.startPerformanceMonitoring();
                
                await this.initMediaSource();
                
                const chunkDuration = 8;
                let currentChunk = 0;
                let totalDuration = 0;
                let consecutiveErrors = 0;
                const maxConsecutiveErrors = 3;
                
                totalDuration = await this.ffmpegProcessor.getVideoDuration('input.mp4');
                this.log(`视频总时长: ${totalDuration}秒`);
                
                if (this.sourceBuffer) {
                    this.sourceBuffer.timestampOffset = 0;
                    this.log('设置 SourceBuffer 时间戳偏移为 0');
                }
                
                while (currentChunk * chunkDuration < totalDuration && this.isStreaming) {
                    if (consecutiveErrors >= maxConsecutiveErrors) {
                        this.log('连续错误过多，停止流式播放', 'error');
                        throw new Error('流式播放连续错误过多');
                    }
                    
                    const startTime = currentChunk * chunkDuration;
                    let chunkExtension = '.ts';
                    
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
                        
                        await this.ffmpegProcessor.convertChunk({
                            input: 'input.mp4',
                            output: chunkName,
                            startTime,
                            duration: chunkDuration,
                            videoCodec: options.videoCodec,
                            crf: options.crf,
                            preset: 'ultrafast',
                            outputFormat: chunkExtension.substring(1)
                        });
                        
                        let chunkData;
                        try {
                            chunkData = await this.ffmpegProcessor.readFile(chunkName);
                            console.log('读取分片数据成功', chunkData);
                            
                            if (this.sourceBuffer && currentChunk > 0) {
                                this.sourceBuffer.timestampOffset = startTime;
                                this.log(`更新时间戳偏移为: ${startTime}s`);
                            }
                            
                            await this.addChunkToStreamWithRetry(chunkData, 3);
                        } catch (readError) {
                            this.log(`读取分片文件失败: ${(readError as Error).message}`, 'error');
                            throw new Error(`无法读取分片文件: ${(readError as Error).message}`);
                        }
                        
                        try {
                            await this.ffmpegProcessor.deleteFile(chunkName);
                        } catch (deleteError) {
                            this.log(`删除分片文件失败: ${(deleteError as Error).message}`, 'warning');
                        }
                        
                        currentChunk++;
                        consecutiveErrors = 0;
                        this.log(`第 ${currentChunk} 片已添加到播放队列 (已处理时长: ${currentChunk * chunkDuration}s)`);
                        
                        await new Promise(resolve => setTimeout(resolve, 200));
                        
                    } catch (chunkError) {
                        consecutiveErrors++;
                        this.log(`转码第 ${currentChunk + 1} 片失败: ${(chunkError as Error).message}`, 'error');
                        console.error('分片转码错误:', chunkError);
                        
                        if (currentChunk * chunkDuration >= totalDuration - chunkDuration) {
                            this.log('已处理到最后一个分片，忽略错误', 'warning');
                            break;
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
                
                this.log('所有分片转码完成');
                break;
                
            } catch (error) {
                this.log(`流式播放尝试 ${streamingAttempt} 失败: ${(error as Error).message}`, 'error');
                console.error('实时转码错误:', error);
                
                this.stopStreaming();
                
                if (streamingAttempt >= maxStreamingAttempts) {
                    this.log('流式播放多次尝试失败，降级到普通转码模式', 'warning');
                    await this.fallbackToNormalConversion(options);
                    return;
                }
                
                this.log('等待 2 秒后重试...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            } finally {
                this.isStreaming = false;
                this.stopPerformanceMonitoring();
            }
        }
        
        try {
            await this.ffmpegProcessor.deleteFile('input.mp4');
        } catch (error) {
            this.log(`清理输入文件失败: ${(error as Error).message}`, 'warning');
        }
        
        this.performanceMetrics.conversionTime = performance.now() - (this.startTime || 0);
        this.updatePerformanceMetrics();
        
        this.log('实时转码和流式播放完成');
    }

    async initMediaSource(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!window.MediaSource) {
                reject(new Error('浏览器不支持MediaSource API'));
                return;
            }
            
            this.mediaSource = new MediaSource();
            this.mediaSource.addEventListener('sourceopen', () => {
                this.log('MediaSource已打开');
                
                try {
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
                    
                    this.sourceBuffer.addEventListener('updateend', () => {
                        this.processStreamQueue();
                    });
                    
                    this.sourceBuffer.addEventListener('error', (e) => {
                        const errorMessage = (e as any).message || (e as any).error || JSON.stringify(e);
                        this.log(`SourceBuffer错误: ${errorMessage}`, 'error');
                        console.error('SourceBuffer错误详情:', e);
                        this.diagnoseSourceBufferError(e);
                    });
                    
                    this.sourceBuffer.addEventListener('abort', () => {
                        this.log('SourceBuffer操作被中止', 'warning');
                    });
                    
                    this.log('SourceBuffer创建成功');
                    resolve();
                } catch (error) {
                    this.log(`创建SourceBuffer失败: ${(error as Error).message}`, 'error');
                    console.error('创建SourceBuffer失败详情:', error);
                    reject(error);
                }
            });
            
            this.mediaSource.addEventListener('error', (e) => {
                const errorMessage = (e as any).message || (e as any).error || JSON.stringify(e);
                this.log(`MediaSource错误: ${errorMessage}`, 'error');
                console.error('MediaSource错误详情:', e);
            });
            
            this.createStreamingVideo();
        });
    }

    createStreamingVideo(): void {
        const container = document.getElementById('convertedVideoContainer');
        if (!container || !this.mediaSource) return;
        
        container.innerHTML = '';
        
        const video = document.createElement('video');
        video.src = URL.createObjectURL(this.mediaSource);
        video.controls = true;
        video.autoplay = true;
        video.muted = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '400px';
        video.style.backgroundColor = '#000';
        
        video.addEventListener('error', (e) => {
            this.log(`视频元素错误: ${video.error ? video.error.message : '未知错误'}`, 'error');
            this.updateStreamingStatus('视频播放错误');
            this.stopStreaming();
        });
        
        container.appendChild(video);
        
        const statusDiv = document.createElement('div');
        statusDiv.id = 'streamingStatus';
        statusDiv.style.marginTop = '10px';
        statusDiv.style.padding = '10px';
        statusDiv.style.backgroundColor = '#f0f0f0';
        statusDiv.style.borderRadius = '5px';
        statusDiv.style.fontSize = '14px';
        statusDiv.textContent = '正在准备流式播放...';
        container.appendChild(statusDiv);
        
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
            this.attemptAutoPlay(video);
        });
        
        video.addEventListener('canplay', () => {
            this.updateStreamingStatus('可以播放');
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
        
        this.waitForFirstChunkAndPlay(video);
    }

    updateStreamingStatus(status: string): void {
        const statusDiv = document.getElementById('streamingStatus');
        if (statusDiv) {
            statusDiv.textContent = `流式播放状态: ${status}`;
        }
    }

    async attemptAutoPlay(video: HTMLVideoElement): Promise<void> {
        if (!video || !this.mediaSource || this.mediaSource.readyState !== 'open') {
            this.log('视频或 MediaSource 不可用，无法自动播放', 'warning');
            return;
        }
        
        if (this.sourceBuffer && this.sourceBuffer.buffered.length > 0) {
            const bufferedEnd = this.sourceBuffer.buffered.end(this.sourceBuffer.buffered.length - 1);
            if (bufferedEnd < 2) {
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
                this.log(`自动播放失败: ${(error as Error).message}`, 'warning');
                this.updateStreamingStatus('点击播放按钮开始播放');
            }
        }
    }

    waitForFirstChunkAndPlay(video: HTMLVideoElement): void {
        const checkInterval = setInterval(() => {
            if (!this.sourceBuffer || !this.mediaSource || this.mediaSource.readyState !== 'open') {
                clearInterval(checkInterval);
                this.log('MediaSource 或 SourceBuffer 已不可用', 'warning');
                return;
            }
            
            let hasData = false;
            try {
                hasData = this.streamQueue.length > 0 || (this.sourceBuffer && this.sourceBuffer.buffered.length > 0);
            } catch (error) {
                clearInterval(checkInterval);
                this.log('SourceBuffer 已被移除，停止等待', 'warning');
                return;
            }
            
            if (hasData) {
                clearInterval(checkInterval);
                this.log('检测到视频数据，尝试自动播放');
                setTimeout(() => {
                    this.attemptAutoPlay(video);
                }, 500);
            }
        }, 100);

        setTimeout(() => {
            clearInterval(checkInterval);
            if (video && video.paused) {
                this.log('等待视频数据超时', 'warning');
            }
        }, 30000);
    }

    addChunkToStream(chunkData: Uint8Array): void {
        if (!this.isStreaming) {
            this.log('流式播放已停止，跳过添加分片', 'warning');
            return;
        }
        
        this.streamQueue.push(chunkData);
        
        if (this.streamQueue.length === 1) {
            this.log('第一个视频分片已添加，准备播放');
        }
        
        this.processStreamQueue();
    }

    async addChunkToStreamWithRetry(chunkData: Uint8Array, maxRetries: number = 3): Promise<void> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.log(`尝试添加分片到流 (第 ${attempt} 次)`);
                
                return new Promise((resolve, reject) => {
                    const originalAddChunk = () => {
                        if (!this.isStreaming) {
                            reject(new Error('流式播放已停止'));
                            return;
                        }
                        
                        this.streamQueue.push(chunkData);
                        this.processStreamQueue();
                        
                        const timeout = setTimeout(() => {
                            if (this.streamQueue.length === 0) {
                                resolve();
                            } else {
                                reject(new Error('添加分片超时'));
                            }
                        }, 5000);
                        
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
                this.log(`第 ${attempt} 次添加分片失败: ${(error as Error).message}`, 'warning');
                
                if (attempt === maxRetries) {
                    throw new Error(`添加分片到流失败，已重试 ${maxRetries} 次`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async fallbackToNormalConversion(options: any): Promise<void> {
        this.log('开始降级到普通转码模式...', 'warning');
        
        try {
            this.updateStreamingStatus('正在降级到普通转码模式...');
            await this.normalConversion(options);
            this.log('已成功降级到普通转码模式', 'info');
        } catch (error) {
            this.log(`降级转码也失败: ${(error as Error).message}`, 'error');
            throw error;
        }
    }

    processStreamQueue(): void {
        if (!this.sourceBuffer || !this.mediaSource || this.mediaSource.readyState !== 'open') {
            this.log('MediaSource 或 SourceBuffer 不可用，停止处理队列', 'warning');
            this.streamQueue = [];
            return;
        }
        
        if (this.sourceBuffer.updating || this.streamQueue.length === 0) {
            return;
        }
        
        const video = document.querySelector('#convertedVideoContainer video') as HTMLVideoElement;
        if (video && video.error) {
            this.log(`视频元素错误: ${video.error.message}`, 'error');
            this.stopStreaming();
            return;
        }
        
        const bufferStatus = this.analyzeBufferHealth();
        if (bufferStatus.shouldWait) {
            this.log(bufferStatus.message, 'warning');
            setTimeout(() => this.processStreamQueue(), bufferStatus.waitTime);
            return;
        }
        
        const chunk = this.streamQueue.shift();
        if (!chunk) return;
        
        try {
            this.log(`正在添加分片到SourceBuffer，大小: ${chunk.length} 字节`);
            
            this.bufferMonitor.totalChunksAdded++;
            this.bufferMonitor.totalBytesProcessed += chunk.length;
            
            const errorHandler = (event: Event) => {
                this.sourceBuffer?.removeEventListener('error', errorHandler);
                this.bufferMonitor.lastErrorTime = Date.now();
                this.bufferMonitor.consecutiveErrors++;
                this.bufferMonitor.bufferHealth = 'poor';
                this.log(`分片添加过程中发生错误`, 'error');
                this.handleSourceBufferErrorRecovery();
            };
            
            this.sourceBuffer.addEventListener('error', errorHandler);
            
            setTimeout(() => {
                try {
                    this.sourceBuffer?.appendBuffer(chunk as BufferSource);
                    this.log(`已添加分片到播放队列，剩余队列: ${this.streamQueue.length}`);
                    
                    this.bufferMonitor.totalChunksProcessed++;
                    this.bufferMonitor.consecutiveErrors = 0;
                    this.bufferMonitor.bufferHealth = 'good';
                    
                    this.sourceBuffer?.removeEventListener('error', errorHandler);
                    
                    if (video && video.paused) {
                        const bufferedLength = this.sourceBuffer?.buffered.length || 0;
                        let totalBufferedDuration = 0;
                        
                        if (bufferedLength > 0 && this.sourceBuffer) {
                            const lastBufferedEnd = this.sourceBuffer.buffered.end(bufferedLength - 1);
                            totalBufferedDuration = lastBufferedEnd;
                        }
                        
                        if (totalBufferedDuration >= 3) {
                            setTimeout(() => {
                                this.attemptAutoPlay(video);
                            }, 500);
                        }
                    }
                } catch (appendError) {
                    this.sourceBuffer?.removeEventListener('error', errorHandler);
                    this.handleAppendError(appendError as Error, chunk);
                }
            }, 0);
            
        } catch (error) {
            this.log(`添加分片失败: ${(error as Error).message}`, 'error');
            console.error('SourceBuffer appendBuffer error:', error);
            this.handleAppendError(error as Error, chunk);
        }
    }

    analyzeBufferHealth(): { shouldWait: boolean; waitTime: number; message: string } {
        const result = {
            shouldWait: false,
            waitTime: 1000,
            message: ''
        };
        
        try {
            const video = document.querySelector('#convertedVideoContainer video') as HTMLVideoElement;
            
            if (!this.sourceBuffer || !this.sourceBuffer.buffered || this.sourceBuffer.buffered.length === 0) {
                return result;
            }
            
            const bufferedEnd = this.sourceBuffer.buffered.end(this.sourceBuffer.buffered.length - 1);
            const currentTime = video ? video.currentTime : 0;
            const bufferAhead = bufferedEnd - currentTime;
            
            if (this.sourceBuffer.buffered.length > 5) {
                result.shouldWait = true;
                result.message = '缓冲区段数过多，暂停添加';
                result.waitTime = 2000;
                return result;
            }
            
            if (bufferAhead > 30) {
                result.shouldWait = true;
                result.message = `缓冲区提前过多 (${bufferAhead.toFixed(1)}s)，暂停添加`;
                result.waitTime = 2000;
                return result;
            }
            
            if (this.streamQueue.length > 5) {
                result.shouldWait = true;
                result.message = '队列过长，暂停添加';
                result.waitTime = 500;
                return result;
            }
            
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
            this.log(`分析缓冲区健康状态失败: ${(error as Error).message}`, 'warning');
            result.shouldWait = true;
            result.message = '缓冲区分析失败，暂停添加';
            result.waitTime = 2000;
        }
        
        return result;
    }

    startPerformanceMonitoring(): void {
        if (this.performanceMonitor) {
            clearInterval(this.performanceMonitor);
        }
        
        this.performanceMonitor = window.setInterval(() => {
            this.logPerformanceStats();
        }, 10000);
    }

    stopPerformanceMonitoring(): void {
        if (this.performanceMonitor) {
            clearInterval(this.performanceMonitor);
            this.performanceMonitor = null;
        }
    }

    logPerformanceStats(): void {
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
        
        if (stats.consecutiveErrors > 5) {
            this.log('检测到连续错误过多，触发恢复机制', 'warning');
            this.handleSourceBufferErrorRecovery();
        }
    }

    handleAppendError(error: Error, chunk: Uint8Array): void {
        this.log(`处理 appendBuffer 错误: ${error.name} - ${error.message}`, 'error');
        
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

    handleFormatIncompatibility(): void {
        this.log('处理格式不兼容问题...', 'warning');
        
        if (this.supportedMimeType && this.supportedMimeType.includes('video/mp2t')) {
            this.log('当前使用MPEG-TS格式，尝试切换到MP4格式', 'info');
            
            this.stopStreaming();
            
            setTimeout(() => {
                if (this.isStreaming) {
                    this.log('重新初始化MediaSource，优先使用MP4格式', 'info');
                    const originalSupportedMimeType = this.supportedMimeType;
                    this.supportedMimeType = 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"';
                    
                    this.initMediaSource().catch(error => {
                        this.log(`重新初始化失败: ${(error as Error).message}`, 'error');
                        this.supportedMimeType = originalSupportedMimeType;
                    });
                }
            }, 2000);
        } else {
            this.stopStreaming();
        }
    }

    handleBufferQuotaExceeded(): void {
        try {
            if (this.sourceBuffer && this.sourceBuffer.buffered.length > 1) {
                const removeEnd = this.sourceBuffer.buffered.start(1);
                this.sourceBuffer.remove(0, removeEnd);
                this.log(`已移除 0-${removeEnd.toFixed(2)} 的缓冲区`, 'info');
                
                setTimeout(() => this.processStreamQueue(), 100);
            } else {
                this.log('缓冲区已满且无法清理，停止流式播放', 'warning');
                this.stopStreaming();
            }
        } catch (error) {
            this.log(`清理缓冲区失败: ${(error as Error).message}`, 'error');
            this.stopStreaming();
        }
    }

    stopStreaming(): void {
        this.log('正在停止流式播放...', 'info');
        this.isStreaming = false;
        
        this.streamQueue = [];
        
        this.cleanupMediaSource();
        
        this.updateStreamingStatus('流式播放已停止');
        this.log('流式播放已停止');
    }

    cleanupMediaSource(): void {
        try {
            if (this.sourceBuffer) {
                try {
                    this.sourceBuffer.removeEventListener('updateend', this.processStreamQueue);
                    
                    if (this.sourceBuffer.updating) {
                        this.log('等待 SourceBuffer 更新完成...', 'debug');
                        setTimeout(() => this.cleanupMediaSource(), 100);
                        return;
                    }
                    
                    if (this.mediaSource && this.mediaSource.sourceBuffers.length > 0) {
                        this.mediaSource.removeSourceBuffer(this.sourceBuffer);
                        this.log('已从 MediaSource 移除 SourceBuffer', 'debug');
                    }
                } catch (sbError) {
                    this.log(`移除 SourceBuffer 失败: ${(sbError as Error).message}`, 'warning');
                } finally {
                    this.sourceBuffer = null;
                }
            }
            
            if (this.mediaSource) {
                try {
                    if (this.mediaSource.readyState === 'open') {
                        this.mediaSource.endOfStream();
                        this.log('MediaSource 流已结束', 'debug');
                    }
                } catch (msError) {
                    this.log(`结束 MediaSource 流失败: ${(msError as Error).message}`, 'warning');
                } finally {
                    this.mediaSource = null;
                }
            }
            
            const video = document.querySelector('#convertedVideoContainer video') as HTMLVideoElement;
            if (video && video.src.startsWith('blob:')) {
                URL.revokeObjectURL(video.src);
                this.log('已清理视频元素的 MediaSource URL', 'debug');
            }
            
        } catch (cleanupError) {
            this.log(`清理 MediaSource 资源时出错: ${(cleanupError as Error).message}`, 'error');
            console.error('清理资源失败:', cleanupError);
        }
    }

    diagnoseSourceBufferError(errorEvent: any): void {
        try {
            this.log('=== SourceBuffer 错误诊断 ===', 'debug');
            
            if (this.mediaSource) {
                this.log(`MediaSource 状态: ${this.mediaSource.readyState}`, 'debug');
            } else {
                this.log('MediaSource 对象不存在', 'error');
            }
            
            if (this.sourceBuffer) {
                this.log(`SourceBuffer 更新状态: ${this.sourceBuffer.updating}`, 'debug');
                this.log(`SourceBuffer 模式: ${this.sourceBuffer.mode}`, 'debug');
                
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
                    this.log(`访问缓冲区失败: ${(bufferError as Error).message}`, 'warning');
                }
                
                this.log(`时间戳偏移: ${this.sourceBuffer.timestampOffset}`, 'debug');
                this.log(`追加窗口: ${this.sourceBuffer.appendWindowStart} - ${this.sourceBuffer.appendWindowEnd}`, 'debug');
            } else {
                this.log('SourceBuffer 对象不存在', 'error');
            }
            
            this.log(`流队列长度: ${this.streamQueue.length}`, 'debug');
            this.log(`是否正在流式播放: ${this.isStreaming}`, 'debug');
            
            const video = document.querySelector('#convertedVideoContainer video') as HTMLVideoElement;
            if (video) {
                this.log(`视频当前时间: ${video.currentTime}`, 'debug');
                this.log(`视频就绪状态: ${video.readyState}`, 'debug');
                this.log(`视频网络状态: ${video.networkState}`, 'debug');
                if (video.error) {
                    this.log(`视频错误: ${video.error.message}`, 'error');
                }
            }
            
            this.log('=== 诊断结束 ===', 'debug');
            
            this.handleSourceBufferErrorRecovery();
            
        } catch (diagnosisError) {
            this.log(`诊断过程中出错: ${(diagnosisError as Error).message}`, 'error');
        }
    }

    handleSourceBufferErrorRecovery(): void {
        this.log('尝试 SourceBuffer 错误恢复...', 'warning');
        
        if (this.sourceBuffer && this.mediaSource && this.mediaSource.readyState === 'open') {
            try {
                this.streamQueue = [];
                
                if (this.sourceBuffer.updating) {
                    this.log('SourceBuffer 正在更新，等待完成...', 'warning');
                    setTimeout(() => this.handleSourceBufferErrorRecovery(), 1000);
                    return;
                }
                
                this.safeEndStream();
                
                this.log('SourceBuffer 错误恢复处理完成', 'info');
                return;
                
            } catch (recoveryError) {
                this.log(`恢复策略1失败: ${(recoveryError as Error).message}`, 'error');
            }
        }
        
        this.log('执行完全重置策略...', 'warning');
        this.stopStreaming();
        
        setTimeout(() => {
            if (this.isStreaming) {
                this.log('尝试重新初始化 MediaSource...', 'info');
                this.initMediaSource().catch(error => {
                    this.log(`重新初始化失败: ${(error as Error).message}`, 'error');
                });
            }
        }, 2000);
    }

    safeEndStream(): void {
        if (this.mediaSource && this.mediaSource.readyState === 'open') {
            try {
                if (this.sourceBuffer && !this.sourceBuffer.updating) {
                    if (this.mediaSource.sourceBuffers.length > 0) {
                        this.mediaSource.removeSourceBuffer(this.sourceBuffer);
                        this.log('已移除 SourceBuffer', 'debug');
                    }
                    
                    this.mediaSource.endOfStream();
                    this.log('MediaSource 流已安全结束', 'debug');
                } else {
                    this.log('SourceBuffer 正在更新或不可用，跳过结束流', 'warning');
                }
            } catch (error) {
                this.log(`结束MediaSource流失败: ${(error as Error).message}`, 'warning');
                console.error('结束流失败详情:', error);
            }
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
    
    if (event.error && event.error.name === 'InvalidStateError') {
        console.warn('检测到 SourceBuffer 状态错误，可能是正常的状态清理过程');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('未处理的 Promise 拒绝:', event.reason);
});