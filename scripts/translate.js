import translate from 'translate';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 加载术语表
let glossary = {};
try {
  const glossaryPath = path.join(rootDir, 'glossary.json');
  const glossaryContent = await fs.readFile(glossaryPath, 'utf-8');
  glossary = JSON.parse(glossaryContent);
} catch (error) {
  console.warn('警告: 无法加载 glossary.json:', error.message);
}

// 配置翻译引擎
translate.engine = config.engine;
translate.key = process.env.TRANSLATE_KEY || '';

/**
 * 用占位符替换代码块和特殊内容
 */
function protectCodeBlocks(text) {
  const placeholders = [];
  let placeholderIndex = 0;
  
  // 保护 XML/HTML 标签（包括自闭合标签、属性等）
  // 匹配: <tag>, </tag>, <tag/>, <tag attr="value">, <!-- comment -->, 等
  text = text.replace(/<[^>]+>/g, (match) => {
    const placeholder = `__XML_TAG_${placeholderIndex}__`;
    placeholders.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });
  
  // 保护 Markdown 代码块 (```language ... ```)
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    const placeholder = `__CODE_BLOCK_${placeholderIndex}__`;
    placeholders.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });
  
  // 保护行内代码 (`code`)
  text = text.replace(/`[^`\n]+`/g, (match) => {
    const placeholder = `__INLINE_CODE_${placeholderIndex}__`;
    placeholders.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });
  
  // 保护 URL
  text = text.replace(/https?:\/\/[^\s\)]+/g, (match) => {
    const placeholder = `__URL_${placeholderIndex}__`;
    placeholders.push({ placeholder, content: match });
    placeholderIndex++;
    return placeholder;
  });
  
  // 保护文件路径（常见模式）
  text = text.replace(/(?:^|\s)([\.\/][\w\/\.\-]+(?:\.\w+)?)/gm, (match, p1) => {
    // 仅在看起来像文件路径时才保护
    if (p1.includes('/') || p1.startsWith('./') || p1.startsWith('../')) {
      const placeholder = `__FILE_PATH_${placeholderIndex}__`;
      placeholders.push({ placeholder, content: match.trim() });
      placeholderIndex++;
      return ' ' + placeholder;
    }
    return match;
  });
  
  // 在翻译之前保护术语表中的术语
  // 这确保术语表中的术语不会被翻译引擎误翻译
  // 按长度排序（最长的优先），避免部分替换
  const sortedTerms = Object.keys(glossary).sort((a, b) => b.length - a.length);
  sortedTerms.forEach((term) => {
    const translation = glossary[term];
    // 保护所有术语表中的术语以确保翻译一致性
    // 值等于键的术语（专有名词）将保持不变
    // 值不等于键的术语将在恢复后替换为正确的翻译
    // 使用单词边界以获得更好的匹配
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    text = text.replace(regex, (match) => {
      // 检查是否已被保护（在占位符内）
      if (match.includes('__') && (match.includes('CODE_BLOCK') || match.includes('XML_TAG') || 
          match.includes('INLINE_CODE') || match.includes('URL') || match.includes('FILE_PATH') ||
          match.includes('GLOSSARY') || match.includes('词汇表') || /^__[A-Z_]+_\d+__$/.test(match))) {
        return match;
      }
      // 使用不易被翻译的占位符格式（纯数字和特殊字符）
      const placeholder = `__G${placeholderIndex}__`;
      placeholders.push({ placeholder, content: match });
      placeholderIndex++;
      return placeholder;
    });
  });
  
  return { text, placeholders };
}

/**
 * 从占位符恢复代码块和特殊内容
 */
function restoreCodeBlocks(text, placeholders) {
  // 按占位符长度倒序排列，先恢复长的占位符，避免部分匹配问题
  const sortedPlaceholders = [...placeholders].sort((a, b) => b.placeholder.length - a.placeholder.length);
  
  sortedPlaceholders.forEach(({ placeholder, content }) => {
    // 先尝试恢复原始占位符
    text = text.replace(placeholder, content);
    
    // 如果占位符被翻译了（如 __GLOSSARY_96__ 被翻译成 __词汇表_96__），
    // 尝试匹配翻译后的格式
    // 匹配模式：__[中文字符或英文字母]+_\d+__
    if (placeholder.startsWith('__GLOSSARY_') || placeholder.startsWith('__G')) {
      // 提取数字部分
      const numberMatch = placeholder.match(/_(\d+)__$/);
      if (numberMatch) {
        const number = numberMatch[1];
        // 匹配翻译后的占位符：__[任意中文字符或字母]+_数字__
        const translatedPattern = new RegExp(`__[\\u4e00-\\u9fa5a-zA-Z]+_${number}__`, 'g');
        text = text.replace(translatedPattern, content);
      }
    }
  });
  
  return text;
}

/**
 * 将术语表中的术语应用到文本
 * 注意: 此函数在翻译和占位符恢复之后调用。
 * 被保护的术语（值等于键，如 "React": "React"）已经从占位符恢复并保持不变。
 * 此函数处理任何需要翻译的剩余术语（值不等于键）。
 */
function applyGlossary(text) {
  let result = text;
  // 按长度排序（最长的优先），避免部分替换
  const sortedTerms = Object.keys(glossary).sort((a, b) => b.length - a.length);
  
  sortedTerms.forEach((term) => {
    const translation = glossary[term];
    // 仅在术语不等于翻译时才应用翻译（实际翻译）
    // 术语等于翻译的术语已经被保护并恢复
    if (term !== translation) {
      // 使用单词边界以获得更好的匹配
      const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      result = result.replace(regex, translation);
    }
  });
  
  return result;
}

/**
 * 使用重试逻辑翻译文本
 */
async function translateText(text, retries = config.maxRetries) {
  try {
    const translated = await translate(text, { to: config.targetLanguage });
    return translated;
  } catch (error) {
    if (retries > 0) {
      const delay = config.retryDelay * (config.maxRetries - retries + 1); // 指数退避
      console.warn(`翻译失败: ${error.message}，将在 ${delay}ms 后重试... (剩余 ${retries} 次重试)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return translateText(text, retries - 1);
    }
    console.error(`翻译失败，已重试 ${config.maxRetries} 次: ${error.message}`);
    throw error;
  }
}

