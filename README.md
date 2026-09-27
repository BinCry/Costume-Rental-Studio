<div align="center">

# Costume Rental Studio

[![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

**Monorepo cho hệ thống quản lý studio cho thuê trang phục: tìm mẫu và lịch trống → gửi yêu cầu → nhân viên xác nhận → giao trang phục → nhận trả và quyết toán**

[Features](#-features) •
[Tech Stack](#-tech-stack) •
[Quick Start](#-quick-start) •
[API](#-api-endpoints) •
[Documentation](#-documentation)

</div>

---

## 📋 Table of Contents

- [About the Project](#-about-the-project)
- [Current Status](#-current-status)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture Overview](#-architecture-overview)
- [Quick Start](#-quick-start)
- [Available Commands](#-available-commands)
- [Environment Variables](#-environment-variables)
- [API Endpoints](#-api-endpoints)
- [Project Structure](#-project-structure)
- [Database Design](#-database-design)
- [Business Rules](#-business-rules)
- [Development](#-development)
- [Testing](#-testing)
- [Security Overview](#-security-overview)
- [Documentation](#-documentation)

---

## 👗 About the Project

**Costume Rental Studio** là hệ thống web hỗ trợ chuỗi studio quản lý toàn bộ vòng đời cho thuê trang phục theo từng bộ vật lý và từng chi nhánh.

Hệ thống được thiết kế để giải quyết các nhu cầu chính:

- Khách xem danh mục, kiểm tra khả dụng và gửi yêu cầu thuê online.
- Nhân viên tạo đơn tại quầy, duyệt đơn online, chuẩn bị và giao trang phục.
- Theo dõi từng bộ bằng mã hoặc barcode riêng trong suốt vòng đời khai thác.
- Nhận trả, kiểm tra tình trạng, tính phụ phí và hoàn phần cọc còn lại.
- Quản lý giá thuê theo ngày, chính sách, chi nhánh và thời điểm hiệu lực.
- Theo dõi khách hàng, lịch sử thuê, tương tác và khiếu nại.
- Tổng hợp báo cáo doanh thu, cọc, quá hạn, hư hỏng và mức sử dụng.

### Core User Roles

| Role | Responsibility |
|------|----------------|
| **Customer** | Xem trang phục, gửi yêu cầu thuê, theo dõi hoặc hủy đơn của mình và quản lý hồ sơ cá nhân |
| **Staff** | Xử lý đơn, giao nhận, thu tiền, kiểm kê và chăm sóc khách theo quyền được cấp tại chi nhánh |
| **Admin** | Quản trị chi nhánh, nhân viên, quyền, danh mục, giá, chính sách và báo cáo toàn chuỗi |

### Rental Flow

```text
Browse Costumes
  -> Select Branch + Rental Period
  -> Check Availability + Estimated Price
  -> Submit Rental Request
  -> Staff Review and Confirmation
  -> Assign Physical Costume Units
  -> Collect Rental Fee + Deposit at Handover
  -> Active Rental
  -> Return and Condition Inspection
  -> Additional Charges / Deposit Refund
  -> Completed
```

---

## 🚧 Current Status

Repository đang ở giai đoạn xây nền kỹ thuật.

| Area | Status | Notes |
|------|--------|-------|
| pnpm monorepo | ✅ Implemented | Quản lý `apps/api` và `apps/web` trong một workspace |
| Express HTTP foundation | ✅ Implemented | Security middleware, CORS, rate limit, logging, error handling và graceful shutdown |
| API response contract | ✅ Implemented | Success/error envelope, `AppError`, timestamp và request ID |
| API integration tests | ✅ Implemented | Supertest + Vitest cho health, errors, rate limit và security headers |
| Code quality tooling | ✅ Implemented | ESLint, Prettier, lint-staged và Husky hooks dùng chung tại root |
| React frontend foundation | 🟡 In progress | React, Vite, TypeScript và Tailwind CSS đã được khởi tạo |
| PostgreSQL + Prisma | ⏳ Planned | Chưa có schema, migration hoặc database runtime |
| Authentication + authorization | ⏳ Planned | Google Login, session và quyền theo chi nhánh chưa triển khai |
| Rental business modules | ⏳ Planned | Danh mục, tồn kho, đơn thuê, giao trả, thanh toán, CRM và báo cáo |

> Các tính năng nghiệp vụ bên dưới mô tả phạm vi đã phân tích. Chúng không đồng nghĩa tất cả đã có trong source code hiện tại.

---

## ✨ Features

### 🔐 Authentication & Permissions

- Đăng nhập bằng Google và tạo phiên nội bộ.
- Ba nhóm tài khoản chính: Customer, Staff và Admin.
- Staff nhận quyền thao tác bằng checkbox theo chi nhánh.
- Hỗ trợ quyền kế thừa từ bộ quyền và ngoại lệ riêng theo nhân viên.
- Ghi audit khi thay đổi quyền hoặc dữ liệu nhạy cảm.

### 👘 Catalog & Costume Inventory

- Quản lý mẫu, size, màu, ảnh, mô tả, phụ kiện và phân loại.
- Mỗi bộ vật lý có `unit_code` hoặc barcode riêng.
- Theo dõi chi nhánh hiện tại và trạng thái sẵn sàng, đang thuê, vệ sinh, sửa chữa hoặc ngừng khai thác.
- Quản lý nhập kho, kiểm kê, điều chuyển và lịch sử vòng đời.

### 📅 Availability & Rental Orders

- Tìm trang phục còn trống theo chi nhánh và khoảng thời gian.
- Tính báo giá dự kiến theo đơn giá/ngày và phiên bản chính sách.
- Khách gửi yêu cầu online hoặc nhân viên lập đơn tại quầy.
- Nhân viên duyệt, xác nhận và gán bộ vật lý cụ thể.
- Ngăn hai đơn đã xác nhận sử dụng cùng một bộ trong thời gian chồng lấn.

### 🤝 Handover & Return

- Chuẩn bị trang phục và phụ kiện trước ngày nhận.
- Lập biên bản giao, ghi tình trạng và thời gian giao thực tế.
- Tra cứu nhanh khách đang giữ từng bộ trang phục.
- Quét hoặc chọn bộ khi nhận trả, kiểm tra thiếu hoặc hư hỏng.
- Chuyển bộ trả về sang vệ sinh hoặc sửa chữa trước khi cho thuê lại.

### 💵 Payments & Deposits

- Tách riêng tiền thuê, phụ phí, tiền cọc, cấn trừ và hoàn tiền.
- Hỗ trợ tiền mặt và chuyển khoản thủ công trong phạm vi hiện tại.
- Thu tiền thuê và cọc khi giao trang phục.
- Chỉ hoàn phần cọc còn lại sau khi kiểm tra tình trạng đồ trả.
- Đối soát giao dịch và không tính cọc chưa quyết toán là doanh thu.

### 👥 CRM & Reporting

- Hồ sơ khách hàng và lịch sử thuê.
- Nhật ký tương tác, ghi chú và phiếu hỗ trợ hoặc khiếu nại.
- Nhãn, phân khúc, consent marketing và chương trình chăm sóc mở rộng.
- Báo cáo đơn, doanh thu, cọc đang giữ, quá hạn, hư hỏng và khách quay lại.

### 🛡️ Platform Foundation

- Helmet security headers và giới hạn JSON body `1 MB`.
- CORS theo origin frontend được cấu hình.
- Rate limiting cho `/api/v1`; health check không bị giới hạn.
- Pino structured logging và che dữ liệu nhạy cảm.
- Request ID dạng UUID trong header `X-Request-Id`.
- Standardized success/error response và global error handling.

---

## 🛠 Tech Stack

<table>
<tr>
<td valign="top">

### Backend

| Component | Technology |
|-----------|------------|
| **Runtime** | Node.js 22 |
| **Language** | TypeScript |
| **Framework** | Express 5 |
| **Validation** | Zod |
| **Logging** | Pino + pino-http |
| **Security** | Helmet, CORS, express-rate-limit |
| **Testing** | Vitest + Supertest |
| **Build** | tsup |

</td>
<td valign="top">

### Frontend & Workspace

| Component | Technology |
|-----------|------------|
| **UI** | React 19 |
| **Build Tool** | Vite 8 |
| **Styling** | Tailwind CSS 4 |
| **Linting** | ESLint |
| **Package Manager** | pnpm 11 |
| **Repository** | pnpm workspace monorepo |
| **Database** | PostgreSQL + Prisma *(planned)* |

</td>
</tr>
</table>

---

## 🏗 Architecture Overview

### Application Layers

```text
Users
  -> React Web Application (Vite)
  -> REST API (Express)
  -> Logging / Security / CORS / Rate Limit / Validation
  -> Business Modules (planned modular monolith)
  -> PostgreSQL via Prisma (planned)
  -> Google Identity / Notification / Payment adapters (planned)
```

### Backend Foundation

| Area | Responsibility |
|------|----------------|
| `config` | Kiểm tra biến môi trường và cấu hình logger |
| `common/errors` | Lỗi ứng dụng có HTTP status, error code và details |
| `common/http` | Success và error response contract dùng chung |
| `common/middleware` | 404 và global error handling |
| `app.ts` | Khởi tạo Express, middleware và routes |
| `server.ts` | Mở cổng và graceful shutdown |

### Planned Business Modules

| Module | Responsibility |
|--------|----------------|
| `auth` | Google Login, session và tài khoản |
| `branches` | Chi nhánh, giờ hoạt động và cấu hình nhận trả |
| `staff` | Nhân viên, phân công chi nhánh và quyền |
| `catalog` | Mẫu trang phục, biến thể, ảnh và phân loại |
| `inventory` | Bộ vật lý, barcode, tình trạng và điều chuyển |
| `rentals` | Báo giá, đơn thuê, xác nhận, giao và nhận trả |
| `payments` | Khoản phải thu, thanh toán, cọc và hoàn tiền |
| `crm` | Hồ sơ khách, tương tác và hỗ trợ |
| `reports` | KPI vận hành và tài chính |

---

## 🚀 Quick Start

### Prerequisites

- Node.js `>=22.12.0`
- pnpm `11.1.2`
- PowerShell hoặc terminal tương thích

PostgreSQL và Docker chưa bắt buộc ở giai đoạn HTTP/frontend foundation hiện tại.

### Installation

```powershell
# Clone repository
git clone <your-repository-url>
Set-Location Costume-Rental-Studio

# Install all workspace dependencies
pnpm install

# Create local backend environment file
Copy-Item apps/api/.env.example apps/api/.env
```

Vite mặc định chạy frontend tại `http://localhost:5173`. Vì vậy, khi chạy cả frontend và backend, đặt biến sau trong `apps/api/.env`:

```dotenv
WEB_URL=http://localhost:5173
```

Nếu frontend gọi API qua biến môi trường, tạo `apps/web/.env`:

```dotenv
VITE_API_URL=http://localhost:4000
```

### Run Locally

```powershell
# Run API and web app in parallel
pnpm dev
```

Hoặc chạy từng ứng dụng:

```powershell
# Terminal 1: Express API
pnpm dev:api

# Terminal 2: React frontend
pnpm --filter @costume/web dev
```

### Verify Installation

```text
Frontend: http://localhost:5173
API:      http://localhost:4000
Health:   http://localhost:4000/health
```

PowerShell health check:

```powershell
Invoke-RestMethod http://localhost:4000/health
```

---

## 📜 Available Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Chạy song song các workspace có script `dev` |
| `pnpm dev:api` | Chạy Express API với watch mode |
| `pnpm --filter @costume/web dev` | Chạy React frontend bằng Vite |
| `pnpm build` | Build toàn bộ workspace |
| `pnpm build:api` | Build riêng API vào `apps/api/dist` |
| `pnpm lint` | Chạy ESLint cho root, API và Web |
| `pnpm lint:fix` | Tự sửa các lỗi ESLint có thể sửa an toàn |
| `pnpm format` | Format code/config bằng Prettier |
| `pnpm format:check` | Kiểm tra format mà không sửa file |
| `pnpm test` | Chạy test của các workspace có script `test` |
| `pnpm test:api` | Chạy Vitest cho API |
| `pnpm typecheck` | Typecheck các workspace có script `typecheck` |
| `pnpm --filter @costume/web lint` | Chạy ESLint cho frontend |
| `pnpm --filter @costume/api start` | Chạy production build của API |

---

## 🔧 Environment Variables

### Backend — `apps/api/.env`

| Variable | Example | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Môi trường runtime: `development`, `test` hoặc `production` |
| `PORT` | `4000` | Cổng HTTP của Express API |
| `WEB_URL` | `http://localhost:5173` | Frontend origin được phép gọi API qua CORS |
| `LOG_LEVEL` | `info` | Mức log của Pino |

Backend dừng startup ngay nếu cấu hình môi trường không hợp lệ.

### Frontend — `apps/web/.env`

| Variable | Example | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:4000` | Base URL để frontend gọi backend |

Chỉ biến có prefix `VITE_` mới được Vite đưa vào mã frontend. Không lưu secret trong các biến này.

---

## 📡 API Endpoints

### Current Endpoint

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/health` | Kiểm tra HTTP process đang hoạt động | Public |

### Success Response

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "costume-api"
  },
  "message": "API is healthy"
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "password": "Password must contain at least 6 characters"
    }
  },
  "statusCode": 400,
  "timestamp": "2026-04-08T00:00:00.000Z",
  "path": "/api/example",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Mỗi response có header `X-Request-Id`. Chi tiết contract nằm trong [`docs/api-response-contract.md`](docs/api-response-contract.md).

### Planned API Groups

- `/api/v1/auth` — đăng nhập, session và tài khoản.
- `/api/v1/costumes` — danh mục và tìm kiếm trang phục.
- `/api/v1/availability` — lịch trống và báo giá dự kiến.
- `/api/v1/rentals` — đơn thuê, xác nhận, giao và nhận trả.
- `/api/v1/payments` — thu tiền, cọc, cấn trừ và hoàn tiền.
- `/api/v1/customers` — hồ sơ khách và lịch sử thuê.
- `/api/v1/admin` — quản trị chi nhánh, nhân viên, quyền và báo cáo.

---

## 📁 Project Structure

```text
Costume-Rental-Studio/
├── apps/
│   ├── api/                       # Express + TypeScript backend
│   │   ├── src/
│   │   │   ├── common/
│   │   │   │   ├── errors/       # AppError
│   │   │   │   ├── http/         # Response contracts
│   │   │   │   └── middleware/   # 404 and global error handler
│   │   │   ├── config/           # Environment and logger
│   │   │   ├── app.ts            # Express application
│   │   │   └── server.ts         # HTTP server entry point
│   │   ├── tests/                 # API integration tests
│   │   └── .env.example
│   └── web/                       # React + Vite frontend
│       ├── public/
│       └── src/
├── packages/                      # Future shared workspace packages
├── docs/
│   ├── api-response-contract.md
│   ├── journals/
│   └── Phân tích nghiệp vụ và thiết kế hệ thống studio cho thuê trang phục.md
├── package.json                   # Root workspace scripts
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

---

## 🗄 Database Design

PostgreSQL + Prisma là hướng triển khai tiếp theo, hiện chưa được thêm vào source code.

Thiết kế dữ liệu dự kiến được chia theo các nhóm:

| Group | Main Data |
|-------|-----------|
| **Identity & Permissions** | Tài khoản, danh tính Google, phiên, vai trò, quyền và phạm vi chi nhánh |
| **Branches & Staff** | Chi nhánh, giờ hoạt động, nhân viên và phân công |
| **Catalog & Inventory** | Mẫu, biến thể, bộ vật lý, barcode, tình trạng và điều chuyển |
| **Pricing & Policies** | Giá/ngày, tiền cọc, ưu đãi, phí và phiên bản chính sách |
| **Rentals** | Báo giá, đơn thuê, dòng thuê, gán bộ, giao nhận và sự cố |
| **Payments** | Khoản phải thu, thanh toán, cọc, cấn trừ, hoàn tiền và đối soát |
| **CRM** | Hồ sơ khách, tương tác, consent, case và chiến dịch |
| **Audit & Notifications** | Audit log, thông báo và outbox events |

Database phải bảo vệ tính nhất quán khi nhiều người cùng xác nhận đơn, đặc biệt không cho một bộ vật lý bị đặt trùng khoảng thời gian.

---

## 📐 Business Rules

### Rental Confirmation

- Đơn online bắt đầu ở trạng thái chờ nhân viên xác nhận.
- Đơn chờ xác nhận chưa khóa bộ vật lý.
- Khi xác nhận, hệ thống kiểm tra lại báo giá và khả dụng trong một transaction.
- Không xác nhận một phần nếu chưa có sự đồng ý của khách.
- Mỗi dòng đơn lưu snapshot giá và phiên bản chính sách đã áp dụng.

### Costume Unit Lifecycle

- Mỗi bộ vật lý có mã hoặc barcode duy nhất.
- Chỉ bộ sẵn sàng, không trùng lịch và không bị khóa bảo trì mới được cho thuê.
- Bộ trả về phải qua kiểm tra và có thể chuyển sang vệ sinh hoặc sửa chữa.
- Điều chuyển chi nhánh không được phá vỡ lịch thuê đã xác nhận.

### Handover, Payment & Deposit

- Khách nhận và trả tại cùng một chi nhánh trong phạm vi hiện tại.
- Tiền thuê và tiền cọc được thu khi giao trang phục.
- Phương thức hiện tại là tiền mặt hoặc chuyển khoản thủ công đã đối soát.
- Cọc được theo dõi riêng và không được tính ngay là doanh thu.
- Chỉ hoàn cọc sau khi kiểm tra tình trạng, tính phí và cấn trừ được duyệt.

### Pricing & Policy

- Giá thuê tính theo ngày nhưng cách tính 24 giờ hay ngày lịch phải lấy từ chính sách.
- Giá, mức cọc, phí trễ, phí hư hỏng và thời hạn không được hardcode.
- Chính sách có phiên bản để đơn cũ giữ đúng giá và quy tắc đã chốt.

---

## 💻 Development

### Suggested Workflow

```powershell
# Start development servers
pnpm dev

# Validate backend types and tests
pnpm typecheck
pnpm test:api

# Check frontend lint rules
pnpm --filter @costume/web lint

# Create production builds
pnpm build
```

### Local Notes

- `apps/api` và `apps/web` là hai workspace độc lập nhưng dùng chung lockfile.
- Chỉ cài dependency từ root để pnpm quản lý workspace nhất quán.
- Không commit `.env`, credential hoặc secret.
- Không tạo module nghiệp vụ rỗng trước khi bắt đầu triển khai module đó.
- API business mới nên dùng `sendSuccess`, `AppError` và error contract hiện có.

### Code Quality Hooks

- `pre-commit`: lint-staged chạy ESLint rồi Prettier chỉ trên các file được stage.
- `pre-push`: chạy typecheck cho API/Web và toàn bộ API tests.
- API, frontend và tooling ESLint dùng thống nhất TypeScript 6.0.3.

---

## 🧪 Testing

### Test Stack

- Vitest
- Supertest
- TypeScript strict mode
- Production build validation bằng tsup

### Useful Commands

```powershell
pnpm test:api
pnpm --filter @costume/api test:watch
pnpm typecheck
pnpm build:api
```

### Current Test Focus

- Health endpoint và security headers.
- CORS theo frontend origin.
- Route không tồn tại.
- Rate limiting.
- JSON sai cú pháp và body vượt giới hạn.
- Standardized error response.
- `AppError.details` và lỗi 500 an toàn.
- Request ID correlation giữa header và body.

---

## 🔒 Security Overview

### Implemented

- Helmet security headers.
- CORS giới hạn theo `WEB_URL` và hỗ trợ credentials.
- Rate limiting cho `/api/v1`.
- JSON body limit `1 MB`.
- Zod validation cho cấu hình môi trường.
- Pino redaction cho authorization, cookie, `Set-Cookie` và error body.
- Error response không lộ stack trace hoặc thông báo lỗi nội bộ.
- UUID request ID hỗ trợ đối chiếu response với log.

### Planned

- Google Identity Services / OpenID Connect.
- Session security và CSRF protection phù hợp với cơ chế auth được chọn.
- Quyền theo thao tác và phạm vi `OWN`, `BRANCH`, `ALL`.
- Audit log cho quyền, giá, thanh toán và trạng thái đơn.
- Validation cho toàn bộ request DTO.
- Database transactions và constraints chống đặt trùng.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [`docs/Phân tích nghiệp vụ và thiết kế hệ thống studio cho thuê trang phục.md`](docs/Phân%20tích%20nghiệp%20vụ%20và%20thiết%20kế%20hệ%20thống%20studio%20cho%20thuê%20trang%20phục.md) | Phân tích nghiệp vụ, use case, business rules, database và system design |
| [`docs/api-response-contract.md`](docs/api-response-contract.md) | Quy ước success/error response và request ID |
| [`docs/journals/`](docs/journals/) | Nhật ký các thay đổi kỹ thuật quan trọng |
| [`README.md`](README.md) | Tổng quan kỹ thuật, trạng thái và cách chạy dự án |

---

## 📄 License

Project hiện dùng giấy phép `ISC` trong các package và phục vụ mục đích học tập/phát triển nội bộ. Cập nhật mục này khi chính sách phát hành của repository được chốt.
