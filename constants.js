/**
 * 元数据键名常量
 */
const META_KEY = {
  filename: 'filename',
  basename: 'basename',
  extname: 'extname',
  duration: 'duration',
  bitrate: 'bitrate',
  pixelCount: 'pixelCount',
  scale: 'scale',
  command: 'command',
  // 忽略标记：表示跳过转码（如新码率>=旧码率），与error是完全不同的类型
  ignore: 'ignore',
  ignoreReason: 'ignoreReason',
  bitrateRatio: 'bitrateRatio',
  bitrateRatioThreshold: 'bitrateRatioThreshold',
  targetBitrate: 'targetBitrate',
  // 错误信息：记录具体的解析失败原因（如"读取时长失败"、"读取分辨率失败"、"元数据缺失"等）
  // 与ignore不同：error表示解析阶段出错，ignore表示业务规则跳过
  error: 'error',
  // 转码失败标记
  fail: 'fail',
  // 新码率
  newBitrate: 'newBitrate',
  // 新文件大小
  newSize: 'newSize',
  // 压缩比
  compressRatio: 'compressRatio'
};

module.exports = { META_KEY };
