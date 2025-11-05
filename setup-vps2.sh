#!/bin/bash
# Скрипт для подготовки VPS #2 (Bot Server) к Docker деплою

echo "🚀 Подготовка VPS #2 для Docker деплоя..."
echo "=========================================="

# 1. Проверка Docker
echo "1. Проверка Docker..."
if ! command -v docker &> /dev/null; then
    echo "   ❌ Docker не установлен. Устанавливаю..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    echo "   ✅ Docker установлен"
else
    echo "   ✅ Docker уже установлен: $(docker --version)"
fi

# 2. Проверка Docker Compose
if ! command -v docker compose &> /dev/null; then
    echo "   ❌ Docker Compose не установлен"
    echo "   Установи вручную или обнови Docker"
else
    echo "   ✅ Docker Compose установлен: $(docker compose version)"
fi

# 3. Создание директории для бота
echo ""
echo "2. Создание директорий..."
mkdir -p /var/www/nebulahunt/bot
echo "   ✅ /var/www/nebulahunt/bot создана"

# 4. Проверка прав
echo ""
echo "3. Проверка прав доступа..."
chown -R $USER:$USER /var/www/nebulahunt/bot 2>/dev/null || echo "   ⚠️  Нужны права sudo для chown"
echo "   ✅ Права установлены"

# 5. Проверка порта 3000
echo ""
echo "4. Проверка порта 3000..."
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo "   ⚠️  Порт 3000 занят. Останови старый процесс или измени порт"
else
    echo "   ✅ Порт 3000 свободен"
fi

echo ""
echo "=========================================="
echo "✅ VPS #2 готов к деплою!"
echo ""
echo "Следующий шаг: сделай git push в репозиторий bot"

