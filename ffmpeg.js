const fs = require('fs');
const path = require('path');
const os = require('os');
const { log, error } = require('console');
const bitrateData = require('./bitrate.json');

// 分隔符
const split = '================================================================================';
// 最终的批量文件
const batchFile = "3_ffmpeg.bat";
// 存放元数据的文件
const metaFile = "meta.txt";
// 视频所在行
const VIDEO_LINE = "Video: ";
// 共享数据文件
const dataJson = 'data.json';

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
const dataPath = path.join(workDir, dataJson);
const data = JSON.parse(fs.readFileSync(dataPath).toString());


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
  if (pixelCount < bitrateData[0]) {
    return bitrateData[0].bitrate;
  }
  for (const res of bitrateData) {
    if (pixelCount === res.pixels) {
      return res.bitrate;
    }
  }
  if (pixelCount > bitrateData[7]) {
    return bitrateData[7].bitrate;
  }

  // 当快速计算失败时，根据目标像素数量的位置就近选择码率
  for (let i = 0; i < bitrateData.length; i++) {
    const data = bitrateData[i];
    const temp = pixelCount + Math.random() * 1000;
    // 快速计算已经过了
    if (temp > data.pixels && i != 7) {
      continue;
    }
    const n = Math.abs((pixelCount - data.pixels) / data.diff);
    if (n < 0.5 && i > 0) {
      return bitrateData[i - 1].bitrate;
    } else {
      return bitrateData[i].bitrate;
    }
  }
}

// data.json中的数组下标。data.json中的顺序和meta.txt中的顺序一样，下标可以直接用
let fileIndex = 0;
for (const line of fileContent) {

  // 时长
  const durationIndex = line.indexOf('Duration');
  if (durationIndex > -1) {
    console.log(`开始处理文件:${JSON.stringify(data[fileIndex])}`);
    // 偏移量要要加上duration长度
    data[fileIndex].duration = line.substring(durationIndex + 10, durationIndex + 21);
    // 包含音频的码率
    // 偏移量=下标+1+bitrate.length
    data[fileIndex].bitrate = Number.parseInt(line.substring(line.indexOf('bitrate: ') + 9, line.lastIndexOf(' kb/s')));

  }

  // 分辨率
  if (line.indexOf(VIDEO_LINE) > -1) {
    // 分辨率
    const scaleMatch = / (\d+)x(\d+)([, ])/.exec(line);
    // 像素数量
    const pixelCount = Number.parseInt(scaleMatch[1]) * Number.parseInt(scaleMatch[2]);
    data[fileIndex].pixelCount = pixelCount;

    // 分辨率
    data[fileIndex].scale = `${scaleMatch[1]}x${scaleMatch[2]}`;
    fileIndex++;
  }
}

// 计算新码率，以1080p为1500为基准，按比例计算码率
const ignoredArray = [];
data.forEach(e => {
  const newBitrate = getBitRate(e.pixelCount);
  let videoBitrate = process.argv.length == 4 ? `-b:v ${newBitrate}k` : '';
  e.targetBitrate = newBitrate;
  // 要加上音频分辨率，大部分时候音频都是128
  if ((newBitrate + 128) >= e.bitrate) {
    log(`文件[${e.filename}]的新码率大于等于旧码率，跳过转码`);
    e.ignore = true;
    ignoredArray.push(e);
    return;
  }
  e.command = `ffmpeg -hide_banner -y -i "${e.basename}_${e.extname}" -c:a aac -c:v av1_nvenc ${videoBitrate} "${e.basename}.mp4"${os.EOL}`;
});

// 转码过程不需要写入日志，看着就行。data.txt用来在预览时判断任务有没有运行以及运行时间
fs.writeFileSync(batchPath, 'echo %date% %time%> data.txt\r\n');
log('写入批量脚本');
data.forEach(f => {
  if (f.ignore) {
    return;
  }
  log(f.command);
  fs.appendFileSync(batchPath, f.command);
});
fs.appendFileSync(batchPath, 'echo %date% %time%>> data.txt');
log('批量脚本写入完成,以下文件新码率大于等于旧码率，跳过转码:');
ignoredArray.forEach(ele => {
  log(`[${ele.filename} ${ele.scale}] [${ele.bitrate} ${ele.targetBitrate}`);
});

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
log('数据文件写入完成');
