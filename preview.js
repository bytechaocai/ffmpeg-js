const cps = require('node:child_process');
const fs = require('fs');
const os = require('os');
const { log, error, warn } = require('node:console');
const { META_KEY } = require('./constants');

if (process.argv.length < 3) {
  error('❌ 参数错误');
  process.exit(1);
}

const workDir = process.argv[2];
let previewPath = `${workDir}/summary.html`;
const compressRatioThreshold = Number.parseFloat(process.argv[3]) || 0.9;

// 转码失败的文件
const failedFile = [];
const data = JSON.parse(fs.readFileSync(`${workDir}/data.json`).toString());
const started = fs.existsSync(`${workDir}/data.txt`);
if (!started) {
  previewPath = `${workDir}/preview.html`;
}

// 在生成表格前统一计算目标码率与原码率的比值
data.forEach(ele => {
  if (!Number.isFinite(ele.bitrateRatio) && Number.isFinite(ele.targetBitrate) && Number.isFinite(ele.bitrate)) {
    ele.bitrateRatio = ele.targetBitrate / ele.bitrate;
  }
  if (!started) {
    ele.compressRatio = Number.isFinite(ele.bitrateRatio) ? ele.bitrateRatio : null;
  }
});

for (const ele of data) {
  const filename = `${ele.basename}.mp4`;
  const filePath = `${workDir}/${filename}`;
  log(`开始处理文件【${filename}】`);
  if (!started || ele[META_KEY.ignore]) {
    if (ele[META_KEY.error]) {
      warn(`⚠️ 文件【${filename}】解析失败`);
    } else if (ele[META_KEY.ignore]) {
      warn(`⚠️ 文件【${filename}】已跳过`);
    }
    continue;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    warn(`⚠️ 文件【${filename}】不存在或转码失败`);
    ele[META_KEY.fail] = true;
    failedFile.push(filename);
    continue;
  }
  const cmd = `ffprobe -hide_banner "${filePath}" 2>&1`;
  const stdout = cps.execSync(cmd, { cwd: workDir }).toString();
  // 这里计算的其实是视频+音频的总码率，音频码率是几乎固定的的，实际转码出来有浮动但是不多，这里忽略，直接算进视频码率。
  ele.newBitrate = Number.parseInt(stdout.substring(stdout.indexOf('bitrate: ') + 9, stdout.indexOf(' kb/s')));
  const stat = fs.statSync(filePath);
  ele.newSize = stat.size;
  log(`文件【${ele.filename}】：码率【${ele.newBitrate}】，新大小【${ele.newSize}】`);
  ele.compressRatio = (ele.newSize / ele.size);
}

log('开始写入html');

const html = fs.readFileSync('preview.html').toString()
  .replaceAll('titlePlaceholder', started ? '转码结果总结' : '转码结果预览')
  .replaceAll('directoryPlaceholder', workDir);
// 直接替换，用下标来避免修改html后改代码。
const index = html.lastIndexOf('<tbody />');
const prefix = html.substring(0, index);
const suffix = html.substring(index + 9);
log('html模板解析完成');

// 辅助函数：生成单元格
const cell = (content) => `<th>${content}</th>${os.EOL}`;

// 辅助函数：格式化百分比
const formatPercent = (ratio) => ratio.toLocaleString('zh-cn', { style: 'percent' });

// 辅助函数：生成完整数据行，列顺序必须与表头一致
const generateColumns = (ele, index) => {
  // 判断顺序按代码执行顺序，这样可以提前发现错误然后直接返回
  // error不为空：解析失败，显示错误信息
  if (ele[META_KEY.error]) {
    return [
      cell(index + 1),
      cell(ele.filename),
      cell(ele.error),
      cell(ele.error),
      cell(ele.size.toLocaleString()),
      cell('-'),
      cell(ele.error),
      cell('-'),
      cell('-')
    ];
  }
  // ignore不为空：跳过转码
  if (ele[META_KEY.ignore]) {
    const ignoreMessage = ele[META_KEY.ignoreReason]
      ? `跳过转码（${ele[META_KEY.ignoreReason]}）`
      : '跳过转码';
    const bitrateRatio = Number.isFinite(ele[META_KEY.bitrateRatio])
      ? formatPercent(ele[META_KEY.bitrateRatio])
      : '-';
    return [
      cell(index + 1),
      cell(ele.filename),
      cell(ele.scale),
      cell(ele.duration),
      cell(ele.size.toLocaleString()),
      cell(ignoreMessage),
      cell(ele.bitrate.toLocaleString()),
      cell(Number.isFinite(ele.targetBitrate) ? ele.targetBitrate.toLocaleString() : '-'),
      cell(bitrateRatio)
    ];
  }
  // fail不为空：转码失败
  if (ele[META_KEY.fail]) {
    return [
      cell(index + 1),
      cell(ele.filename),
      cell(ele.scale),
      cell(ele.duration),
      cell(ele.size.toLocaleString()),
      cell('转码失败'),
      cell(ele.bitrate.toLocaleString()),
      cell('转码失败'),
      cell('转码失败')
    ];
  }
  if (started) {
    return [
      cell(index + 1),
      cell(ele.filename),
      cell(ele.scale),
      cell(ele.duration),
      cell(ele.size.toLocaleString()),
      cell(ele.newSize.toLocaleString()),
      cell(ele.bitrate.toLocaleString()),
      cell(ele.newBitrate.toLocaleString()),
      cell(formatPercent(ele.compressRatio))
    ];
  }
  return [
    cell(index + 1),
    cell(ele.filename),
    cell(ele.scale),
    cell(ele.duration),
    cell(ele.size.toLocaleString()),
    cell('-'),
    cell(ele.bitrate.toLocaleString()),
    cell(Number.isFinite(ele.targetBitrate) ? ele.targetBitrate.toLocaleString() : '-'),
    cell(Number.isFinite(ele.compressRatio) ? formatPercent(ele.compressRatio) : '-')
  ];
};

