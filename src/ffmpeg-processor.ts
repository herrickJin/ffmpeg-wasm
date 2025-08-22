import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { FFmpegTools } from './ffmpeg-tools';

/**
 * FFmpeg 处理器类 - 封装所有 FFmpeg WASM 相关操作
 */
export interface FFmpegProcessorOptions {
    debugMode?: boolean;
    corePath?: string;
}

export interface ProgressData {
    ratio?: number;
    progress?: number;
    time?: number;
    duration?: number;
}

export interface PerformanceMetrics {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    totalProcessingTime: number;
    totalBytesProcessed: number;
}

export interface PerformanceStats {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    successRate: string;
    avgProcessingTime: string;
    totalBytesProcessed: number;
    totalProcessingTime: string;
}

export interface ConvertOptions {
    inputFile: File | Blob;
    outputFileName: string;
    videoCodec?: string;
    crf?: string;
    preset?: string;
    threads?: string;
    performanceMode?: string;
    hardwareAcceleration?: string;
    outputFormat?: string;
}

export interface SegmentedConvertOptions extends ConvertOptions {
    segmentDuration?: number;
    segmentCount?: number;
}

export interface ChunkConvertOptions {
    input: string;
    output: string;
    startTime: number;
    duration: number;
    videoCodec?: string;
    crf?: string;
    preset?: string;
    outputFormat?: string;
}

export type ProgressCallback = (progress: ProgressData) => void;
export type LogCallback = (message: string, type?: string) => void;
export type ErrorCallback = (error: Error) => void;

class FFmpegProcessor {
    private ffmpeg: FFmpeg | null = null;
    private isInitialized: boolean = false;
    private readonly debugMode: boolean;
    private readonly corePath: string;
    
    // 事件回调
    private onProgressCallback: ProgressCallback | null = null;
    private onLogCallback: LogCallback | null = null;
    private onErrorCallback: ErrorCallback | null = null;
    
    // 性能监控
    private performanceMetrics: PerformanceMetrics = {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        totalProcessingTime: 0,
        totalBytesProcessed: 0
    };

    constructor(options: FFmpegProcessorOptions = {}) {
        this.debugMode = options.debugMode || false;
        this.corePath = options.corePath || 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js';
    }

    /**
     * 初始化 FFmpeg WASM
     */
    async initialize(): Promise<void> {
        if (this.isInitialized && this.ffmpeg) {
            this.log('FFmpeg 已经初始化');
            return;
        }

        this.log('正在初始化 FFmpeg WASM...');
        
        try {
            this.ffmpeg = new FFmpeg();
            
            // 设置事件监听器
            this.ffmpeg.on('log', (data) => {
                this.log(`FFmpeg: ${data.message}`);
            });
            
            this.ffmpeg.on('progress', (progress) => {
                this.handleProgress(progress);
            });
            
            // 加载 FFmpeg 核心
            await this.ffmpeg.load({
                corePath: this.corePath
            });
            
            this.isInitialized = true;
            this.log('FFmpeg WASM 初始化完成');
            
        } catch (error) {
            this.log(`FFmpeg WASM 初始化失败: ${(error as Error).message}`, 'error');
            throw error;
        }
    }

    /**
     * 执行 FFmpeg 命令
     */
    async executeCommand(command: string[]): Promise<boolean> {
        if (!this.isInitialized) {
            throw new Error('FFmpeg 未初始化，请先调用 initialize()');
        }

        this.log(`执行命令: ffmpeg ${command.join(' ')}`);
        
        const startTime = performance.now();
        this.performanceMetrics.totalOperations++;
        
        try {
            await this.ffmpeg!.exec(command);
            
            const executionTime = performance.now() - startTime;
            this.performanceMetrics.successfulOperations++;
            this.performanceMetrics.totalProcessingTime += executionTime;
            
            this.log(`命令执行完成 (${executionTime.toFixed(2)}ms)`);
            return true;
            
        } catch (error) {
            const executionTime = performance.now() - startTime;
            this.performanceMetrics.failedOperations++;
            this.performanceMetrics.totalProcessingTime += executionTime;
            
            this.log(`命令执行失败: ${(error as Error).message}`, 'error');
            throw error;
        }
    }

