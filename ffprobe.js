const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('console');
const ext = require('./ext.json');

// 分隔符
const split = '================================================================================';
// 获取元数据的脚本
const metaBatch = "1_meta.bat";
// 重命名脚本，重命名是在文件名末尾加下划线，用来当备份
const renameBatch = "2_rename.bat";
// 撤销重命名，需要删除目标文件，否则重命名失败
const undoRenameBatch = "4_undorename.bat";
// 打包
const compressBatch = "5_7zip.bat";
// 保存元数据的文本文件
const metaFile = "meta.txt";
// 视频文件扩展名，ext中也是扩展名数组
const extArray = ['avi', 'mp4'].concat(ext);
// 共享数据，里面包含要转码的文件的信息：文件名，时长，大小，分辨率，旧码率，新码率，元数据里的创建时间。
const dataArray = [];
// 共享数据文件
const dataJson = 'data.json';
/**
 * 输入指定目录，遍历其中的视频文件并以html表格形式输出文件名，文件大小，比特率，长度，格式
 */
if (process.argv.length !== 3) {
  console.error('参数错误');
  process.exit(1);
}

const workDir = process.argv[2];
console.log(`当前目录:${workDir}`);

const metaPath = path.join(workDir, metaBatch);
const renamePath = path.join(workDir, renameBatch);
const undoRenamePath = path.join(workDir, undoRenameBatch);
const compressPath = path.join(workDir, compressBatch);
const dataPath = path.join(workDir, dataJson);
console.log(`元数据脚本:${metaPath},备份脚本:${renamePath}`);

// 清空脚本内容，同时也清空脚本运行结果中的内容
fs.writeFileSync(metaPath, `echo start>${metaFile}${os.EOL}`);
fs.writeFileSync(renamePath, '');
fs.writeFileSync(undoRenamePath, '');
fs.writeFileSync(compressPath, '');
// 关闭回显，因为ffprobe结果中就有文件
fs.appendFileSync(metaPath, `@echo off${os.EOL}`);

let files;
if (fs.existsSync(dataPath)) {
  log('存在data.json文件');
  files = JSON.parse(fs.readFileSync(dataPath).toString()).map(e => e.filename);
} else {
  files = fs.readdirSync(workDir);
}
console.log(`当前目录有${files.length}个文件:${files.join(' || ')}`);
for (const ele of files) {
  // 跳过非视频文件，这样就不用在转码时加额外判断。
  // 扩展名一般是小写，但是部分场景下是大写，由创建文件的人决定
  if (extArray.findIndex((v, i, o) => ele.endsWith(v) || ele.endsWith(v.toUpperCase())) == -1) {
    console.log(`XX 文件【${ele}】不是视频文件`);
    continue;
  }
  const stat = fs.statSync(`${workDir}/${ele}`);
  const parsedPath = path.parse(`${workDir}/${ele}`);
  const { base: filename, name: basename, ext: extname } = parsedPath;
  dataArray.push({
    filename,
    size: stat.size,
    basename,
    extname,
  });

  fs.appendFileSync(metaPath, `echo ${split}>>${metaFile} 2>&1${os.EOL}`);
  fs.appendFileSync(metaPath, `ffprobe -hide_banner "${ele}">> ${metaFile} 2>&1${os.EOL}`);
  // 重命名脚本
  fs.appendFileSync(renamePath, `rename "${ele}" "${ele.substring(0, ele.length - extname.length)}_${extname}"${os.EOL}`);
  fs.appendFileSync(undoRenamePath, `rename "${ele.substring(0, ele.length - extname.length)}_${extname}" "${ele}"${os.EOL}`);
  // 打包脚本，密码从命令行输入
  fs.appendFileSync(compressPath, `7z a "${ele}.7z" -mx0 -p%1% -mhe "${ele}"${os.EOL}`);
  log(`文件[${ele}]处理完成`);
}
fs.appendFileSync(metaPath, '@echo on');
// data是一个json，只能一起写入，不能像命令一样一行一行写入
fs.writeFileSync(dataPath, JSON.stringify(dataArray, null, 2));
log('数据文件写入完成');