// 辅助函数：生成数据行
const generateRow = (ele, index) => {
  const cols = generateColumns(ele, index);
  log(`文件【${ele.filename}】写入完成`);
  return `<tr>${os.EOL}${cols.join('')}</tr>${os.EOL}`;
};

// 辅助函数：计算总时长
const calcTotalDuration = (data) => {
  const sumSeconds = data.reduce((pv, { duration, fail, ignore }) => {
    if (fail || ignore) return pv;
    // 换算成秒：hh:mm:ss.sss，yy*3600+mm*60+dd毫秒忽略
    const ts = Number.parseInt(duration.substring(0, 2)) * 3600 +
      Number.parseInt(duration.substring(3, 5)) * 60 +
      Number.parseInt(duration.substring(6, 8));
    return ts + pv;
  }, 0);
  // 将秒换算成时分秒
  const hour = Math.floor(sumSeconds / 3600);
  const minutes = sumSeconds % 3600;
  const minute = Math.floor(minutes / 60);
  const second = minutes % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
};

// 辅助函数：生成合计行
const generateTotalRow = (data) => {
  const sumDuration = calcTotalDuration(data);
  const sumSize = data.reduce((pv, cv) => cv.fail || cv.ignore ? pv : pv + cv.size, 0);
  const sumNewSize = data.reduce((pv, cv) => cv.fail || cv.ignore ? pv : pv + cv.newSize, 0);

  let sumCompressRatio;
  if (started) {
    sumCompressRatio = formatPercent(sumNewSize / sumSize);
  } else {
    const sumBitrate = data.reduce((pv, cv) => cv.fail || cv.ignore ? pv : pv + cv.bitrate, 0);
    // 检查如果有文件设置了目标码率，则计算总压缩比，否则显示为'-'
    const hasTargetBitrate = data.some(cv => Number.isFinite(cv.targetBitrate));
    if (hasTargetBitrate) {
      const sumTargetBitrate = data.reduce((pv, cv) => cv.fail || cv.ignore ? pv : pv + cv.targetBitrate, 0);
      sumCompressRatio = formatPercent(sumTargetBitrate / sumBitrate);
    } else {
      sumCompressRatio = '-';
    }
  }

  const cols = [
    `<th>合计</th>${os.EOL}`,
    cell('-'),
    cell('-'),
    cell(sumDuration),
    cell(sumSize.toLocaleString()),
    cell(started ? sumNewSize.toLocaleString() : '-'),
    cell('-'),
    cell('-'),
    cell(sumCompressRatio)
  ];
  return `<tr>${os.EOL}${cols.join('')}</tr>${os.EOL}`;
};

// 构建表格内容
const tbodyContent = data.map((ele, i) => generateRow(ele, i)).join('');
const tbody = `<tbody>\r\n${tbodyContent}</tbody>\r\n`;

// 合计行
const tfoot = `<tfoot>\r\n${generateTotalRow(data)}</tfoot>\r\n`;

// 一次性写入文件
const content = `${prefix}${tbody}${tfoot}${suffix}`;
fs.writeFileSync(previewPath, content);
log('html写入完成');

log(`⚠️ 以下文件压缩比大于等于【${compressRatioThreshold}】:`);
const warnMsg = data.filter(ele => ele.compressRatio >= compressRatioThreshold)
  .map(e => `${e.filename}: ${formatPercent(e.compressRatio)}`)
  .join(os.EOL);
log(warnMsg);
log('❌ 以下文件转码失败:');
log(`${failedFile.join(os.EOL)}`);
