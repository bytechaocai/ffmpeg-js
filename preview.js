const cps = require('node:child_process');
const fs = require('fs');
const os = require('os');
const { log, error, warn } = require('node:console');

if (process.argv.length < 3) {
  error('参数错误');
  process.exit(1);
}

const workDir = process.argv[2];
const previewPath = `${workDir}/preview.html`;
const compressRatioThreshold = Number.parseFloat(process.argv[3]) || 0.9;

// 转码失败的文件
const failedFile = [];
const data = JSON.parse(fs.readFileSync(`${workDir}/data.json`).toString());
const started = fs.existsSync(`${workDir}/data.txt`);
for (const ele of data) {
  const filename = `${ele.basename}.mp4`;
  const filePath = `${workDir}/${filename}`;
  log(`开始处理文件【${filename}】`);
  if (!started || ele.ignore) {
    ele.compressRatio = (ele.targetBitrate / ele.bitrate);
    if (ele.ignore) {
      warn(`XX 文件[${filename}]已跳过`);
    }
    continue;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    warn(`XX 文件[${filename}]不存在或转码失败`);
    ele.fail = true;
    failedFile.push(filename);
    continue;
  }
  const cmd = `ffprobe -hide_banner "${filePath}" 2>&1`;
  const stdout = cps.execSync(cmd, { cwd: workDir }).toString();
  ele.newBitrate = Number.parseInt(stdout.substring(stdout.indexOf('bitrate: ') + 9, stdout.indexOf(' kb/s')));
  const stat = fs.statSync(filePath);
  ele.newSize = stat.size;
  log(`文件【${ele.filename}】: bitrate=${ele.newBitrate},newSize=${ele.newSize}`);
  ele.compressRatio = (ele.newSize / ele.size);
}

log('开始写入html');

const html = fs.readFileSync('preview.html').toString();
// 直接替换，用下标来避免修改html后改代码。
const index = html.lastIndexOf('<tbody />');
const prefix = html.substring(0, index);
const suffix = html.substring(index + 9);
log('html模板解析完成');

fs.writeFileSync(previewPath, prefix);
fs.appendFileSync(previewPath, '    <tbody>\r\n');
for (const ele of data) {
  fs.appendFileSync(previewPath, `      <tr>${os.EOL}`);
  fs.appendFileSync(previewPath, `<th>${ele.filename}</th>${os.EOL}`); // 文件名
  fs.appendFileSync(previewPath, `<th>${ele.scale}</th>${os.EOL}`); // 分辨率
  fs.appendFileSync(previewPath, `<th>${ele.duration}</th>${os.EOL}`); // 时长
  fs.appendFileSync(previewPath, `<th>${ele.size.toLocaleString()}</th>${os.EOL}`); // 文件大小
  // 两种状态，已运行转码任务和未运行转码任务
  if (started) {
    // 新文件大小
    if (ele.ignore) {
      fs.appendFileSync(previewPath, "<th>跳过转码</th>\r\n");
    } else if (ele.fail) {
      fs.appendFileSync(previewPath, "<th>转码失败</th>\r\n");
    } else {
      fs.appendFileSync(previewPath, `<th>${ele.newSize.toLocaleString()}</th>${os.EOL}`);
    }
    // 旧码率
    fs.appendFileSync(previewPath, `<th>${ele.bitrate.toLocaleString()}</th>${os.EOL}`);
    // 新码率和压缩比
    if (ele.ignore) {
      fs.appendFileSync(previewPath, `<th>${ele.targetBitrate.toLocaleString()}</th>${os.EOL}`);
      fs.appendFileSync(previewPath, `<th>${ele.compressRatio.toLocaleString('zh-cn', {
        style: 'percent'
      })}</th>${os.EOL}`);
    } else if (ele.fail) {
      fs.appendFileSync(previewPath, "<th>转码失败</th>\r\n");
      fs.appendFileSync(previewPath, "<th>转码失败</th>\r\n");
    } else {
      fs.appendFileSync(previewPath, `<th>${ele.newBitrate.toLocaleString()}</th>${os.EOL}`);
      fs.appendFileSync(previewPath, `<th>${ele.compressRatio.toLocaleString('zh-cn', {
        style: 'percent'
      })}</th>${os.EOL}`);
    }
  } else {
    fs.appendFileSync(previewPath, "<th>-</th>\r\n"); // 新文件大小
    fs.appendFileSync(previewPath, `<th>${ele.bitrate.toLocaleString()}</th>${os.EOL}`); // 旧码率
    fs.appendFileSync(previewPath, `<th>${ele.targetBitrate.toLocaleString()}</th>${os.EOL}`); // 新码率
    fs.appendFileSync(previewPath, `<th>${ele.compressRatio.toLocaleString('zh-cn', {
      style: 'percent'
    })}</th>${os.EOL}`); // 压缩比
  }
  fs.appendFileSync(previewPath, `      </tr>${os.EOL}`);
  log(`文件[${ele.filename}]写入完成`);
}
fs.appendFileSync(previewPath, '    </tbody>\r\n');

// 合计行
const sumSize = data.reduce((pv, cv) => cv.fail || cv.ignore ? pv : pv + cv.size, 0);
const sumSeconds = data.reduce((pv, { duration, fail, ignore }) => {
  if (fail || ignore) {
    return pv;
  }
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
const sumDuration = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
const sumNewSize = data.reduce((pv, cv) => cv.fail || cv.ignore ? pv : pv + cv.newSize, 0);
const sumCompressRatio = (sumNewSize / sumSize).toLocaleString('zh-cn', { style: 'percent' });
fs.appendFileSync(previewPath, '    <tfoot>\r\n');
fs.appendFileSync(previewPath, `      <tr>${os.EOL}`);
fs.appendFileSync(previewPath, `<th>合计</th>${os.EOL}`);
fs.appendFileSync(previewPath, `<th>-</th>${os.EOL}`);
fs.appendFileSync(previewPath, `<th>${sumDuration}</th>${os.EOL}`);
fs.appendFileSync(previewPath, `<th>${sumSize.toLocaleString()}</th>${os.EOL}`);
fs.appendFileSync(previewPath, `<th>${sumNewSize.toLocaleString()}</th>${os.EOL}`);
fs.appendFileSync(previewPath, `<th>-</th>${os.EOL}`);
fs.appendFileSync(previewPath, `<th>-</th>${os.EOL}`);
fs.appendFileSync(previewPath, `<th>${sumCompressRatio.toLocaleString()}</th>${os.EOL}`);
fs.appendFileSync(previewPath, `      </tr>${os.EOL}`);

fs.appendFileSync(previewPath, '    </tfoot>\r\n');

fs.appendFileSync(previewPath, suffix);
log('html写入完成');
log(`以下文件压缩比大于等于${compressRatioThreshold}:`);
const warnMsg = data.filter(ele => ele.compressRatio >= compressRatioThreshold)
  .map(e => `${e.filename}: ${e.compressRatio.toLocaleString('zh-cn', { style: 'percent' })}`)
  .join(os.EOL);
log(warnMsg);
log('以下文件转码失败:');
log(failedFile.join(os.EOL));