/**
 * 翻译文本文件
 */
async function translateTextFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // 保护代码块和特殊内容
    const { text: protectedText, placeholders } = protectCodeBlocks(content);
    
    // 如果太长则分割成块（Google Translate 有限制）
    const maxChunkLength = 5000;
    const chunks = [];
    let currentChunk = '';
    
    const lines = protectedText.split('\n');
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxChunkLength && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    
    // 翻译每个块
    let translatedText = '';
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i].trim();
      if (chunk.length === 0) continue;
      
      console.log(`正在翻译块 ${i + 1}/${chunks.length}...`);
      const translated = await translateText(chunk);
      translatedText += translated + '\n';
      
      // 块之间的延迟，避免触发速率限制
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, config.translationDelay));
      }
    }
    
    // 恢复代码块和术语表中的术语
    translatedText = restoreCodeBlocks(translatedText, placeholders);
    
    // 应用需要翻译的术语（不仅仅是保护）
    // 这处理值不等于键的术语（实际翻译）
    translatedText = applyGlossary(translatedText);
    
    return translatedText;
  } catch (error) {
    console.error(`翻译文件时出错 ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * 翻译 JSON 文件（仅翻译 description 字段）
 */
async function translateJsonFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // 递归翻译 description 字段
    async function translateObject(obj) {
      if (Array.isArray(obj)) {
        return Promise.all(obj.map(item => translateObject(item)));
      } else if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          if (key === 'description' && typeof value === 'string') {
            try {
              // 保护并翻译 description
              const { text: protectedText, placeholders } = protectCodeBlocks(value);
              const translated = await translateText(protectedText);
              let finalText = restoreCodeBlocks(translated, placeholders);
              finalText = applyGlossary(finalText);
              
              // 确保翻译后的文本是有效的 JSON 字符串
              // JSON.stringify 会正确转义特殊字符
              result[key] = finalText;
              
              // 添加延迟
              await new Promise(resolve => setTimeout(resolve, config.translationDelay));
            } catch (error) {
              console.warn(`翻译 ${filePath} 中的 description 失败，保留原文: ${error.message}`);
              result[key] = value; // 如果翻译失败则保留原文
            }
          } else {
            result[key] = await translateObject(value);
          }
        }
        return result;
      }
      return obj;
    }
    
    const translated = await translateObject(data);
    
    // 返回前验证 JSON
    const jsonString = JSON.stringify(translated, null, 2);
    try {
      JSON.parse(jsonString); // 验证它是有效的 JSON
    } catch (jsonError) {
      console.error(`为 ${filePath} 生成了无效的 JSON: ${jsonError.message}`);
      throw new Error(`生成了无效的 JSON: ${jsonError.message}`);
    }
    
    return jsonString;
  } catch (error) {
    if (error.message.includes('Invalid JSON') || error.message.includes('无效的 JSON')) {
      throw error;
    }
    console.error(`翻译 JSON 文件时出错 ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * 检查文件是否需要翻译
 * 对于 .txt 和 .json 文件: 比较源文件和目标文件的修改时间
 * 对于其他文件: 始终翻译（覆盖）
 */
async function needsTranslation(sourcePath, targetPath) {
  // 如果目标文件与源文件不同（.txt 或 .json 文件），检查修改时间
  if (targetPath !== sourcePath) {
    try {
      const sourceStats = await fs.stat(sourcePath);
      const targetStats = await fs.stat(targetPath);
      
      // 如果源文件比目标文件新，则需要翻译
      return sourceStats.mtime > targetStats.mtime;
    } catch {
      // 目标文件不存在，需要翻译
      return true;
    }
  }
  
  // 对于覆盖的文件（非 .txt、非 .json），始终翻译
  return true;
}

/**
 * 获取目标文件路径
 * 对于 .txt 和 .json 文件: 创建 .zh.{ext} 版本（保留原文件）
 * 对于其他文件: 覆盖原文件
 */
function getTargetPath(filePath) {
  const ext = path.extname(filePath);
  
  // 对于 .txt 和 .json 文件，创建 .zh.{ext} 版本以保留原文件
  if (ext === '.txt' || ext === '.json') {
    const baseName = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    return path.join(dir, `${baseName}.zh${ext}`);
  }
  
  // 对于其他文件（.md 等），覆盖原文件
  return filePath;
}

/**
 * 检查文件是否应该被忽略
 */
function shouldIgnore(filePath) {
  const relativePath = path.relative(rootDir, filePath);
  
  // 检查忽略的目录
  for (const ignoreDir of config.ignoreDirs) {
    if (relativePath.startsWith(ignoreDir + '/') || relativePath.startsWith(ignoreDir + '\\')) {
      return true;
    }
  }
  
  // 检查忽略的文件
  const fileName = path.basename(filePath);
  if (config.ignoreFiles.includes(fileName)) {
    return true;
  }
  
  // 忽略已翻译的 .txt 和 .json 文件（.zh.txt, .zh.json）
  if (fileName.includes('.zh.txt') || fileName.includes('.zh.json')) {
    return true;
  }
  
  return false;
}

/**
 * 查找所有需要翻译的文件
 */
async function findFiles(dir = rootDir) {
  const files = [];
  
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (shouldIgnore(fullPath)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (config.fileExtensions.includes(ext)) {
          files.push(fullPath);
        } else if (ext === '.json') {
          // 检查 JSON 文件是否包含可翻译的内容
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            if (content.includes('"description"')) {
              files.push(fullPath);
            }
          } catch {
            // 如果无法读取则跳过
          }
        }
      }
    }
  }
  
  await walk(dir);
  return files;
}

