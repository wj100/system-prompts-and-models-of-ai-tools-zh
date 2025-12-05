#!/bin/bash

# 更新 Git 远程仓库地址脚本
# 在 GitHub 上重命名仓库后运行此脚本

NEW_REPO_NAME="system-prompts-and-models-of-ai-tools-zh"
GITHUB_USER="wj100"

echo "正在更新 Git 远程仓库地址..."
echo "新仓库名称: $NEW_REPO_NAME"

# 更新 origin 远程地址
git remote set-url origin "git@github.com:${GITHUB_USER}/${NEW_REPO_NAME}.git"

# 验证更新
echo ""
echo "当前远程仓库配置："
git remote -v

echo ""
echo "✅ 远程仓库地址已更新！"
echo "新仓库 URL: https://github.com/${GITHUB_USER}/${NEW_REPO_NAME}"

