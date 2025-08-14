# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 FFmpeg WASM 的视频转码演示项目，支持在浏览器中进行视频格式转换和播放，并提供性能监控和调试功能。

## 开发环境

- **平台**: Windows (MSYS_NT-10.0-26100)
- **工作目录**: `C:\workspaces\ffmpeg-wasm`
- **Node.js**: v21.6.2
- **包管理器**: npm 10.2.4

## 核心依赖

- **@ffmpeg/ffmpeg**: FFmpeg WASM 的 JavaScript 接口
- **@ffmpeg/core**: FFmpeg WASM 核心库
- **vite**: 现代前端构建工具

## 常用命令

### 开发环境
```bash
npm run dev      # 启动开发服务器 (http://localhost:3000)
npm run build    # 构建生产版本
npm run preview  # 预览生产版本
```

### 项目管理
```bash
npm install      # 安装依赖
npm audit        # 安全检查
```

## 项目架构

### 核心类结构
- **FFmpegDemo**: 主要业务逻辑类 (`src/main.js`)
  - `init()`: 初始化 FFmpeg WASM 和事件监听
  - `handleFileSelect()`: 处理文件上传
  - `convertVideo()`: 执行视频转码
  - `updatePerformanceMetrics()`: 更新性能指标
  - `log()`: 日志记录和调试

### 用户界面
- **上传区域**: 支持拖拽和点击上传
- **参数控制**: 输出格式、编码器、质量、速度设置
- **进度显示**: 实时转码进度条
- **视频预览**: 原始和转码后视频对比
- **性能监控**: 转码时间、文件大小变化、处理速度等指标

### FFmpeg 集成
- 使用 `createFFmpeg()` 创建 FFmpeg 实例
- 通过 `fetchFile()` 处理文件输入输出
- 支持多种视频编码器 (H.264, H.265, VP8, VP9)
- 实时进度回调支持

## 性能监控

项目内置了完整的性能监控系统：

### 监控指标
- **转码时间**: 总耗时统计
- **文件大小变化**: 转码前后对比
- **处理速度**: MB/s 处理速度
- **内存使用**: JavaScript 堆内存使用情况

### 调试功能
- **实时日志**: 详细操作日志输出
- **错误处理**: 完整的错误捕获和显示
- **进度追踪**: 实时转码进度显示

## 开发指南

### 添加新功能
1. 在 `FFmpegDemo` 类中添加新方法
2. 在 `setupEventListeners()` 中添加事件处理
3. 更新 UI 界面 (`index.html`)
4. 添加相应的性能监控指标

### 性能优化
- 使用 Web Workers 处理大文件
- 优化 FFmpeg 参数配置
- 添加内存使用限制
- 实现文件分片处理

### 测试建议
- 使用不同格式的测试视频
- 测试大文件转码性能
- 验证不同编码器的效果
- 检查内存使用情况

## 注意事项

- **内存管理**: 大文件转码可能导致内存不足
- **浏览器兼容性**: 需要 WebAssembly 支持
- **CDN 依赖**: FFmpeg core 从 CDN 加载
- **用户体验**: 转码过程可能较慢，需要良好的进度提示

## 故障排除

### 常见问题
1. **FFmpeg 加载失败**: 检查网络连接和 CDN 配置
2. **转码性能差**: 调整编码参数或使用更快的预设
3. **内存溢出**: 使用较小的测试文件
4. **浏览器兼容性**: 确保使用现代浏览器

### 调试方法
- 查看浏览器控制台日志
- 检查网络请求状态
- 使用浏览器开发者工具分析性能
- 查看 FFmpeg 输出日志