/**
 * 主翻译函数
 */
async function main() {
  console.log('开始翻译过程...');
  console.log(`引擎: ${config.engine}`);
  console.log(`目标语言: ${config.targetLanguage}`);
  console.log(`术语表条目数: ${Object.keys(glossary).length}`);
  console.log('注意: .txt 和 .json 文件将创建 .zh.{ext} 副本（原文件保留）。');
  console.log('      其他文件（.md 等）将被翻译内容覆盖。');
  
  const files = await findFiles();
  console.log(`找到 ${files.length} 个文件需要处理`);
  
  let translated = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const filePath of files) {
    const targetPath = getTargetPath(filePath);
    
    // 检查是否需要翻译
    if (!(await needsTranslation(filePath, targetPath))) {
      console.log(`跳过 ${filePath} (已是最新)`);
      skipped++;
      continue;
    }
    
    try {
      console.log(`正在翻译: ${filePath}`);
      
      let translatedContent;
      if (path.extname(filePath) === '.json') {
        translatedContent = await translateJsonFile(filePath);
      } else {
        translatedContent = await translateTextFile(filePath);
      }
      
      // 确保目标目录存在
      const targetDir = path.dirname(targetPath);
      await fs.mkdir(targetDir, { recursive: true });
      
      // 写入翻译后的文件
      const ext = path.extname(filePath);
      const isTxtOrJsonFile = ext === '.txt' || ext === '.json';
      await fs.writeFile(targetPath, translatedContent, 'utf-8');
      
      if (isTxtOrJsonFile) {
        console.log(`✓ 已翻译: ${targetPath} (原文件已保留)`);
      } else {
        console.log(`✓ 已翻译并覆盖: ${targetPath}`);
      }
      translated++;
      
      // 文件之间的延迟
      await new Promise(resolve => setTimeout(resolve, config.translationDelay));
    } catch (error) {
      console.error(`✗ 失败: ${filePath}`, error.message);
      failed++;
    }
  }
  
  console.log('\n翻译完成！');
  console.log(`已翻译: ${translated}`);
  console.log(`已跳过: ${skipped}`);
  console.log(`失败: ${failed}`);
}

// 如果直接调用则运行
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMainModule || process.argv[1]?.endsWith('translate.js')) {
  main().catch(console.error);
}

export { translateTextFile, translateJsonFile, applyGlossary };

