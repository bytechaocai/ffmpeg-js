const fs = require('fs');
const path = require('path');
const os = require('os');

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
// 视频文件扩展名
const extArray = ['avi', 'mp4', 'mov', 'ts'];

/**
 * 输入指定目录，遍历其中的视频文件并以html表格形式输出文件名，文件大小，比特率，长度，格式
 */
if (process.argv.length !== 3) {
  console.error('参数错误');
  process.exit(1);
}

const workDir = process.argv[2];
console.log(`当前目录:${workDir}`);

const files = fs.readdirSync(workDir);
console.log(`当前目录有${files.length}个文件:${files.join(' || ')}`);

const metaPath = path.join(workDir, metaBatch);
const renamePath = path.join(workDir, renameBatch);
const undoRenamePath = path.join(workDir, undoRenameBatch);
const compressPath = path.join(workDir, compressBatch);
console.log(`元数据脚本:${metaPath},备份脚本:${renamePath}`);

// 清空脚本内容，同时也清空脚本运行结果中的内容
fs.writeFileSync(metaPath, `echo start>${metaFile}${os.EOL}`);
fs.writeFileSync(renamePath, '');
fs.writeFileSync(undoRenamePath, '');
fs.writeFileSync(compressPath, '');
// 关闭回显，因为ffprobe结果中就有文件
fs.appendFileSync(metaPath, `@echo off${os.EOL}`);
for (const ele of files) {
  // 跳过非视频文件，这样就不用在转码时加额外判断。
  if (extArray.findIndex((v, i, o) => ele.endsWith(v)) == -1) {
    console.log(`文件【${ele}】不是视频文件`);
    continue;
  }
  fs.appendFileSync(metaPath, `echo ${split}>>${metaFile} 2>&1${os.EOL}`);
  fs.appendFileSync(metaPath, `ffprobe -hide_banner "${ele}">> ${metaFile} 2>&1${os.EOL}`);
  // 重命名脚本
  const extname = path.extname(ele);
  fs.appendFileSync(renamePath, `rename "${ele}" "${ele.substring(0, ele.length - extname.length)}_${extname}"${os.EOL}`);
  fs.appendFileSync(undoRenamePath, `rename "${ele.substring(0, ele.length - extname.length)}_${extname}" "${ele}"${os.EOL}`);
  // 打包脚本，密码从命令行输入
  fs.appendFileSync(compressPath, `7z a "${ele}.7z" -mx0 -p%1% -mhe "${ele}"${os.EOL}`);
}
fs.appendFileSync(metaPath, '@echo on');