    /**
     * 写入文件到 FFmpeg 文件系统
     */
    async writeFile(filename: string, data: File | Blob | Uint8Array): Promise<void> {
        if (!this.isInitialized) {
            throw new Error('FFmpeg 未初始化');
        }

        this.log(`正在写入文件: ${filename}`);
        
        try {
            let fileData = data;
            if (data instanceof File || data instanceof Blob) {
                fileData = await fetchFile(data);
            }
            
            await this.ffmpeg!.writeFile(filename, fileData);
            this.log(`文件写入完成: ${filename}`);
            
            // 更新性能指标
            const byteSize = (fileData as Uint8Array).byteLength || (data as File).size || 0;
            this.performanceMetrics.totalBytesProcessed += byteSize;
            
        } catch (error) {
            this.log(`文件写入失败: ${(error as Error).message}`, 'error');
            throw error;
        }
    }

    /**
     * 从 FFmpeg 文件系统读取文件
     */
    async readFile(filename: string): Promise<Uint8Array> {
        if (!this.isInitialized) {
            throw new Error('FFmpeg 未初始化');
        }

        this.log(`正在读取文件: ${filename}`);
        
        try {
            const data = await this.ffmpeg!.readFile(filename);
            this.log(`文件读取完成: ${filename} (${data.length} 字节)`);
            return data;
            
        } catch (error) {
            this.log(`文件读取失败: ${(error as Error).message}`, 'error');
            throw error;
        }
    }

    /**
     * 删除 FFmpeg 文件系统中的文件
     */
    async deleteFile(filename: string): Promise<void> {
        if (!this.isInitialized) {
            throw new Error('FFmpeg 未初始化');
        }

        this.log(`正在删除文件: ${filename}`);
        
        try {
            await this.ffmpeg!.deleteFile(filename);
            this.log(`文件删除完成: ${filename}`);
            
        } catch (error) {
            this.log(`文件删除失败: ${(error as Error).message}`, 'warning');
            // 不抛出错误，因为删除失败通常不是致命问题
        }
    }

    /**
     * 检查文件系统健康状态
     */
    async checkFilesystemHealth(): Promise<boolean> {
        try {
            const testFilename = 'test_fs_health.tmp';
            const testData = new Uint8Array([1, 2, 3, 4, 5]);
            
            await this.writeFile(testFilename, testData);
            await this.deleteFile(testFilename);
            
            this.log('FFmpeg 文件系统健康检查通过');
            return true;
            
        } catch (error) {
            this.log(`FFmpeg 文件系统健康检查失败: ${(error as Error).message}`, 'error');
            return false;
        }
    }

    /**
     * 构建优化的 FFmpeg 命令
     */
    buildOptimizedCommand(options: ConvertOptions & { input: string; output: string }): string[] {
        return FFmpegTools.buildOptimizedCommand(options);
    }

    
    /**
     * 普通转码模式
     */
    async convertFile(options: ConvertOptions): Promise<Uint8Array> {
        const {
            inputFile,
            outputFileName,
        } = options;

        this.log('开始普通转码...');

        // 写入输入文件
        await this.writeFile('input.mp4', inputFile);

        // 构建命令
        const command = this.buildOptimizedCommand({
            ...options,
            input: 'input.mp4',
            output: outputFileName
        });

        // 执行转码
        await this.executeCommand(command);

        // 读取输出文件
        const outputData = await this.readFile(outputFileName);

        // 清理临时文件
        await this.cleanupFiles(['input.mp4', outputFileName]);

        this.log('普通转码完成');
        return outputData;
    }

    /**
     * 分段转码模式
     */
    async convertSegmented(options: SegmentedConvertOptions): Promise<Uint8Array[]> {
        const {
            inputFile,
            outputFileName,
            segmentDuration = 10,
            segmentCount = 5,
            ...commandOptions
        } = options;

        this.log('开始分段转码...');

        // 写入输入文件
        await this.writeFile('input.mp4', inputFile);

        const segments: Uint8Array[] = [];

        // 处理每个分段
        for (let i = 0; i < segmentCount; i++) {
            const startTime = i * segmentDuration;
            const segmentName = `segment_${i}.${commandOptions.outputFormat || 'mp4'}`;

            const command = [
                '-ss', startTime.toString(),
                '-i', 'input.mp4',
                '-t', segmentDuration.toString(),
                '-c:v', commandOptions.videoCodec || 'libx264',
                '-crf', commandOptions.crf || '23',
                '-preset', commandOptions.preset || 'medium',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-y', segmentName
            ];

            try {
                this.log(`转码第 ${i + 1} 段...`);
                await this.executeCommand(command);

                const segmentData = await this.readFile(segmentName);
                segments.push(segmentData);

                await this.deleteFile(segmentName);
                this.log(`第 ${i + 1} 段转码完成`);

            } catch (error) {
                this.log(`第 ${i + 1} 段转码失败: ${(error as Error).message}`, 'warning');
                // 继续处理下一段
            }
        }

        // 清理输入文件
        await this.deleteFile('input.mp4');

        this.log('分段转码完成');
        return segments;
    }

