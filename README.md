# ffmpeg-js

## 项目简介

我平时经常转码视频以节省磁盘空间，当文件少的时候可以直接转，但当文件多的时候非常麻烦，需要先用`ffprobe`获取码率，然后用`ffmpeg`转码，每一个文件都需要如此，此外，为了防止网盘窥探视频，我还需要将视频加密打包然后上传，而不是直接上传原始视频。为了解决以上问题，我急需一种自动程序来执行以上步骤，因此诞生了这个仓库。

## 运行环境

为了运行代码，你需要以下环境且可执行文件必须在`PATH`中：

- 任意版本的node
- 任意版本的ffmpeg
- 任意版本的7zip

程序未做版本兼容测试，开发过程任何测试都以我自己电脑上的版本为准，由于没有调用一些深层接口，因此在版本问题出现前可以认为没有版本问题，也就是任意版本都能运行。

## 使用方式

假设你要转码的视频目录是`c:/path/of/video` 执行`node ffprobe.js c:/path/of/video`，会在`c:/path/of/video`下生成以下文件：

- `1_meta.bat`：获取元数据并保存在`meta.txt`中，脚本开头会关闭回显，结束后开启回显。
- `meta.txt`：当前目录下视频的元数据，以80个等号分隔。
- `2_rename.bat`：重命名文件，在文件名后加下划线。
- `4_undorename.bat`：用来撤销重命名，删除文件名后的下划线。
- `5_7zip.bat`：加密打包文件。

然后执行`node ffprobe.js c:/path/of/video`，就会在`c:/path/of/video`下生成一个`3_ffmpeg.bat`。批处理脚本生成后，按数字顺序执行即可，执行前需要先执行`chcp 65001`将命令行编码改为`utf-8`，否则`ffprobe`无法识别中文导致报错参数错误。

所有生成的脚本除了`1_meta.bat`会将日志（结果）输到文件外，其余脚本都不会将日志输出到文件。所有脚本都在`c:/path/of/video`下直接执行，`3_ffmpeg.bat`有可选参数基准码率，后文会介绍，`5_7zip.bat`需要密码参数，比如`5_7zip.bat 123456`，123456就是密码，其余脚本都不需要参数。

## 相关命令

假设文件名是`input video.mp4`，以下是具体执行的命令，为防止文件名中的空格切分命令，所有文件名都是用双引号包裹：

- `1_meta.bat`：`ffprobe -hide_banner "input video.mp4">>meta.txt 2>&1`
- `2_rename.bat`：`rename "input video.mp4" "input video_.mp4"`
- `3_ffmpeg.bat`：`ffmpeg -hide_banner -y -i "input video_.mp4" -c:a aac -c:v av1_nvenc -b:v 3000k "input video.mp4"`
- `4_undorename.bat`：`rename "input_video_.mp4" input_video.mp4"`
- `5_7zip.bat`：`7z a "input video.mp4.7z" -mx0 -p%1% -mhe "input video.mp4"`

## 基准码率

`ffmpeg.js`中包含一个json数组：

```json
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
```

这个json就是码率参考，用来处理同目录下不同尺寸不同尺寸的文件，基准码率就是1080p的码率，然后用基准码率乘以倍率magnification就是对应分辨率的码率。如果视频大小不是标准大小，则使用最近的码率。如果没有加码率参数，则由ffmpeg自己决定分辨率，此使，`5_7zip.bat`会变成`ffmpeg -hide_banner -y -i "input video_.mp4" -c:a aac -c:v av1_nvenc "input video.mp4"`。

上面的倍率是我问ai得到的，目前我没有一个很好的方法来根据分辨率来计算能保留画质的最小码率，只能使用分段函数做简单计算。
