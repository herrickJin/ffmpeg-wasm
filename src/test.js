import { FFmpeg, fetchFile } from '@ffmpeg/ffmpeg';

// 简单的测试脚本
const ffmpeg = new FFmpeg({
    log: true,
    corePath: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js'
});

console.log('FFmpeg 实例创建成功');

// 测试文件系统操作
async function testFFmpeg() {
    try {
        console.log('开始加载 FFmpeg...');
        await ffmpeg.load();
        console.log('FFmpeg 加载成功');
        
        // 创建一个测试文件
        const testData = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
        ffmpeg.FS('writeFile', 'test.txt', testData);
        console.log('文件写入成功');
        
        // 读取文件
        const readData = ffmpeg.FS('readFile', 'test.txt');
        console.log('文件读取成功:', readData);
        
        // 清理
        ffmpeg.FS('unlink', 'test.txt');
        console.log('文件清理成功');
        
    } catch (error) {
        console.error('FFmpeg 测试失败:', error);
    }
}

// 页面加载后测试
window.addEventListener('load', () => {
    console.log('页面加载完成，开始测试 FFmpeg...');
    testFFmpeg();
});