    /**
     * 分片转码（用于实时流式播放）
     */
    async convertChunk(options: ChunkConvertOptions): Promise<void> {
        const {
            input,
            output,
            startTime,
            duration,
            videoCodec = 'libx264',
            crf = '23',
            preset = 'ultrafast',
            outputFormat = 'mpegts'
        } = options;

        this.log(`转码分片: ${startTime}s - ${startTime + duration}s`);

        // 为流式播放优化的命令
        let command: string[];
        
        if (outputFormat === 'mpegts') {
            command = [
                '-ss', startTime.toString(),
                '-i', input,
                '-t', duration.toString(),
                '-c:v', videoCodec,
                '-crf', crf,
                '-preset', preset,
                '-c:a', 'aac',
                '-b:a', '128k',
                '-mpegts_m2ts_mode', '1',
                '-f', 'mpegts',
                '-y', output
            ];
        } else {
            command = [
                '-ss', startTime.toString(),
                '-i', input,
                '-t', duration.toString(),
                '-c:v', videoCodec,
                '-crf', crf,
                '-preset', preset,
                '-c:a', 'aac',
                '-b:a', '128k',
                '-profile:v', 'baseline',
                '-level', '3.0',
                '-movflags', '+frag_keyframe+empty_moov+faststart+default_base_moof',
                '-frag_duration', duration.toString(),
                '-f', outputFormat,
                '-y', output
            ];
        }

        await this.executeCommand(command);
        this.log(`分片转码完成: ${output}`);
    }

    /**
     * 获取视频时长
     */
    async getVideoDuration(inputFile: string): Promise<number> {
        const command = [
            '-i', inputFile,
            '-f', 'null',
            '-'
        ];

        try {
            await this.executeCommand(command);
            // 简化处理，返回默认值
            // 在实际应用中应该从FFmpeg输出解析时长
            this.log('使用默认视频时长: 60秒');
            return 60;
        } catch (error) {
            this.log(`获取视频时长失败: ${(error as Error).message}`, 'warning');
            return 60; // 默认值
        }
    }

    /**
     * 清理临时文件
     */
    async cleanupFiles(filenames: string[]): Promise<void> {
        for (const filename of filenames) {
            try {
                await this.deleteFile(filename);
            } catch (error) {
                this.log(`清理文件失败: ${filename} - ${(error as Error).message}`, 'warning');
            }
        }
    }

    /**
     * 获取性能统计信息
     */
    getPerformanceStats(): PerformanceStats {
        const successRate = this.performanceMetrics.totalOperations > 0 
            ? (this.performanceMetrics.successfulOperations / this.performanceMetrics.totalOperations * 100).toFixed(1)
            : '0';
            
        const avgProcessingTime = this.performanceMetrics.successfulOperations > 0
            ? (this.performanceMetrics.totalProcessingTime / this.performanceMetrics.successfulOperations).toFixed(2)
            : '0';

        return {
            totalOperations: this.performanceMetrics.totalOperations,
            successfulOperations: this.performanceMetrics.successfulOperations,
            failedOperations: this.performanceMetrics.failedOperations,
            successRate: `${successRate}%`,
            avgProcessingTime: `${avgProcessingTime}ms`,
            totalBytesProcessed: this.performanceMetrics.totalBytesProcessed,
            totalProcessingTime: `${this.performanceMetrics.totalProcessingTime.toFixed(2)}ms`
        };
    }

    /**
     * 处理进度更新
     */
    private handleProgress(progress: ProgressData): void {
        if (this.onProgressCallback) {
            this.onProgressCallback(progress);
        }
    }

    /**
     * 日志记录
     */
    private log(message: string, type: string = 'info'): void {
        if (this.onLogCallback) {
            this.onLogCallback(message, type);
        }
        
        if (this.debugMode || type === 'error') {
            console.log(`[FFmpegProcessor] ${message}`);
        }
    }

    /**
     * 事件监听器设置
     */
    onProgress(callback: ProgressCallback): this {
        this.onProgressCallback = callback;
        return this;
    }

    onLog(callback: LogCallback): this {
        this.onLogCallback = callback;
        return this;
    }

    onError(callback: ErrorCallback): this {
        this.onErrorCallback = callback;
        return this;
    }

    /**
     * 销毁实例，清理资源
     */
    destroy(): void {
        this.ffmpeg = null;
        this.isInitialized = false;
        this.onProgressCallback = null;
        this.onLogCallback = null;
        this.onErrorCallback = null;
        
        this.log('FFmpegProcessor 已销毁');
    }
}

export default FFmpegProcessor;