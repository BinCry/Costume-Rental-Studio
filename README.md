<div align="center">

# Costume Rental Studio

[![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![pnpm](https://img.shields.io/badge/pnpm-11-F69220?style=for-the-badge&logo=pnpm&logoColor=white)](https://pnpm.io/)

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
- Quản lý giá thuê/cọc theo biến thể, promotion và policy có phiên bản.
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

Repository hiện có giao diện React/Vite kết nối với API Express/Prisma. Mã nguồn đã bao phủ các luồng vận hành chính; việc hoàn tất giao diện còn phụ thuộc kiểm thử với dữ liệu staging và xác nhận từng hành trình bằng API thật.

| Area | Status | Notes |
|------|--------|-------|
| Monorepo và build | ✅ Implemented | pnpm workspace quản lý API và web; workflow riêng kiểm tra và đóng gói image. |
| API nghiệp vụ | ✅ Có trong source | Các module auth, catalog, rentals, payments, inventory, CRM, RBAC, staff, policies, reports và các module hỗ trợ nằm trong `apps/api/src/modules`. |
| Frontend | ✅ Đã kết nối API | Adapter ở `apps/web/src/api/client.ts`; màn hình được chia theo khu khách, vận hành và quản trị. |
| Tài khoản | ✅ Có luồng API/UI | Đăng nhập, đăng ký email và OTP, đặt lại mật khẩu, Google sign-in và phiên đăng nhập. |
| Database | ✅ Prisma migrations | Schema và migration được quản lý bằng Prisma; container API áp dụng migration trước khi mở server. |
| Kiểm thử frontend | 🔄 Đang hoàn thiện | Nhánh này bổ sung test API client và bật lint/test frontend trong CI. |
| Nghiệm thu còn lại | ⚠️ Cần môi trường staging | Chạy lại các hành trình nghiệp vụ với API và dữ liệu cô lập; không dùng giao dịch thật trên production. |
| Ops Agent API | Ngoài phạm vi đợt này | Phần hoàn thiện hiện tại không bao gồm xây API cho Ops Agent. |

**Lưu ý:** có API trong source và build thành công không tự chứng minh mọi kịch bản nghiệp vụ đã được kiểm thử end-to-end. Bảng trên phân biệt trạng thái triển khai với trạng thái nghiệm thu.

## ✨ Features

### 🔐 Authentication & Permissions

- Đăng nhập bằng Google và tạo phiên nội bộ.
- Ba nhóm tài khoản chính: Customer, Staff và Admin.
- Staff nhận quyền thao tác bằng checkbox theo chi nhánh.
- Một người có thể nhận nhiều role theo chi nhánh; quyền hiệu lực là hợp các permission thuộc các role được gán.

### 👘 Catalog & Costume Inventory

- Quản lý mẫu, size, màu, ảnh, mô tả, phụ kiện và phân loại.
- Mỗi bộ vật lý có `unit_code` hoặc barcode riêng.
- Admin đăng ký trước từng bộ ở trạng thái `INBOUND` và chỉ định chi nhánh nhận.
- Nhân viên kho đúng chi nhánh kiểm tra hàng thực tế, xác nhận nhận và cập nhật sang `READY`, `CLEANING` hoặc `REPAIR`.
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
- Timeline tương tác, phiếu hỗ trợ/khiếu nại và lịch sử xử lý case.
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
| **Database** | PostgreSQL 16 + Prisma 7 |

</td>
</tr>
</table>

---

## 🏗 Architecture Overview

### Application Layers

```text
Người dùng
  -> Ứng dụng web React + Vite
  -> REST API Express
  -> Kiểm tra dữ liệu, quyền, log và xử lý lỗi
  -> Các module nghiệp vụ trong apps/api/src/modules
  -> PostgreSQL qua Prisma
```

Thông tin triển khai và kiểm tra frontend được ghi trong [apps/web/README.md](apps/web/README.md) và [hướng dẫn trình diễn UI](docs/ui/demo-guide.md).

### Backend Foundation

| Area | Responsibility |
|------|----------------|
| `config` | Kiểm tra biến môi trường và cấu hình logger |
| `common/errors` | Lỗi ứng dụng có HTTP status, error code và details |
| `common/http` | Success và error response contract dùng chung |
| `common/middleware` | 404 và global error handling |
| `app.ts` | Khởi tạo Express, middleware và routes |
| `server.ts` | Mở cổng và graceful shutdown |

### API Modules

Các module hiện có trong `apps/api/src/modules`:

| Module | Phạm vi |
|--------|---------|
| `auth`, `users`, `rbac` | Tài khoản, phiên, vai trò và quyền |
| `branches`, `staff` | Chi nhánh, nhân viên và phân công |
| `public`, `catalog`, `promotions` | Trang phục công khai, danh mục và ưu đãi |
| `rentals`, `scheduling`, `policies` | Báo giá, đơn thuê, lịch khả dụng và chính sách |
| `inventory`, `transfers` | Bộ trang phục, block lịch và điều chuyển |
| `payments` | Thu tiền, cọc, quyết toán và hoàn tiền |
| `customers`, `crm` | Hồ sơ khách, tương tác và yêu cầu hỗ trợ |
| `reports`, `uploads`, `outbox` | Báo cáo, ảnh/tệp và xử lý sự kiện |

Danh sách module mô tả mã nguồn API. Xem [tài liệu API](docs/api/) và test trong từng workspace để biết luồng nào đã được xác minh.

## 🚀 Quick Start

### Prerequisites

- Node.js `>=22.12.0`
- pnpm `11.1.2`
- PowerShell hoặc terminal tương thích

PostgreSQL cần thiết khi chạy migration, seed hoặc các tính năng có truy cập database; Docker là tùy chọn.

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

### Prepare the Local Database

Sau khi cấu hình `DATABASE_URL` và tạo database PostgreSQL, apply migration rồi nạp dữ liệu mẫu:

```powershell
pnpm --filter @costume/api db:migrate
pnpm db:seed
```

Ở môi trường development, `pnpm db:seed` mặc định chạy profile `demo`: tạo dữ liệu nền và bộ dữ liệu nghiệp vụ mẫu. Seed dùng `upsert`, nên có thể chạy lại để đồng bộ dữ liệu mà không tạo bản ghi seed trùng lặp. Xem dữ liệu bằng `pnpm --filter @costume/api db:studio`.

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
| `pnpm db:seed` | Generate Prisma Client rồi seed database theo `SEED_PROFILE` |
| `pnpm --filter @costume/api db:studio` | Mở Prisma Studio cho database trong `DATABASE_URL` |
| `pnpm --filter @costume/web lint` | Chạy ESLint cho frontend |
| `pnpm --filter @costume/web test` | Chạy kiểm thử API client của frontend |
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
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection URL; dùng Internal URL khi API chạy trong Coolify |
| `SEED_PROFILE` | `demo` | Profile seed: `core` chỉ nạp dữ liệu nền; `demo` nạp thêm dữ liệu phát triển. Mặc định là `demo`, riêng `NODE_ENV=production` mặc định là `core` |
| `SEED_ANCHOR_DATE` | `2026-10-02` | Ngày mốc tùy chọn cho các thời điểm tương đối trong demo seed; nếu bỏ trống sẽ dùng ngày hiện tại theo múi giờ Việt Nam |
| `ALLOW_PRODUCTION_DEMO_SEED` | `false` | Chỉ đặt chính xác `true` khi chủ động cho phép chạy profile `demo` với `NODE_ENV=production` |

Backend dừng startup ngay nếu cấu hình môi trường không hợp lệ.

Không chạy demo seed trên database production thật. Khi `NODE_ENV=production`, seed chỉ chạy profile `core` theo mặc định và sẽ từ chối `SEED_PROFILE=demo` trừ khi có `ALLOW_PRODUCTION_DEMO_SEED=true`; cơ chế mở khóa này chỉ dành cho môi trường production-like dùng để thử nghiệm.

### Frontend — `apps/web/.env`

| Variable | Example | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:4000` | Base URL để frontend gọi backend |

Chỉ biến có prefix `VITE_` mới được Vite đưa vào mã frontend. Không lưu secret trong các biến này.

---

## 📡 API Endpoints

### API groups

API hiện dùng tiền tố `/api/v1` cho các nhóm nghiệp vụ. Danh sách route và quyền cụ thể được duy trì trong source module và tài liệu dưới `docs/api/`.

| Nhóm | Phạm vi |
|------|---------|
| `/health`, `/health/ready` | Kiểm tra tiến trình và khả năng phục vụ |
| `/api/v1/auth`, `/api/v1/users` | Đăng nhập, đăng ký, hồ sơ và phiên |
| `/api/v1/public`, `/api/v1/catalog` | Danh mục công khai và quản trị trang phục |
| `/api/v1/branches`, `/api/v1/staff`, `/api/v1/rbac` | Chi nhánh, nhân viên và quyền |
| `/api/v1/rentals`, `/api/v1/scheduling`, `/api/v1/rental-policies` | Báo giá, đơn thuê, lịch và chính sách |
| `/api/v1/inventory`, `/api/v1/inventory/transfers` | Kho, tình trạng bộ và điều chuyển |
| `/api/v1/payments` | Thanh toán, cọc, quyết toán và hoàn tiền |
| `/api/v1/customers`, `/api/v1/crm` | Hồ sơ khách và xử lý CRM |
| `/api/v1/reports`, `/api/v1/uploads` | Báo cáo và tải tệp |

### Response contract

Response thành công dùng envelope `success/data`; lỗi có `code`, `message`, `statusCode`, thời điểm, đường dẫn và `requestId`. Mỗi response API có header `X-Request-Id`; handler chung nằm trong `apps/api/src/common`.

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dữ liệu chưa hợp lệ",
    "details": {
      "email": "Kiểm tra định dạng email"
    }
  },
  "statusCode": 400,
  "timestamp": "2026-10-14T00:00:00.000Z",
  "path": "/api/v1/example",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

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
│   ├── README.md                  # Chỉ mục và thứ tự ưu tiên tài liệu
│   ├── business/                  # Nghiệp vụ hiện hành và phân tích
│   ├── database/                  # ERD, tóm tắt và constraints
│   ├── api/                       # Hợp đồng/flow API theo module
│   ├── ui/                        # Đặc tả, kế hoạch và demo giao diện
│   ├── reports/                   # Báo cáo QA/đối chiếu
│   ├── operations/                # CI/CD và vận hành
│   ├── archive/                   # Tài liệu lịch sử, không còn nguồn chuẩn
│   └── journals/                  # Nhật ký kỹ thuật
├── package.json                   # Root workspace scripts
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

---

## 🗄 Database Design

PostgreSQL + Prisma đã có schema và initial migration. Migration hiện cần được apply/test trên PostgreSQL trước khi bắt đầu repository/service nghiệp vụ.

Tài liệu database được chia theo mục đích:

- [`docs/database/schema-summary.md`](docs/database/schema-summary.md) — xem nhanh 7 nhóm và 33 bảng.
- [`docs/database/review-guide.md`](docs/database/review-guide.md) — checklist review và migration.
- [`docs/database/schema.dbml`](docs/database/schema.dbml) — ERD đầy đủ để import vào dbdiagram.io.
- [`docs/database/constraints.md`](docs/database/constraints.md) — constraint SQL và chính sách `ON DELETE`.
- [`docs/business/business-rules.md`](docs/business/business-rules.md) — flow nghiệp vụ đã chốt.

Các file DBML có thể import trực tiếp vào [dbdiagram.io](https://dbdiagram.io) để xem, sắp xếp và xuất PNG/PDF.

Thiết kế dữ liệu hiện tại được chia theo các nhóm:

| Group | Main Data |
|-------|-----------|
| **Identity & Permissions** | User, Google identity, employee, branch và role/permission |
| **Catalog & Inventory** | Category, model, variant, media, phụ kiện, unit, block và transfer |
| **Policy & Promotions** | Policy toàn chuỗi có phiên bản và promotion |
| **Rentals** | Order, từng unit được thuê, pickup/return và phụ kiện snapshot |
| **Finance** | Payment, refund và provider webhook |
| **CRM** | Customer, interaction, case và case history |
| **Platform Events** | Transactional outbox |

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
- Bộ do Admin đăng ký trước bắt đầu ở `INBOUND/UNINSPECTED`; chi nhánh được chỉ định chỉ được tính tồn kho khả dụng sau khi nhân viên kho xác nhận nhận và kiểm tra.
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

### Cần xác minh trong staging

- Chạy hành trình đăng nhập/đăng ký/đăng xuất với cấu hình OAuth và cookie thực tế.
- Xác nhận quyền được API áp dụng theo người dùng, vai trò và chi nhánh cho từng thao tác.
- Chạy các tình huống xung đột đồng thời, timeout mạng và retry trên dữ liệu cô lập.
- Kiểm tra lại CORS, callback OAuth, HTTPS/cookie flags và giới hạn tải tệp theo cấu hình triển khai.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [`docs/README.md`](docs/README.md) | Chỉ mục và thứ tự ưu tiên tài liệu |
| [`docs/business/business-rules.md`](docs/business/business-rules.md) | Nghiệp vụ đã chốt và state machine hiện hành |
| [`docs/business/business-analysis.md`](docs/business/business-analysis.md) | Phân tích ngoại lệ và kịch bản nghiệm thu nghiệp vụ |
| [`docs/database/schema-summary.md`](docs/database/schema-summary.md) | Tóm tắt 7 nhóm và 33 bảng |
| [`docs/database/schema.dbml`](docs/database/schema.dbml) | ERD đầy đủ |
| [`docs/database/constraints.md`](docs/database/constraints.md) | Constraint PostgreSQL và chính sách FK |
| [`docs/database/review-guide.md`](docs/database/review-guide.md) | Checklist review, test và migration |
| [`docs/reports/ui-ux-final-audit.md`](docs/reports/ui-ux-final-audit.md) | Kết quả nghiệm thu frontend fixture và các việc chờ API |
| [`docs/operations/ci-cd.md`](docs/operations/ci-cd.md) | CI/CD, Coolify và migration production |
| [`docs/archive/historical-business-analysis.md`](docs/archive/historical-business-analysis.md) | Tài liệu phân tích lịch sử; không phải nguồn hiện hành |
| [`README.md`](README.md) | Tổng quan kỹ thuật, trạng thái và cách chạy dự án |

---

## 📄 License

Project hiện dùng giấy phép `ISC` trong các package và phục vụ mục đích học tập/phát triển nội bộ. Cập nhật mục này khi chính sách phát hành của repository được chốt.
