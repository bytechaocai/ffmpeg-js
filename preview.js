const cps = require('node:child_process');
const fs = require('fs');
const os = require('os');
const { log, error } = require('node:console');

if (process.argv.length !== 3) {
  error('参数错误');
  process.exit(1);
}

const workDir = process.argv[2];
const previewPath = `${workDir}/preview.html`;

const data = JSON.parse(fs.readFileSync(`${workDir}/data.json`).toString());
for (const ele of data) {
  log(`开始处理文件【${ele.filename}】`);
  const cmd = `ffprobe -hide_banner "${workDir}/${ele.filename}" 2>&1`;
  const stdout = cps.execSync(cmd, { cwd: workDir }).toString();
  ele.newBitrate = Number.parseInt(stdout.substring(stdout.indexOf('bitrate: ') + 9, stdout.indexOf(' kb/s')));
  const stat = fs.statSync(`${workDir}/${ele.filename}`);
  ele.newSize = stat.size;
  log(`文件【${ele.filename}】: bitrate=${ele.newBitrate},newSize=${ele.newSize}`);
  ele.compressRatio = (ele.newSize / ele.size).toLocaleString('zh-cn', {
    style: 'percent'
  });
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
  fs.appendFileSync(previewPath, `<th>${ele.filename}</th>${os.EOL}`);
  fs.appendFileSync(previewPath, `<th>${ele.scale}</th>${os.EOL}`);
  fs.appendFileSync(previewPath, `<th>${ele.duration}</th>${os.EOL}`);
  fs.appendFileSync(previewPath, `<th>${ele.size.toLocaleString()}</th>${os.EOL}`);
  fs.appendFileSync(previewPath, `<th>${ele.newSize.toLocaleString()}</th>${os.EOL}`);
  fs.appendFileSync(previewPath, `<th>${ele.bitrate.toLocaleString()}</th>${os.EOL}`);
  fs.appendFileSync(previewPath, `<th>${ele.newBitrate.toLocaleString()}</th>${os.EOL}`);
  fs.appendFileSync(previewPath, `<th>${ele.compressRatio}</th>${os.EOL}`);
  fs.appendFileSync(previewPath, `      </tr>${os.EOL}`);
  log(`文件[${ele.filename}]写入完成`);
}
fs.appendFileSync(previewPath, '    </tbody>\r\n');

// 合计行
const sumSize = data.reduce((pv, cv) => pv + cv.size, 0);
const sumSeconds = data.reduce((pv, { duration }) => {
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
const sumNewSize = data.reduce((pv, cv) => pv + cv.newSize, 0);
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
