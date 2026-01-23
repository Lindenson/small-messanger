#!/usr/bin/env bash
set -euo pipefail

BASE_URL="http://localhost:3333"

echo "=============================="
echo "1️⃣  Проверка batch /contacts"
echo "=============================="
curl -s -X POST "$BASE_URL/contacts" \
  -H "Content-Type: application/json" \
  -d '{
        "ids": [
          "b3745a0d-7f03-43e0-9004-1cce411e4cd0",
          "07cf3a98-7773-4030-a9e8-155b9b76e902"
        ]
      }' | jq

echo
echo "=============================="
echo "2️⃣  Проверка lookup /contacts/lookup"
echo "=============================="
curl -s -X POST "$BASE_URL/contacts/lookup" \
  -H "Content-Type: application/json" \
  -d '{"email":"mama@i.ua"}' | jq

echo
echo "=============================="
echo "3️⃣  Отправка сообщений /messages"
echo "=============================="
curl -s -X POST "$BASE_URL/messages" \
  -H "Content-Type: application/json" \
  -d '{
        "from": "b3745a0d-7f03-43e0-9004-1cce411e4cd0",
        "to": "07cf3a98-7773-4030-a9e8-155b9b76e902",
        "text": "Привет!"
      }' | jq

curl -s -X POST "$BASE_URL/messages" \
  -H "Content-Type: application/json" \
  -d '{
        "from": "07cf3a98-7773-4030-a9e8-155b9b76e902",
        "to": "b3745a0d-7f03-43e0-9004-1cce411e4cd0",
        "text": "Привет, как дела?"
      }' | jq

echo
echo "=============================="
echo "4️⃣  Получение конкретного чата /chat/:clientA/:clientB"
echo "=============================="
curl -s -X GET "$BASE_URL/chat/b3745a0d-7f03-43e0-9004-1cce411e4cd0/07cf3a98-7773-4030-a9e8-155b9b76e902" | jq

echo
echo "=============================="
echo "5️⃣  Получение всех собеседников /chats/:clientId"
echo "=============================="
curl -s -X GET "$BASE_URL/chats/b3745a0d-7f03-43e0-9004-1cce411e4cd0" | jq

echo
echo "=============================="
echo "6️⃣  Удаление чата /chat/:clientA/:clientB"
echo "=============================="
curl -s -X DELETE "$BASE_URL/chat/b3745a0d-7f03-43e0-9004-1cce411e4cd0/07cf3a98-7773-4030-a9e8-155b9b76e902"

echo
echo "✅  Все тесты выполнены!"

# To check websocket:
# wscat -c "ws://localhost:3333?clientId=b3745a0d-7f03-43e0-9004-1cce411e4cd0" \
#      -H "Cookie: ory_kratos_session=<ORY_SESSION_COOKIE>"
#
# and you should see:
#< {"type":"message","payload":{"id":"3570598d-235d-4a3f-995f-af72df1f762b","chatId":"07cf3a98-7773-4030-a9e8-155b9b76e902_b3745a0d-7f03-43e0-9004-1cce411e4cd0","from":"b3745a0d-7f03-43e0-9004-1cce411e4cd0","to":"07cf3a98-7773-4030-a9e8-155b9b76e902","text":"Привет!","createdAt":"2026-01-23T13:15:33.378Z"}}
#< {"type":"message","payload":{"id":"08877706-ff4f-4269-a64c-05df5e1690d2","chatId":"07cf3a98-7773-4030-a9e8-155b9b76e902_b3745a0d-7f03-43e0-9004-1cce411e4cd0","from":"07cf3a98-7773-4030-a9e8-155b9b76e902","to":"b3745a0d-7f03-43e0-9004-1cce411e4cd0","text":"Привет, как дела?","createdAt":"2026-01-23T13:15:33.382Z"}}
#< {"type":"chat_deleted","payload":{"chatId":"07cf3a98-7773-4030-a9e8-155b9b76e902_b3745a0d-7f03-43e0-9004-1cce411e4cd0"}}

