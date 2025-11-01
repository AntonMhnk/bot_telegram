# 🔐 Настройка Webhook для Telegram Stars Payments

## Обзор

Система платежей через Telegram Stars использует два режима работы:
- **Development**: Polling (бот опрашивает Telegram API)
- **Production**: Webhook (Telegram отправляет обновления на ваш сервер)

## Переменные окружения

Добавьте в `.env` файл бота:

```env
# Основные настройки
NODE_ENV=production
TG_BOT_API_KEY=your_bot_token_here
BOT_WEBHOOK_URL=https://your-domain.com

# Безопасность webhook (рекомендуется)
WEBHOOK_SECRET_TOKEN=your_random_secret_token_here

# API сервера игры
API_BASE_URL=https://your-api-domain.com
```

## Генерация секретного токена

Создайте случайный секретный токен:

```bash
# Linux/Mac
openssl rand -hex 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Настройка Webhook

### Автоматическая настройка (при запуске бота)

Бот автоматически настроит webhook при запуске в production mode:

```javascript
// Webhook URL будет: https://your-domain.com/webhook/telegram-payment
```

### Ручная настройка (через Telegram API)

Если нужно настроить вручную:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/webhook/telegram-payment",
    "secret_token": "your_random_secret_token_here",
    "drop_pending_updates": true,
    "allowed_updates": ["pre_checkout_query", "message"]
  }'
```

### Проверка статуса webhook

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

## Безопасность

### 1. Секретный токен
Webhook проверяет заголовок `X-Telegram-Bot-Api-Secret-Token`:

```javascript
if (process.env.WEBHOOK_SECRET_TOKEN && secretToken !== process.env.WEBHOOK_SECRET_TOKEN) {
    return res.sendStatus(403);
}
```

### 2. IP-адреса Telegram
Рекомендуется также проверять IP-адреса Telegram серверов:
- `149.154.160.0/20`
- `91.108.4.0/22`

### 3. HTTPS обязателен
Telegram требует HTTPS для webhook в production.

## Поток платежа

```
1. Клиент → WebApp.openInvoice()
2. Telegram → Bot Webhook: pre_checkout_query
3. Bot → Telegram: answerPreCheckoutQuery(true)
4. Пользователь подтверждает оплату
5. Telegram → Bot Webhook: successful_payment
6. Bot → Game API: POST /api/game/complete-payment
7. Game API → Database: регистрация платежа
8. Bot → Telegram: уведомление пользователю
```

## Типы платежей

Система поддерживает следующие типы:

- `galaxyCapture` - захват галактики
- `stardust` - покупка звездной пыли
- `darkMatter` - покупка темной материи
- `galaxyUpgrade` - улучшение галактики

## Payload структура

```json
{
  "type": "galaxyCapture",
  "price": 100,
  "galaxySeed": 12345,
  "galaxyName": "Andromeda",
  "timestamp": 1234567890,
  "webhookData": {
    "userId": 123456789,
    "username": "user123",
    "chatType": "sender"
  }
}
```

## Отладка

### Development mode (polling)
```bash
NODE_ENV=development npm start
```

### Production mode (webhook)
```bash
NODE_ENV=production npm start
```

### Логи webhook
Все webhook запросы логируются:
```
🔐 Webhook received from IP: xxx.xxx.xxx.xxx
🔐 Pre-checkout query: {...}
✅ Pre-checkout approved
🎉 Successful payment received: {...}
✅ Payment completed via API
```

## Troubleshooting

### Webhook не получает обновления
1. Проверьте `getWebhookInfo` - должен быть установлен правильный URL
2. Проверьте HTTPS сертификат
3. Проверьте firewall и доступность сервера
4. Проверьте логи сервера

### Двойная обработка платежей
- Убедитесь что polling отключен в production (`polling: !isProduction`)
- Проверьте что нет дублирующих обработчиков

### Ошибка 403 Forbidden
- Проверьте `WEBHOOK_SECRET_TOKEN` в `.env`
- Убедитесь что токен совпадает с установленным в webhook

### Платеж не завершается
- Проверьте `API_BASE_URL` в `.env` бота
- Проверьте доступность `/api/game/complete-payment` endpoint
- Проверьте логи game API сервера

## Тестирование

### 1. Тест pre-checkout
```bash
# Отправьте тестовый запрос
curl -X POST "https://your-domain.com/webhook/telegram-payment" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: your_token" \
  -d '{
    "pre_checkout_query": {
      "id": "test123",
      "from": {"id": 123456789},
      "currency": "XTR",
      "total_amount": 100,
      "invoice_payload": "{\"type\":\"stardust\",\"price\":100,\"amount\":1000}"
    }
  }'
```

### 2. Тест successful_payment
```bash
curl -X POST "https://your-domain.com/webhook/telegram-payment" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: your_token" \
  -d '{
    "message": {
      "from": {"id": 123456789, "username": "testuser"},
      "chat": {"id": 123456789},
      "successful_payment": {
        "currency": "XTR",
        "total_amount": 100,
        "invoice_payload": "{\"type\":\"stardust\",\"price\":100,\"amount\":1000}",
        "telegram_payment_charge_id": "test_charge_123"
      }
    }
  }'
```

## Мониторинг

Рекомендуется настроить мониторинг:
- Логирование всех webhook запросов
- Алерты при ошибках обработки платежей
- Метрики успешных/неуспешных платежей
- Время обработки платежей

## Дополнительные ресурсы

- [Telegram Bot Payments API](https://core.telegram.org/bots/payments)
- [Telegram Stars Documentation](https://core.telegram.org/bots/payments#stars)
- [Webhook Best Practices](https://core.telegram.org/bots/webhooks)

