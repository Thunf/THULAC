// const path = require('path');
// const pkg = require('./package.json');
// const del = require('del');
// const moment = require('moment');
// const vinylPaths = require('vinyl-paths');
// const less = require('gulp-less');
// const copy = require('gulp-copy');
// const rename = require('gulp-rename');
// const replace = require('gulp-replace');
// const isMock = process.env.MOCK === 'true';
// const isDev = process.env.DEVELOP === 'true'; // 通过cross-env设置

const fs = require('fs');
const gulp = require('gulp');
const shell = require('shelljs');
const browserSync = require('browser-sync').create();

const EXCLUDES = [];

// 分词 segment =>
//   读取原文 read (input)
//   格式化原文 format (input)
//   shell.exec('./thualc')
// 统计分词 sort & combo
// 格式化分词数据 json
//
// 监听输入原文 watch => input.txt
// 刷新页面

const inputRegExpArr = [
  // 链接
  /\w+?:\/\/[\w\/\.\-\#\:\?\=]+/g,
  // // @名称
  /@[\u4e00-\u9fa5]{2}/g,
  // 只留下 @名称
  // [/([^@]*)(@[\u4e00-\u9fa5]{2})([^@]*)/g, '$2']
  // 中文符号
  /，|、|；|：|。|「|」|（|）|【|】|“|”/g,
  // 日期格式
  /D?d?\d+D?d?h?\.?\s*/g,
  // 连接符
  /\s*\-\s*|\s*——\s*/g,
  // 其他非中文、英文、单空格的
  /[^\u4e00-\u9fa5|^\w|\s]+/g,
];
const outputRegExpArr = [
  /\s+\n*/g,
];

// 批量格式化
function format(string, RegExpArr, replaceStr = ' ') {
  return [string, ...RegExpArr].reduce((string, reg) => {
    const regExp = Array.isArray(reg) ? reg[0] : reg;
    const replace = Array.isArray(reg) ? reg[1] : replaceStr;
    return string.replace(regExp, replace);
  });
}

// 分词任务
gulp.task('segment', function(done) {
  // 读取原文 read (input)
  const data = fs.readFileSync('./userword_input.txt');
  const content = data.toString();
  // shell.echo('[task][segment]: readFile', content);
  // 格式化原文 format (input)
  const formatContent = format(content, inputRegExpArr);
  // 格式化内容写入文件
  fs.writeFileSync('./userword_input_format.txt', formatContent);
  // 分词
  const result = shell.exec('./thulac -seg_only -user userword.txt -input userword_input_format.txt -output userword_output.txt');
  if (result.code !== 0) {
    shell.echo('Error: thulac failed (分词异常)');
    shell.exit(1);
  }
  // 读取分词内容
  const segmentData = fs.readFileSync('./userword_output.txt');
  const segmentContent = segmentData.toString();
  // 清理分词内容
  const formatSegmentContent = format(segmentContent, outputRegExpArr, '\n');
  // 分词按行切割，去除单字词语
  const formatSegmentContentArr = formatSegmentContent.split('\n').filter(o => o.length >= 2);
  // shell.echo('[task][segment]: formatSegmentContent', formatSegmentContentArr.length);
  // MAP汇总分词频率
  const formatMap = [{}, ...formatSegmentContentArr].reduce((map, name) => {
    if (map[name]) {
      map[name].oValue = map[name].oValue + 1;
    } else {
      map[name] = { oValue: 1, name };
    }
    return map;
  });
  // 分词数据序列化
  const sortSegmentArr = Object.values(formatMap).sort((a, b) => b.oValue - a.oValue) //.splice(0, 200);
  // 十段分布比例
  const arrConf = [2, 5, 8, 10, 15, 10, 8, 5, 3, 2];
  // const arrConf = [2, 0, 1, 1, 2, 3, 4, 2];
  const arrConfSum = +[0, ...arrConf].reduce((x, a) => x + a).toFixed(2);
  const arrRate = arrConf.map(val => +(val / arrConfSum).toFixed(2));
  // shell.echo('[task][segment]: arrRate', arrRate);
  // 十段累计占比
  const arrRateCombo = arrRate.map((o, index) => +[0, ...arrRate.slice(0, index + 1)].reduce((x, a) => a + x).toFixed(2));
  // 频值归一化
  const normalizeArr = sortSegmentArr.map((item, index) => {
    // 当前值排位比例
    const indexRate = index / sortSegmentArr.length;
    // 归一化排位
    const findIndex = arrRate.length - [...arrRateCombo, 0].reduceRight((idx, rate, index) => {
      return indexRate <= rate ? index : idx;
    } );
    // 格式化数据
    return Object.assign(item, { value: findIndex });
  });
  // shell.echo('[task][segment]: formatSegmentContent', sortSegmentArr);
  // 输出分词json数据
  fs.writeFileSync('./dist/userword_output.json', JSON.stringify(normalizeArr, null, 2));
  // 任务
  return done();
});

// 监听原文变化
gulp.task('watch', gulp.series(
  gulp.parallel('segment'),
  gulp.parallel(
    function watch_input() {
      shell.echo('[task]: watcher');
      // 监控output
      gulp.watch(
        [ './userword_input.txt', ...EXCLUDES],
        { event: 'all' },
        gulp.series('segment', function (done) {
          browserSync.reload();
          done();
        })
      );
    },
    function watch_page() {
      shell.echo('[task]: watcher');
      // 监控output
      gulp.watch(
        [ './dist/**/*.html',  './dist/**/*.json', ...EXCLUDES],
        { event: 'all' },
        gulp.series(function (done) {
          browserSync.reload();
          done();
        })
      );
    },
    function browser() {
      shell.echo('[task]: browser');
      browserSync.init({
        server: { baseDir: "dist" }
      });
    },
  ),
));
