# 对外 API 使用文档

用 API Key 免登录拉取指定邮箱的邮件，适合脚本自动获取验证码、邀请链接，集成到其他系统。

## 1. 启用 / 获取 API Key

登录后台 → **系统设置** → **对外 API** → 点「生成 API Key」。

- 生成后会显示完整 Key 和调用示例，点「复制」即可。
- 「重新生成」会让旧 Key **立即失效**；「停用」会关闭整个对外 API。
- Key 是明文存放在你自己的 D1 里，只有后台登录后能看到。

## 2. 接口

### 2.1 获取邮件列表

```
GET /api/external/emails
```

**鉴权**（二选一）：

- 请求头：`X-API-Key: <你的Key>`
- 或查询参数：`?key=<你的Key>`

**参数**：

| 参数 | 必填 | 说明 |
|------|:----:|------|
| `email` | ✅ | 要查询的邮箱地址（必须是后台已添加的账号） |
| `folder` | ❌ | `inbox`(默认) / `junkemail` / `deleteditems` / `all`（收件箱+垃圾箱合并） |
| `top` | ❌ | 返回条数，默认 10，最大 50 |
| `keyword` | ❌ | 搜索关键词（部分账号可能不稳定，失败时去掉 keyword 后本地过滤） |

**说明**：列表只返回 `bodyPreview`（预览，通常会被截断）。需要完整正文 / 邀请链接时，先拿 `id`，再调详情接口。

### 2.2 获取邮件详情（完整正文）

```
GET /api/external/emails/detail
```

**鉴权**（与列表相同，二选一）：

- 请求头：`X-API-Key: <你的Key>`
- 或查询参数：`?key=<你的Key>`

**参数**：

| 参数 | 必填 | 说明 |
|------|:----:|------|
| `email` | ✅ | 邮箱地址（必须是后台已添加的账号） |
| `id` | ✅ | 列表接口返回的邮件 `id`（也可用 `messageId`） |

**返回重点字段**：

| 字段 | 说明 |
|------|------|
| `body` | 完整正文（HTML 或文本，含邀请链接 / 验证码） |
| `bodyType` | `html` 或 `text` |
| `bodyPreview` | 预览截断文本 |
| `subject` / `from` / `receivedDateTime` | 邮件元数据 |

## 3. 调用示例

### 3.1 列表（查询参数方式）

```bash
curl "https://你的域名/api/external/emails?email=abc@outlook.com&key=你的Key&folder=all&top=20"
```

### 3.2 详情（查询参数方式）

```bash
curl "https://你的域名/api/external/emails/detail?email=abc@outlook.com&id=AAQ...&key=你的Key"
```

### 3.3 请求头方式（更安全，Key 不出现在 URL / 日志里）

```bash
# 列表
curl "https://你的域名/api/external/emails?email=abc@outlook.com&folder=all&top=20" \
  -H "X-API-Key: 你的Key"

# 详情
curl "https://你的域名/api/external/emails/detail?email=abc@outlook.com&id=AAQ..." \
  -H "X-API-Key: 你的Key"
```

### 3.4 Python：列表找信 + 详情取完整链接

```python
import re
import requests

BASE = "https://你的域名"
KEY = "你的Key"
EMAIL = "abc@outlook.com"

# 1) 列表
listing = requests.get(
    f"{BASE}/api/external/emails",
    params={"email": EMAIL, "folder": "all", "top": 20},
    headers={"X-API-Key": KEY},
    timeout=30,
).json()

invite = None
for mail in listing["data"]["items"]:
    subject = mail.get("subject") or ""
    if "[AO3] Invitation" in subject or ("AO3" in subject and "Invitation" in subject):
        invite = mail
        break

if not invite:
    raise SystemExit("未找到邀请信")

# 2) 详情（完整 body）
detail = requests.get(
    f"{BASE}/api/external/emails/detail",
    params={"email": EMAIL, "id": invite["id"]},
    headers={"X-API-Key": KEY},
    timeout=30,
).json()["data"]

body = detail.get("body") or ""
links = re.findall(r"https?://(?:www\.)?archiveofourown\.org/[^\s\"'<>]+", body, flags=re.I)
print("subject:", detail.get("subject"))
print("links:", links)
```

### 3.5 Python：从预览提取 6 位验证码（仅列表）

```python
import re, requests

resp = requests.get(
    "https://你的域名/api/external/emails",
    params={"email": "abc@outlook.com", "folder": "all", "top": 5},
    headers={"X-API-Key": "你的Key"},
)
data = resp.json()
for mail in data["data"]["items"]:
    m = re.search(r"\b(\d{6})\b", mail["subject"] + " " + mail["bodyPreview"])
    if m:
        print("验证码:", m.group(1))
        break
```

## 4. 返回格式

### 列表成功（HTTP 200）

```json
{
  "success": true,
  "data": {
    "email": "abc@outlook.com",
    "folder": "all",
    "count": 2,
    "items": [
      {
        "id": "AAQ...",
        "subject": "[AO3] Invitation",
        "from": { "name": "Archive of Our Own", "address": "do-not-reply@archiveofourown.org" },
        "receivedDateTime": "2026-01-04T10:28:39Z",
        "bodyPreview": "You've been invited to join the Archive of Our Own!...",
        "isRead": false
      }
    ]
  }
}
```

### 详情成功（HTTP 200）

```json
{
  "success": true,
  "data": {
    "email": "abc@outlook.com",
    "id": "AAQ...",
    "subject": "[AO3] Invitation",
    "from": { "name": "Archive of Our Own", "address": "do-not-reply@archiveofourown.org" },
    "receivedDateTime": "2026-01-04T10:28:39Z",
    "bodyPreview": "You've been invited...",
    "body": "<html>...完整正文，含 https://archiveofourown.org/... ...</html>",
    "bodyType": "html",
    "isRead": false,
    "hasAttachments": false
  }
}
```

### 失败

```json
{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "API Key 无效" } }
```

## 5. 错误码

| HTTP | code | 含义 |
|:----:|------|------|
| 403 | `API_DISABLED` | 还没生成 API Key（去系统设置生成） |
| 401 | `UNAUTHORIZED` | Key 缺失或不正确 |
| 400 | `BAD_REQUEST` | 缺少 `email` / `id` 等参数 |
| 404 | `NOT_FOUND` | 邮箱不在后台账号列表，或邮件 id 不存在 |
| 400 | `DISABLED` | 该账号已被停用 |
| 502 | `TOKEN_FAILED` | 该账号 Token 失效，需在后台「重新授权」 |
| 502 | `GRAPH_ERROR` | 调用 Microsoft Graph 失败 |

## 6. 安全建议

- Key 等同于这些邮箱的读取权限，**不要写进前端代码或公开仓库**；优先用 `X-API-Key` 请求头而非 URL 参数（URL 会进日志/历史记录）。
- 怀疑泄露时，到系统设置点「重新生成」即可让旧 Key 立即作废。
- 接口只能读取**后台已添加**的邮箱，无法访问任意邮箱。
- 详情接口会返回完整邮件正文，请仅在可信后端 / 本地脚本中使用。
