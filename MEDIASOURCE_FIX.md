# MediaSource API 错误修复说明

## 问题描述
用户在使用实时转码功能时遇到以下错误：
```
分片失败: Failed to execute 'appendBuffer' on 'SourceBuffer': The HTMLMediaElement.error attribute is not null.
```

## 错误原因
这个错误通常发生在以下情况：
1. MediaSource 或 SourceBuffer 状态异常
2. 视频元素出现错误
3. 分片数据格式不兼容
4. 缓冲区管理不当

## 修复方案

### 1. 增强错误处理
- 添加 MediaSource 和 SourceBuffer 的错误监听器
- 改进视频元素的错误处理
- 增加详细的错误日志记录

### 2. 状态检查
- 在添加分片前检查 MediaSource 状态
- 验证视频元素是否正常
- 确保流式播放仍在进行中

### 3. 重试机制
- 实现分片转码的重试逻辑
- 限制连续错误次数
- 智能错误恢复

### 4. 资源清理
- 改进停止流式播放的清理逻辑
- 正确处理 MediaSource 结束
- 清空队列避免内存泄漏

## 主要改进

### 错误处理增强
```javascript
// 添加 MediaSource 错误监听
this.mediaSource.addEventListener('error', (e) => {
    this.log(`MediaSource错误: ${e.message}`, 'error');
});

// 添加 SourceBuffer 错误监听
this.sourceBuffer.addEventListener('error', (e) => {
    this.log(`SourceBuffer错误: ${e.message}`, 'error');
});

// 添加视频元素错误监听
video.addEventListener('error', (e) => {
    this.log(`视频元素错误: ${video.error.message}`, 'error');
    this.stopStreaming();
});
```

### 状态检查
```javascript
// 检查 MediaSource 状态
if (this.mediaSource.readyState !== 'open') {
    this.log('MediaSource未就绪，等待中...', 'warning');
    return;
}

// 检查视频元素状态
if (video && video.error) {
    this.log(`视频元素错误: ${video.error.message}`, 'error');
    this.stopStreaming();
    return;
}
```

### 重试机制
```javascript
// 实现重试逻辑
let consecutiveErrors = 0;
const maxConsecutiveErrors = 3;

while (currentChunk * chunkDuration < totalDuration && this.isStreaming) {
    if (consecutiveErrors >= maxConsecutiveErrors) {
        this.log('连续错误过多，停止流式播放', 'error');
        break;
    }
    
    try {
        // 转码分片
        consecutiveErrors = 0; // 重置错误计数
    } catch (error) {
        consecutiveErrors++;
        // 短暂等待后重试
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}
```

## 测试建议

### 1. 基本功能测试
- 上传小视频文件（<10MB）
- 选择实时转码模式
- 观察是否能正常播放

### 2. 错误恢复测试
- 在转码过程中暂停/恢复
- 测试网络不稳定情况
- 验证错误重试机制

### 3. 性能测试
- 测试不同大小的视频文件
- 观察内存使用情况
- 验证转码速度

### 4. 兼容性测试
- 在不同浏览器中测试
- 验证移动设备支持
- 测试不同视频格式

## 使用说明

1. **启动应用**：
   ```bash
   npm run dev
   ```

2. **访问测试页面**：
   - 主应用：http://localhost:4002/
   - 测试说明：http://localhost:4002/test.html

3. **测试实时转码**：
   - 上传视频文件
   - 选择"实时转码"模式
   - 点击"开始转码"
   - 观察边转码边播放效果

## 注意事项

- 确保使用现代浏览器（支持 WebAssembly 和 MediaSource API）
- 建议使用较小的视频文件进行测试
- 如果仍然遇到问题，请查看浏览器控制台的详细错误信息
- 大文件转码可能会导致内存不足，建议分批处理

## 后续优化

1. **更智能的分片大小调整**
2. **改进缓冲区管理**
3. **添加更多视频格式支持**
4. **优化转码性能**

修复后的代码应该能够更稳定地处理实时转码功能，并在出现错误时进行适当的恢复。