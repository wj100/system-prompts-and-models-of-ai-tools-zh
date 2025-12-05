/**
 * 翻译配置
 */
export const config = {
  // 翻译引擎: 'google', 'yandex', 'libre', 'deepl'
  engine: 'google',
  
  // 目标语言 (使用 'zh' 表示中文，不要使用 'zh-CN')
  targetLanguage: 'zh',
  
  // 源语言 (如果未指定则自动检测)
  sourceLanguage: 'en',
  
  // 需要翻译的文件扩展名
  fileExtensions: ['.txt', '.md'],
  
  // 需要忽略的目录
  ignoreDirs: [
    'node_modules',
    '.git',
    '.github',
    'scripts',
    'assets'
  ],
  
  // 需要忽略的文件
  ignoreFiles: [
    'package.json',
    'package-lock.json',
    'glossary.json',
    '.gitignore'
  ],
  
  // 翻译之间的延迟（毫秒），避免触发速率限制
  translationDelay: 500,
  
  // 翻译失败时的最大重试次数
  maxRetries: 3,
  
  // 重试延迟（毫秒）- 将按指数退避方式递增
  retryDelay: 2000
};

