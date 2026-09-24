const fs = require('fs');
const path = require('path');
const os = require('os');
const { log, error, warn } = require('console');
const { META_KEY } = require('./constants');

const bitratePath = path.join(__dirname, 'bitrate.json');

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
  error('❌ 参数错误');
  process.exit(1);
}

const workDir = process.argv[2];
log(`当前目录:${workDir}`);

const metaPath = path.join(workDir, metaFile);
const missingFiles = [];
if (!fs.existsSync(bitratePath)) {
  missingFiles.push('缺少 bitrate.json，请复制 bitrate.jsonc 并重命名为 bitrate.json，然后删除文件开头的注释行。');
}
if (!fs.existsSync(metaPath)) {
  missingFiles.push(`缺少 ${metaFile}，请先运行 chcp 65001 && 1_meta.bat。`);
}
if (missingFiles.length > 0) {
  missingFiles.forEach(message => error(message));
  process.exit(1);
}
const bitrateData = require(bitratePath);
// 码率参考值里的最后一个码率
const bitrateIndex = bitrateData.length - 1;
const text = fs.readFileSync(metaPath, 'utf-8');
const fileContent = text.split(os.EOL);
const batchPath = path.join(workDir, batchFile);
const dataPath = path.join(workDir, dataJson);
const data = JSON.parse(fs.readFileSync(dataPath).toString());


// 基准分辨率，没有输入分辨率时由ffmpeg自己选择分辨率
if (process.argv.length === 4) {
  const baseBitrate = Number.parseInt(process.argv[3]);
  log(`将使用基准分辨率:${baseBitrate}`);
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
  if (pixelCount <= bitrateData[0].pixels) {
    return bitrateData[0].bitrate;
  }
  for (const res of bitrateData) {
    if (pixelCount === res.pixels) {
      return res.bitrate;
    }
  }
  if (pixelCount >= bitrateData[bitrateIndex].pixels) {
    return bitrateData[bitrateIndex].bitrate;
  }

  // 在相邻分辨率中选择像素数量更接近的一档
  for (let i = 1; i < bitrateData.length; i++) {
    const previous = bitrateData[i - 1];
    const current = bitrateData[i];
    if (pixelCount <= current.pixels) {
      return pixelCount - previous.pixels < current.pixels - pixelCount
        ? previous.bitrate
        : current.bitrate;
    }
  }
}

// 保存元数据
const metaMap = new Map();
// data.json中的数组下标。data.json中的顺序和meta.txt中的顺序一样，下标可以直接用
let currentMeta;
let filename;
// 是否继续处理。解析出错时该值为true，此使跳过所有解析直到下一个分隔符
let processError = false;
// 错误文件下标，从1开始，拼在分隔符后面。
// 这里的顺序是1_meta.bat里的顺序，不是data.json中的顺序，因为1_meta.bat报错时，元数据文件数可能会比data.json少。
let fileIndex = 0;
const errorArray = [];
for (const line of fileContent) {
  if (line.startsWith('===')) {
    currentMeta = new Map();
    processError = false;
    fileIndex++;
  }
  if (processError) {
    continue;
  }
  // 元数据第一行格式是Input #0, 媒体格式, from '文件名':
  const startIndex = line.indexOf('from');
  if (line.startsWith('Input')) {
    try {
      filename = line.substring(startIndex + 6, line.lastIndexOf('\''));
      log(`开始处理文件【${filename}】`);
      metaMap.set(filename, currentMeta);
      currentMeta.set(META_KEY.filename, filename);
    } catch (e) {
      error(`读取文件名失败，错误信息【${e.message}】`);
      processError = true;
      errorArray.push(`文件名解析失败，序号是【${fileIndex}】`);
    }
  }
  // 时长
  const durationIndex = line.indexOf('Duration');
  if (durationIndex > -1) {
    try {
      // 偏移量要要加上duration长度
      currentMeta.set(META_KEY.duration, line.substring(durationIndex + 10, durationIndex + 21));
      // 包含音频的码率
      // 偏移量=下标+1+bitrate.length
      currentMeta.set(META_KEY.bitrate, Number.parseInt(line.substring(line.indexOf('bitrate: ') + 9, line.lastIndexOf(' kb/s'))));
    } catch (e) {
      error(`❌ 文件【${filename}】读取时长失败`, e);
      processError = true;
      currentMeta.set(META_KEY.error, e.message);
      errorArray.push(`文件【${filename}】读取时长失败，序号为【${fileIndex}】`);
    }
  }

  // 分辨率
  if (line.indexOf(VIDEO_LINE) > -1) {
    try {
      // 分辨率
      const scaleMatch = / (\d+)x(\d+)([, ])/.exec(line);
      // 像素数量
      const pixelCount = Number.parseInt(scaleMatch[1]) * Number.parseInt(scaleMatch[2]);
      currentMeta.set(META_KEY.pixelCount, pixelCount);

      // 分辨率
      currentMeta.set(META_KEY.scale, `${scaleMatch[1]}x${scaleMatch[2]}`);
    } catch (error) {
      error(`❌ 文件【${filename}】读取分辨率失败`, e);
      processError = true;
      currentMeta.set(META_KEY.error, error.message);
      errorArray.push(`文件【${filename}】读取分辨率失败，序号为【${fileIndex}】`);
    }
  }
}

