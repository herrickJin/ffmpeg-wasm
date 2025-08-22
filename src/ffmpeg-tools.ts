/**
 * FFmpeg 工具类 - 提供静态工具方法
 */
export class FFmpegTools {
    /**
     * 获取硬件加速参数
     */
    static getHardwareAccelerationParams(hwType: string, videoCodec: string): string[] {
        const params: string[] = [];
        
        switch (hwType) {
            case 'cuda':
                if (videoCodec === 'libx264') {
                    params.push('-c:v', 'h264_nvenc');
                } else if (videoCodec === 'libx265') {
                    params.push('-c:v', 'hevc_nvenc');
                }
                break;
            case 'qsv':
                if (videoCodec === 'libx264') {
                    params.push('-c:v', 'h264_qsv');
                } else if (videoCodec === 'libx265') {
                    params.push('-c:v', 'hevc_qsv');
                }
                break;
            case 'videotoolbox':
                if (videoCodec === 'libx264') {
                    params.push('-c:v', 'h264_videotoolbox');
                } else if (videoCodec === 'libx265') {
                    params.push('-c:v', 'hevc_videotoolbox');
                }
                break;
            default:
                // 使用软件编码器
                params.push('-c:v', videoCodec);
        }
        
        return params;
    }

    /**
     * 获取性能模式参数
     */
    static getPerformanceParams(mode: string, videoCodec: string, crf: string, preset: string): string[] {
        const params: string[] = [];
        
        switch (mode) {
            case 'speed':
                params.push('-preset', 'ultrafast', '-crf', '28');
                break;
            case 'quality':
                params.push('-preset', 'slow', '-crf', '18');
                break;
            case 'lowcpu':
                params.push('-preset', 'medium', '-crf', '23', '-threads', '2');
                break;
            case 'balanced':
            default:
                params.push('-preset', preset, '-crf', crf);
                break;
        }
        
        return params;
    }

    /**
     * 构建优化的 FFmpeg 命令
     */
    static buildOptimizedCommand(options: any & { input: string; output: string }): string[] {
        const {
            input,
            output,
            videoCodec = 'libx264',
            crf = '23',
            preset = 'medium',
            threads = '0',
            performanceMode = 'balanced',
            hardwareAcceleration = 'none',
            outputFormat = 'mp4'
        } = options;

        const command = ['-i', input];

        // 硬件加速设置
        if (hardwareAcceleration !== 'none') {
            const hwAccel = this.getHardwareAccelerationParams(hardwareAcceleration, videoCodec);
            command.push(...hwAccel);
        } else {
            command.push('-c:v', videoCodec);
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

    /**
     * 格式化文件大小
     */
    static formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 格式化时间
     */
    static formatTime(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    /**
     * 计算文件大小变化百分比
     */
    static calculateSizeChange(originalSize: number, convertedSize: number): string {
        const change = ((convertedSize - originalSize) / originalSize * 100).toFixed(1);
        return `${parseFloat(change) > 0 ? '+' : ''}${change}%`;
    }

    /**
     * 计算处理速度
     */
    static calculateProcessingSpeed(bytes: number, timeMs: number): string {
        const speed = (bytes / 1024 / 1024 / (timeMs / 1000)).toFixed(2);
        return `${speed} MB/s`;
    }

    /**
     * 验证 FFmpeg 命令参数
     */
    static validateCommand(command: string[]): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];
        
        if (!command.includes('-i')) {
            errors.push('缺少输入文件参数 (-i)');
        }
        
        if (command.length < 3) {
            errors.push('命令太短，可能不完整');
        }
        
        const outputIndex = command.indexOf('-y');
        if (outputIndex === -1 || outputIndex === command.length - 1) {
            errors.push('缺少输出文件或输出参数不正确');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * 获取推荐的编码器设置
     */
    static getRecommendedSettings(outputFormat: string, targetUse: string): {
        videoCodec: string;
        audioCodec: string;
        crf: string;
        preset: string;
    } {
        const settings = {
            videoCodec: 'libx264',
            audioCodec: 'aac',
            crf: '23',
            preset: 'medium'
        };

        switch (outputFormat) {
            case 'webm':
                settings.videoCodec = 'libvpx-vp9';
                settings.audioCodec = 'libopus';
                break;
            case 'mp4':
                if (targetUse === 'streaming') {
                    settings.preset = 'fast';
                    settings.crf = '23';
                } else if (targetUse === 'quality') {
                    settings.preset = 'slow';
                    settings.crf = '18';
                }
                break;
            case 'avi':
                settings.preset = 'fast';
                settings.crf = '20';
                break;
        }

        return settings;
    }

    /**
     * 生成输出文件名
     */
    static generateOutputFileName(inputFileName: string, outputFormat: string): string {
        const nameWithoutExt = inputFileName.replace(/\.[^/.]+$/, '');
        return `${nameWithoutExt}_converted.${outputFormat}`;
    }

    /**
     * 检查文件格式是否支持
     */
    static isFormatSupported(format: string): boolean {
        const supportedFormats = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'mpegts'];
        return supportedFormats.includes(format.toLowerCase());
    }

    /**
     * 获取格式信息
     */
    static getFormatInfo(format: string): {
        name: string;
        description: string;
        container: string;
        recommendedUse: string[];
    } {
        const formatInfo: Record<string, any> = {
            mp4: {
                name: 'MP4',
                description: '通用视频格式，兼容性好',
                container: 'MPEG-4',
                recommendedUse: ['网络分享', '移动设备', '流媒体']
            },
            webm: {
                name: 'WebM',
                description: 'Web 优化的视频格式',
                container: 'WebM',
                recommendedUse: ['网页嵌入', '网络流媒体']
            },
            avi: {
                name: 'AVI',
                description: '传统的视频格式',
                container: 'AVI',
                recommendedUse: ['本地存储', '兼容性要求']
            },
            mov: {
                name: 'MOV',
                description: 'Apple QuickTime 格式',
                container: 'QuickTime',
                recommendedUse: ['苹果设备', '视频编辑']
            },
            mkv: {
                name: 'MKV',
                description: '开放的多媒体容器',
                container: 'Matroska',
                recommendedUse: ['高质量视频', '多音轨']
            }
        };

        return formatInfo[format.toLowerCase()] || {
            name: format.toUpperCase(),
            description: '未知格式',
            container: format,
            recommendedUse: ['通用用途']
        };
    }
}