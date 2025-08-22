// 类型声明文件，解决第三方库类型问题

declare module '@ffmpeg/ffmpeg' {
  interface FFMessageLoadConfig {
    corePath?: string;
    log?: boolean;
    progress?: (progress: any) => void;
  }

  class FFmpeg {
    on(event: string, callback: (data: any) => void): this;
    load(config?: FFMessageLoadConfig): Promise<void>;
    exec(command: string[]): Promise<void>;
    writeFile(filename: string, data: any): Promise<void>;
    readFile(filename: string): Promise<any>;
    deleteFile(filename: string): Promise<void>;
  }

  export function createFFmpeg(config?: any): any;
  export { FFmpeg };
}

declare module '@ffmpeg/util' {
  export function fetchFile(file: File | Blob): Promise<Uint8Array>;
}

// 扩展 Performance 接口
interface Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

// 扩展 Uint8Array 类型
interface Uint8Array {
  buffer: ArrayBuffer;
}

// 扩展 FileData 类型
type FileData = Uint8Array | string;

// 扩展 ConvertOptions 接口
interface ConvertOptions {
  input?: string;
  output?: string;
  inputFile: File | Blob;
  outputFileName: string;
  videoCodec?: string;
  crf?: string;
  preset?: string;
  threads?: string;
  performanceMode?: string;
  hardwareAcceleration?: string;
  outputFormat?: string;
  streamingMode?: string;
  segmentSize?: number;
  targetBitrate?: string;
  maxBitrate?: string;
  bufferSize?: string;
  fps?: string;
  resolution?: string;
  audioCodec?: string;
  audioBitrate?: string;
  keyframeInterval?: string;
  gopSize?: string;
}