// 忽略文件
const ignoredArray = [];
// 没有元数据的文件
const noMetaArray = [];
// 计算新码率，以1080p为1500为基准，按比例计算码率
data.forEach(e => {
  const meta = metaMap.get(e.filename);
  if (!meta) {
    log(`❌ 文件【${e.filename}】出错，跳过处理`);
    e.error = '元数据缺失';
    noMetaArray.push(e[META_KEY.filename]);
    return;
  }

  // 将meta中的所有值复制到e中
  for (const [key, value] of meta) {
    e[key] = value;
  }

  if (meta.get(META_KEY.error)) {
    log(`❌ 文件【${e.filename}】出错，错误原因：${meta.get(META_KEY.error)}`);
    e.error = meta.get(META_KEY.error);
    return;
  }
  const newBitrate = getBitRate(meta.pixelCount);
  let videoBitrate = process.argv.length == 4 ? `-b:v ${newBitrate}k` : '';
  e.targetBitrate = newBitrate;
  // 要加上音频分辨率，大部分时候音频都是128
  if ((newBitrate + 128) >= e.bitrate) {
    log(`⚠️ 文件【${e.filename}】的新码率【${newBitrate}】大于等于旧码率，跳过转码`);
    e.ignore = true;
    ignoredArray.push(e);
    return;
  }
  e.command = `ffmpeg -hide_banner -hwaccel cuda -y -i "${e.basename}_${e.extname}" -c:a aac -c:v av1_nvenc ${videoBitrate} "${e.basename}.mp4"${os.EOL}`;
});

// 转码过程不需要写入日志，看着就行。data.txt用来在预览时判断任务有没有运行以及运行时间
fs.writeFileSync(batchPath, 'echo %date% %time%> data.txt\r\n');
log('写入批量脚本');
data.filter(p => !p.ignore && p.command).forEach((f, i) => {
  log(`执行命令【${f.command.trim()}】`);
  fs.appendFileSync(batchPath, `echo 视频时长: ${f.duration}, 当前进度: ${i + 1}/${data.length}${os.EOL}`);
  fs.appendFileSync(batchPath, f.command);
});
fs.appendFileSync(batchPath, 'echo %date% %time%>> data.txt');
log('批量脚本写入完成,以下文件新码率大于等于旧码率，跳过转码:');
ignoredArray.forEach(ele => {
  log(`文件【${ele.filename}】分辨率【${ele.scale}】，原码率【${ele.bitrate}】，新码率【${ele.targetBitrate}】`);
});
log('❌ 以下文件出错，请检查:');
errorArray.forEach(ele => {
  log(ele);
});
log('⚠️ 以下文件没有元数据，请检查:');
noMetaArray.forEach(ele => {
  log(ele);
});
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
log('数据文件写入完成');
