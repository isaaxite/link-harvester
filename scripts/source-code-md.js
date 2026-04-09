#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * 检查文件或目录是否存在
 */
async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 使用 tree 命令生成目录结构
 */
async function generateTreeStructure(rootDir) {
  try {
    // 只显示 index.ts 和 src 目录
    const { stdout } = await execAsync(`tree "${rootDir}" -I "node_modules|dist|build|.git|*.log" --dirsfirst`);
    return stdout;
  } catch (error) {
    console.warn('tree 命令执行失败，使用备用方案生成目录结构');
    return await generateSimpleTree(rootDir);
  }
}

/**
 * 备用的简单目录树生成器（只显示 index.ts 和 src）
 */
async function generateSimpleTree(rootDir, prefix = '', isRoot = true) {
  let result = '';
  
  if (isRoot) {
    // 只处理 index.ts 和 src 目录
    const items = [];
    
    // 检查 index.ts
    const indexTsPath = path.join(rootDir, 'index.ts');
    if (await exists(indexTsPath)) {
      items.push({ name: 'index.ts', path: indexTsPath, isDirectory: false });
    }
    
    // 检查 src 目录
    const srcPath = path.join(rootDir, 'src');
    if (await exists(srcPath)) {
      const stat = await fs.stat(srcPath);
      items.push({ name: 'src/', path: srcPath, isDirectory: true });
    }
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const isLast = i === items.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      
      result += prefix + connector + item.name + '\n';
      
      if (item.isDirectory) {
        result += await generateSimpleTree(item.path, newPrefix, false);
      }
    }
  } else {
    // 递归处理 src 目录下的内容
    const items = await fs.readdir(rootDir);
    const excludeDirs = ['node_modules', 'dist', 'build', '.git'];
    const filteredItems = items.filter(item => !excludeDirs.includes(item));
    
    const entries = [];
    for (const item of filteredItems) {
      const itemPath = path.join(rootDir, item);
      const stat = await fs.stat(itemPath);
      entries.push({ name: item, path: itemPath, isDirectory: stat.isDirectory() });
    }
    
    // 目录优先
    entries.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
      return a.isDirectory ? -1 : 1;
    });
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      
      result += prefix + connector + entry.name + (entry.isDirectory ? '/' : '') + '\n';
      
      if (entry.isDirectory) {
        result += await generateSimpleTree(entry.path, newPrefix, false);
      }
    }
  }
  
  return result;
}

/**
 * 获取 TypeScript 文件（只从 index.ts 和 src 目录）
 */
async function getTypeScriptFiles(rootDir) {
  const files = [];
  
  // 1. 检查根目录的 index.ts
  const indexTsPath = path.join(rootDir, 'index.ts');
  if (await exists(indexTsPath)) {
    const content = await fs.readFile(indexTsPath, 'utf-8');
    files.push({
      relativePath: 'index.ts',
      content: content
    });
    console.log(`  ✓ 找到: index.ts`);
  }
  
  // 2. 检查 src 目录
  const srcDir = path.join(rootDir, 'src');
  if (await exists(srcDir)) {
    console.log(`  📁 扫描 src/ 目录...`);
    await scanDirectory(srcDir, rootDir, files);
  } else {
    console.log(`  ⚠️  src/ 目录不存在`);
  }
  
  // 按路径排序
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  
  return files;
}

/**
 * 递归扫描目录中的 TypeScript 文件
 */
async function scanDirectory(dir, baseDir, files) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  // 排除的目录
  const excludeDirs = ['node_modules', 'dist', 'build', '.git'];
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    
    if (entry.isDirectory()) {
      if (!excludeDirs.includes(entry.name)) {
        await scanDirectory(fullPath, baseDir, files);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      const content = await fs.readFile(fullPath, 'utf-8');
      files.push({
        relativePath: relativePath,
        content: content
      });
      console.log(`  ✓ 找到: ${relativePath}`);
    }
  }
}

/**
 * 生成 Markdown 文件
 */
async function generateMarkdown(treeStructure, files, outputPath) {
  let markdown = '# Project Structure\n\n';
  markdown += '## Directory Structure\n\n';
  markdown += '```bash\n';
  markdown += treeStructure;
  markdown += '```\n\n';
  markdown += '## Source Code\n\n';
  
  for (const file of files) {
    markdown += `### ${file.relativePath}\n\n`;
    markdown += '```ts\n';
    markdown += file.content;
    markdown += '\n```\n\n';
    markdown += '---\n\n';
  }
  
  await fs.writeFile(outputPath, markdown, 'utf-8');
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const rootDir = args[0] || '.'; // 默认当前目录
  const outputFile = args[1] || 'PROJECT_STRUCTURE.md'; // 默认输出文件名
  
  try {
    console.log(`📁 项目目录: ${path.resolve(rootDir)}`);
    console.log(`📄 输出文件: ${outputFile}`);
    console.log('\n🔍 正在扫描文件...\n');
    
    // 生成目录树（只显示 index.ts 和 src）
    console.log('🌲 生成目录结构...');
    const treeStructure = await generateSimpleTree(rootDir);
    
    // 获取 TypeScript 文件（只从 index.ts 和 src）
    const tsFiles = await getTypeScriptFiles(rootDir);
    
    if (tsFiles.length === 0) {
      console.log('\n⚠️  未找到任何 TypeScript 文件！');
      console.log('请确保存在:');
      console.log('  - index.ts (根目录)');
      console.log('  - src/ 目录及其中的 .ts/.tsx 文件');
      return;
    }
    
    console.log(`\n✅ 共找到 ${tsFiles.length} 个 TypeScript 文件`);
    
    // 生成 Markdown
    console.log('\n📝 正在生成 Markdown 文件...');
    await generateMarkdown(treeStructure, tsFiles, outputFile);
    
    // 统计信息
    let totalSize = 0;
    for (const file of tsFiles) {
      totalSize += file.content.length;
    }
    
    console.log(`✨ 成功！项目结构已保存到: ${outputFile}`);
    console.log(`📊 统计: ${tsFiles.length} 个文件, 总字符数: ${totalSize.toLocaleString()}`);
    
  } catch (error) {
    console.error('\n❌ 发生错误:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

// 导出函数供其他模块使用
module.exports = {
  generateTreeStructure,
  getTypeScriptFiles,
  generateMarkdown,
  scanDirectory
};
