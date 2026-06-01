const fs = require('fs');
const path = require('path');
const os = require('os');

// 分隔符
const split = '================================================================================';
// 最终的批量文件
const batchFile = "3_ffmpeg.bat";
// 存放元数据的文件
const metaFile = "meta.txt";
// 视频所在行
const VIDEO_LINE = "Video: ";

/**
 * 输入指定目录，遍历其中的视频文件并以html表格形式输出文件名，文件大小，比特率，长度，格式
 */
if (process.argv.length < 3) {
  console.error('参数错误');
  process.exit(1);
}

const workDir = process.argv[2];
console.log(`当前目录:${workDir}`);

const text = fs.readFileSync(`${workDir}\\${metaFile}`, 'utf-8');
const fileContent = text.split(os.EOL);
const batchPath = path.join(workDir, batchFile);

// 常见码率缓存
const bitrateData = [
  { pixels: 102240, magnification: 0.2, diff: 128160 }, // 240P 426x240 200
  { pixels: 230400, magnification: 0.4, diff: 179520 }, // 360P 640x360 400
  { pixels: 409920, magnification: 0.5, diff: 511680 }, // 480P 854x480 500
  { pixels: 921600, magnification: 0.8, diff: 1152000 }, // 720P 1280x720 800
  { pixels: 2073600, magnification: 1, diff: 1612800 }, // 1080P (基准) 1920x1080 1000
  { pixels: 3686400, magnification: 1.78, diff: 4608000 }, // 2K 2560x1440 1780
  { pixels: 8294400, magnification: 4, diff: 24883200 }, // 4K 3840x2160 4000
  { pixels: 33177600, magnification: 8, diff: null } // 8K 7680x4320 8000
];

// 基准分辨率，没有输入分辨率时由ffmpeg自己选择分辨率
if (process.argv.length == 4) {
  const baseBitrate = Number.parseInt(process.argv[3]);
  console.log(`将使用基准分辨率:${baseBitrate}`);
  bitrateData.forEach(res => {
    res.bitrate = res.magnification * baseBitrate;
  });
}

/**
 * 获取分辨率对应的码率。
 *
 * @param {number} pixelCount 像素数量
 * @returns {number} 分辨率
 */
function getBitRate(pixelCount) {
  // 快速计算码率
  if (pixelCount < resolutionData[0]) {
    return resolutionData[0].bitrate;
  }
  for (const res of resolutionData) {
    if (pixelCount === res.pixels) {
      return res.bitrate;
    }
  }
  if (pixelCount > resolutionData[7]) {
    return resolutionData[7].bitrate;
  }

  // 当快速计算失败时，根据目标像素数量的位置就近选择码率
  for (let i = 0; i < bitrateData.length; i++) {
    const data = bitrateData[i];
    const temp = pixelCount + Math.random() * 100000;
    // 快速计算已经过了
    if (temp > data.pixels && i != 7) {
      continue;
    }
    const n = (pixelCount - data.pixels) / data.diff;
    if (n < 0.5) {
      return bitrateData[i - 1].bitrate;
    } else {
      return bitrateData[i].bitrate;
    }
  }
}

// 临时数据，保存文件
const fileList = [];

let obj;
for (const line of fileContent) {
  // 文件名
  if (line.indexOf('Input #0,') > -1) {
    obj = new Object();
    const filename = line.substring(line.indexOf('\'') + 1, line.length - 2);
    const extname = path.extname(filename);
    const basename = filename.substring(0, filename.length - extname.length);
    obj = {
      ...obj,
      filename,
      basename,
      extname
    };
  }

  // 分辨率
  if (line.indexOf(VIDEO_LINE) > -1) {
    // 分辨率
    const scaleMatch = / (\d+)x(\d+)([, ])/.exec(line);
    // 像素数量
    const pixelCount = Number.parseInt(scaleMatch[1]) * Number.parseInt(scaleMatch[2]);
    obj.pixelCount = pixelCount;

    // 码率
    const bitrateMatch = /\d+ kb\/s/.exec(line);
    obj.bitrate = bitrateMatch[0];
    console.log(`处理完成:${JSON.stringify(obj)}`);
    fileList.push(obj);
  }
}

// 计算新码率，以1080p为1500为基准，按比例计算码率
fileList.forEach(e => {
  if (process.argv.length === 4) {
    e.command = `ffmpeg -hide_banner -y -i "${e.basename}_${e.extname}" -c:a aac -c:v av1_nvenc -b:v ${getBitRate(e.pixelCount)}k "${e.basename}.mp4"${os.EOL}`;
  } else {
    e.command = `ffmpeg -hide_banner -y -i "${e.basename}_${e.extname}" -c:a aac -c:v av1_nvenc "${e.basename}.mp4"${os.EOL}`;
  }
});

// 转码过程不需要写入日志，看着就行
// 清空转码文件
fs.writeFileSync(batchPath, '');
fileList.forEach(f => {
  fs.appendFileSync(batchPath, f.command);
});
