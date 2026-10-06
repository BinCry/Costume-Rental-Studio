# Database Constraints

Tài liệu này chốt các ràng buộc thực thi cho PostgreSQL dựa trên
[`database-schema.dbml`](database-schema.dbml). DBML vẫn là nguồn thiết kế ERD;
`migration.sql` là nguồn thực thi cuối cùng sau khi Prisma schema được tạo.

## Customer registration: migration bổ sung

`20261002230000_customer_registration` tạo cấu trúc ban đầu; migration tiếp theo
`20261003010000_user_password_fields` chuyển mật khẩu vào users trước khi bỏ password_credentials.
Không chỉnh lịch sử migration cũ. users.password_hash và phone_verified_at nullable;
CHECK hash nếu có phải Argon2id; phone_verified_at nếu có yêu cầu phone không null.
Khi thay số điện thoại, ứng dụng phải xóa phone_verified_at và xác minh lại.
Các CHECK OTP raw SQL bổ sung: phone E.164, OTP HMAC 64 ký tự hex,
attempt_count từ 0 đến 5, expires_at > created_at, consumed_at yêu cầu sent_at.
Phone challenge có unique phone nhưng không FK đến user. Giữ nguyên các CHECK này khi tạo
migration tiếp theo vì Prisma không biểu diễn chúng. Giới hạn gửi lại, OTP một lần, xác minh
và không ghi đè credential được thực thi trong service/transaction; xem [API](auth-registration.md).

## Refresh session: migration bổ sung

`20261003020000_refresh_sessions` thêm bảng refresh_sessions với FK users ON DELETE CASCADE.
CHECK raw SQL: token_hash gồm 64 ký tự hex, expires_at > created_at,
used_at/revoked_at nếu có phải >= created_at. Unique token_hash để tra cứu; index family_id
để khóa/thu hồi chuỗi phiên, index user_id để quản lý phiên của tài khoản.
Rotation và replay được xử lý trong transaction có advisory lock theo family_id;
không xóa token cũ trước hạn family vì cần phát hiện replay. Xem [API](auth-session.md).

## 1. Quy ước

- PostgreSQL 15 trở lên để sử dụng `UNIQUE NULLS NOT DISTINCT`.
- Thời gian lưu bằng `TIMESTAMPTZ`; khoảng thời gian dùng dạng `[start, end)`.
- Tiền VND dùng `BIGINT`, đơn vị đồng, không dùng số thực.
- Bảng lịch sử, tài chính và dữ liệu đã tham gia giao dịch không bị hard delete.
- Rule chỉ phụ thuộc một dòng dùng `CHECK`.
- Rule chống trùng nhiều dòng dùng `UNIQUE` hoặc exclusion constraint.
- Rule cần đọc bảng khác dùng transaction/locking; không cố dùng `CHECK`.
- Tên enum/table trong SQL thực tế phải được điều chỉnh nếu Prisma tạo tên có dấu ngoặc kép hoặc mapping khác.

## 2. CHECK constraints theo bảng

### 2.1. Identity và phân quyền

| Tên constraint | Bảng | Biểu thức |
|---|---|---|
| `ck_users_contact_required` | `users` | `email IS NOT NULL OR phone IS NOT NULL` |
| `ck_employees_termination` | `employees` | `employment_status = 'TERMINATED'` khi và chỉ khi `terminated_at IS NOT NULL` |

SQL dự kiến:

```sql
ALTER TABLE users
  ADD CONSTRAINT ck_users_contact_required
  CHECK (email IS NOT NULL OR phone IS NOT NULL);

ALTER TABLE employees
  ADD CONSTRAINT ck_employees_termination
  CHECK (
    (employment_status = 'TERMINATED' AND terminated_at IS NOT NULL)
    OR
    (employment_status <> 'TERMINATED' AND terminated_at IS NULL)
  );
```

Email phải được chuyển lowercase và phone phải được chuẩn hóa E.164 ở application trước khi lưu.

### 2.2. Catalog và kho

```sql
ALTER TABLE costume_model_accessories
  ADD CONSTRAINT ck_model_accessory_quantity
    CHECK (default_quantity > 0),
  ADD CONSTRAINT ck_model_accessory_replacement_value
    CHECK (replacement_value_vnd IS NULL OR replacement_value_vnd >= 0);

ALTER TABLE costume_variants
  ADD CONSTRAINT ck_variant_money
    CHECK (
      daily_rental_price_vnd >= 0
      AND deposit_amount_vnd >= 0
      AND replacement_value_vnd >= 0
    ),
  ADD CONSTRAINT ck_variant_cleaning_buffer
    CHECK (cleaning_buffer_minutes IS NULL OR cleaning_buffer_minutes >= 0);

ALTER TABLE costume_media
  ADD CONSTRAINT ck_media_exactly_one_owner
  CHECK ((model_id IS NOT NULL) <> (variant_id IS NOT NULL));

ALTER TABLE costume_units
  ADD CONSTRAINT ck_unit_acquisition_cost
    CHECK (acquisition_cost_vnd IS NULL OR acquisition_cost_vnd >= 0),
  ADD CONSTRAINT ck_unit_inbound_condition
    CHECK (
      (operational_status = 'INBOUND' AND condition_grade = 'UNINSPECTED')
      OR
      (operational_status <> 'INBOUND' AND condition_grade <> 'UNINSPECTED')
    ),
  ADD CONSTRAINT ck_unit_retired_at
    CHECK (
      (operational_status = 'RETIRED' AND retired_at IS NOT NULL)
      OR
      (operational_status <> 'RETIRED' AND retired_at IS NULL)
    );
```

`unit_events` không được `UPDATE`. Việc xóa chỉ thực hiện bởi retention/admin hoặc tự động `CASCADE` khi một unit hợp lệ được hard delete.

### 2.3. Unit blocks

```sql
ALTER TABLE unit_blocks
  ADD CONSTRAINT ck_unit_block_range
    CHECK (blocked_from < blocked_until),
  ADD CONSTRAINT ck_unit_block_cost
    CHECK (cost_vnd IS NULL OR cost_vnd >= 0),
  ADD CONSTRAINT ck_unit_block_started
    CHECK (status <> 'IN_PROGRESS' OR started_at IS NOT NULL),
  ADD CONSTRAINT ck_unit_block_completed
    CHECK (
      status <> 'COMPLETED'
      OR (started_at IS NOT NULL AND finished_at IS NOT NULL)
    ),
  ADD CONSTRAINT ck_unit_block_finish_after_start
    CHECK (
      finished_at IS NULL
      OR (started_at IS NOT NULL AND finished_at >= started_at)
    );
```

### 2.4. Điều chuyển

```sql
ALTER TABLE stock_transfers
  ADD CONSTRAINT ck_transfer_different_branches
    CHECK (from_branch_id <> to_branch_id),
  ADD CONSTRAINT ck_transfer_version
    CHECK (version > 0),
  ADD CONSTRAINT ck_transfer_approved_metadata
    CHECK (
      status NOT IN ('APPROVED', 'IN_TRANSIT', 'RECEIVED')
      OR approved_at IS NOT NULL
    ),
  ADD CONSTRAINT ck_transfer_shipped_metadata
    CHECK (
      status NOT IN ('IN_TRANSIT', 'RECEIVED')
      OR shipped_at IS NOT NULL
    ),
  ADD CONSTRAINT ck_transfer_received_metadata
    CHECK (
      status <> 'RECEIVED'
      OR received_at IS NOT NULL
    ),
  ADD CONSTRAINT ck_transfer_ended_metadata
    CHECK (
      status NOT IN ('REJECTED', 'CANCELLED')
      OR (
        ended_at IS NOT NULL
        AND NULLIF(BTRIM(end_reason), '') IS NOT NULL
      )
    );

ALTER TABLE stock_transfer_items
  ADD CONSTRAINT ck_transfer_item_condition_out
    CHECK (condition_out IS NULL OR condition_out <> 'UNINSPECTED'),
  ADD CONSTRAINT ck_transfer_item_condition_in
    CHECK (condition_in IS NULL OR condition_in <> 'UNINSPECTED'),
  ADD CONSTRAINT ck_transfer_item_received_status
    CHECK (
      received_operational_status IS NULL
      OR received_operational_status NOT IN ('INBOUND', 'IN_TRANSFER')
    );
```

Việc bắt buộc `condition_out` khi phiếu được ship và bắt buộc `condition_in` khi nhận phụ thuộc trạng thái bảng cha, nên phải kiểm tra trong transaction.

### 2.5. Policy và promotion

```sql
ALTER TABLE rental_policy_versions
  ADD CONSTRAINT ck_policy_effective_range
    CHECK (effective_to IS NULL OR effective_from < effective_to),
  ADD CONSTRAINT ck_policy_rental_days
    CHECK (
      min_rental_days >= 1
      AND (max_rental_days IS NULL OR max_rental_days >= min_rental_days)
    ),
  ADD CONSTRAINT ck_policy_nonnegative_durations
    CHECK (
      quote_valid_hours >= 0
      AND no_show_grace_minutes >= 0
      AND late_grace_minutes >= 0
      AND free_cancel_before_hours >= 0
      AND (refund_sla_business_days IS NULL OR refund_sla_business_days >= 0)
    ),
  ADD CONSTRAINT ck_policy_percentages
    CHECK (
      late_fee_percent_per_day BETWEEN 0 AND 100
      AND late_cancel_fee_percent BETWEEN 0 AND 100
    );

ALTER TABLE promotions
  ADD CONSTRAINT ck_promotion_range
    CHECK (start_at < end_at),
  ADD CONSTRAINT ck_promotion_discount
    CHECK (
      discount_value > 0
      AND (discount_type <> 'PERCENT' OR discount_value <= 100)
    ),
  ADD CONSTRAINT ck_promotion_amounts
    CHECK (
      min_order_amount_vnd >= 0
      AND (max_discount_vnd IS NULL OR max_discount_vnd >= 0)
    ),
  ADD CONSTRAINT ck_promotion_limits
    CHECK (
      (total_usage_limit IS NULL OR total_usage_limit > 0)
      AND per_customer_limit > 0
    );
```

### 2.6. Đơn thuê

```sql
ALTER TABLE rental_orders
  ADD CONSTRAINT ck_order_planned_range
    CHECK (planned_start_at < planned_due_at),
  ADD CONSTRAINT ck_order_money
    CHECK (
      promotion_discount_vnd >= 0
      AND late_fee_vnd >= 0
      AND other_fee_vnd >= 0
      AND deposit_deduction_vnd >= 0
    ),
  ADD CONSTRAINT ck_order_promotion_snapshot
    CHECK (
      (
        promotion_id IS NULL
        AND promotion_code IS NULL
        AND promotion_discount_vnd = 0
      )
      OR
      (
        promotion_id IS NOT NULL
        AND NULLIF(BTRIM(promotion_code), '') IS NOT NULL
      )
    ),
  ADD CONSTRAINT ck_order_pickup_metadata
    CHECK (pickup_processed_by IS NULL OR picked_up_at IS NOT NULL),
  ADD CONSTRAINT ck_order_return_metadata
    CHECK (return_processed_by IS NULL OR returned_at IS NOT NULL),
  ADD CONSTRAINT ck_order_financial_settlement
    CHECK (
      financially_settled_at IS NULL
      OR (returned_at IS NOT NULL AND financially_settled_at >= returned_at)
    ),
  ADD CONSTRAINT ck_order_version
    CHECK (version > 0);

ALTER TABLE rental_order_items
  ADD CONSTRAINT ck_order_item_occupied_range
    CHECK (occupied_from < occupied_until),
  ADD CONSTRAINT ck_order_item_billable_days
    CHECK (billable_days > 0),
  ADD CONSTRAINT ck_order_item_money
    CHECK (
      unit_daily_price_vnd >= 0
      AND unit_deposit_vnd >= 0
      AND damage_fee_vnd >= 0
      AND missing_fee_vnd >= 0
    ),
  ADD CONSTRAINT ck_order_item_allocation
    CHECK (
      (
        allocation_status = 'UNASSIGNED'
        AND unit_id IS NULL
        AND allocated_by IS NULL
      )
      OR
      (
        allocation_status <> 'UNASSIGNED'
        AND unit_id IS NOT NULL
      )
    ),
  ADD CONSTRAINT ck_order_item_pickup_condition
    CHECK (
      pickup_condition_grade IS NULL
      OR pickup_condition_grade <> 'UNINSPECTED'
    ),
  ADD CONSTRAINT ck_order_item_return_condition
    CHECK (
      return_condition_grade IS NULL
      OR return_condition_grade <> 'UNINSPECTED'
    );

ALTER TABLE rental_item_accessories
  ADD CONSTRAINT ck_rental_accessory_quantity_out
    CHECK (quantity_out > 0),
  ADD CONSTRAINT ck_rental_accessory_quantity_returned
    CHECK (
      quantity_returned IS NULL
      OR quantity_returned BETWEEN 0 AND quantity_out
    ),
  ADD CONSTRAINT ck_rental_accessory_money
    CHECK (
      unit_replacement_value_vnd >= 0
      AND damage_fee_vnd >= 0
      AND missing_fee_vnd >= 0
    ),
  ADD CONSTRAINT ck_rental_accessory_condition_out
    CHECK (condition_out IS NULL OR condition_out <> 'UNINSPECTED'),
  ADD CONSTRAINT ck_rental_accessory_condition_in
    CHECK (condition_in IS NULL OR condition_in <> 'UNINSPECTED');
```

### 2.7. Thanh toán và refund

```sql
ALTER TABLE payments
  ADD CONSTRAINT ck_payment_amount
    CHECK (amount_vnd > 0),
  ADD CONSTRAINT ck_payment_succeeded_at
    CHECK (
      (status = 'SUCCEEDED' AND paid_at IS NOT NULL)
      OR (status <> 'SUCCEEDED' AND paid_at IS NULL)
    ),
  ADD CONSTRAINT ck_payment_method_metadata
    CHECK (
      (
        method = 'PAYMENT_GATEWAY'
        AND provider IS NOT NULL
        AND provider_payment_id IS NOT NULL
      )
      OR
      (
        method IN ('CASH', 'BANK_TRANSFER')
        AND recorded_by IS NOT NULL
      )
    );

ALTER TABLE refunds
  ADD CONSTRAINT ck_refund_amount
    CHECK (amount_vnd > 0),
  ADD CONSTRAINT ck_refund_completed_at
    CHECK (
      (status = 'COMPLETED' AND completed_at IS NOT NULL)
      OR (status <> 'COMPLETED' AND completed_at IS NULL)
    );
```

### 2.8. CRM và platform events

```sql
ALTER TABLE customers
  ADD CONSTRAINT ck_customer_birthday
    CHECK (birthday IS NULL OR birthday <= CURRENT_DATE),
  ADD CONSTRAINT ck_customer_measurements
    CHECK (
      (height_cm IS NULL OR height_cm > 0)
      AND (weight_kg IS NULL OR weight_kg > 0)
      AND (chest_cm IS NULL OR chest_cm > 0)
      AND (waist_cm IS NULL OR waist_cm > 0)
      AND (hip_cm IS NULL OR hip_cm > 0)
    );

ALTER TABLE crm_cases
  ADD CONSTRAINT ck_crm_case_resolved
    CHECK (status NOT IN ('RESOLVED', 'CLOSED') OR resolved_at IS NOT NULL),
  ADD CONSTRAINT ck_crm_case_closed
    CHECK (status <> 'CLOSED' OR closed_at IS NOT NULL),
  ADD CONSTRAINT ck_crm_case_closed_after_resolved
    CHECK (
      closed_at IS NULL
      OR (resolved_at IS NOT NULL AND closed_at >= resolved_at)
    );

ALTER TABLE crm_case_history
  ADD CONSTRAINT ck_crm_history_payload
    CHECK (
      (
        event_type = 'CREATED'
        AND from_status IS NULL
        AND to_status IS NOT NULL
      )
      OR
      (
        event_type = 'STATUS_CHANGED'
        AND from_status IS NOT NULL
        AND to_status IS NOT NULL
        AND from_status <> to_status
      )
      OR
      (
        event_type = 'OWNER_CHANGED'
        AND from_owner_user_id IS DISTINCT FROM to_owner_user_id
      )
    );

ALTER TABLE outbox_events
  ADD CONSTRAINT ck_outbox_retry_count
    CHECK (retry_count >= 0),
  ADD CONSTRAINT ck_outbox_processed_at
    CHECK (
      (status = 'PROCESSED' AND processed_at IS NOT NULL)
      OR (status <> 'PROCESSED' AND processed_at IS NULL)
    );
```

`customer_interactions` và `crm_case_history` không được `UPDATE`. Việc xóa chỉ thực hiện bởi retention/admin hoặc `CASCADE` theo aggregate đã quy định.

## 3. Unique và exclusion constraints đặc biệt

### 3.1. Role assignment có branch NULL

Unique thông thường cho phép nhiều dòng có `branch_id = NULL`. PostgreSQL 15 phải dùng:

```sql
ALTER TABLE user_role_assignments
  DROP CONSTRAINT IF EXISTS user_role_assignments_user_id_role_id_branch_id_key;

ALTER TABLE user_role_assignments
  ADD CONSTRAINT uq_user_role_branch
  UNIQUE NULLS NOT DISTINCT (user_id, role_id, branch_id);
```

### 3.2. Snapshot phụ kiện không trùng master khi master còn tồn tại

`model_accessory_id` có thể thành `NULL` khi phụ kiện master bị xóa, nhưng các liên kết còn tồn tại vẫn phải duy nhất trong một order item:

```sql
CREATE UNIQUE INDEX rental_item_accessories_order_item_id_model_accessory_id_key
  ON rental_item_accessories(order_item_id, model_accessory_id);
```

### 3.3. Không cho một unit bị giữ lịch chồng nhau

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE rental_order_items
  ADD CONSTRAINT ex_unit_rental_overlap
  EXCLUDE USING gist (
    unit_id WITH =,
    tstzrange(occupied_from, occupied_until, '[)') WITH &&
  )
  WHERE (allocation_status IN ('HELD', 'CONFIRMED', 'ACTIVE'));
```

Khoảng `[start, end)` cho phép đơn tiếp theo bắt đầu đúng lúc đơn trước kết thúc.

### 3.4. Policy không chồng thời gian hiệu lực

```sql
ALTER TABLE rental_policy_versions
  ADD CONSTRAINT ex_policy_effective_overlap
  EXCLUDE USING gist (
    tstzrange(
      effective_from,
      COALESCE(effective_to, 'infinity'::timestamptz),
      '[)'
    ) WITH &&
  );
```

Policy hiện hành có `effective_to = NULL`. Trước khi thêm policy mới, transaction phải đóng policy hiện hành bằng `effective_to = new.effective_from`.

## 4. Chính sách foreign key và ON DELETE

### 4.1. `CASCADE`

Chỉ dùng cho bảng con thuần túy, không có ý nghĩa độc lập:

| Parent → child | Lý do |
|---|---|
| `users → auth_identities` | Identity không tồn tại nếu user bị xóa |
| `users → employees` | Profile nhân viên phụ thuộc user |
| `users → customers` | Profile khách hàng phụ thuộc user |
| `roles → role_permissions` | Bảng nối thuần túy |
| `permissions → role_permissions` | Bảng nối thuần túy |
| `users/roles/branches → user_role_assignments` | Assignment không tồn tại nếu phạm vi gốc bị xóa |
| `costume_models → costume_model_accessories` | Phụ kiện master thuộc model |
| `costume_models/costume_variants → costume_media` | Media phụ thuộc đúng owner |
| `costume_units → unit_events` | Event không còn ý nghĩa khi unit bị hard delete |
| `costume_units → unit_blocks` | Block không còn ý nghĩa khi unit bị hard delete |
| `stock_transfers → stock_transfer_items` | Item thuộc phiếu chuyển |
| `rental_orders → rental_order_items` | Item thuộc đơn; đơn có giao dịch lịch sử vẫn bị FK khác chặn xóa |
| `rental_order_items → rental_item_accessories` | Phụ kiện snapshot thuộc item |
| `crm_cases → crm_case_history` | History thuộc case |

### 4.2. `SET NULL`

Chỉ dùng cho liên kết tùy chọn mà bản ghi con vẫn còn ý nghĩa khi bản ghi cha bị xóa:

| Foreign key | Chính sách |
|---|---|
| `customers.preferred_branch_id` | `SET NULL` |
| `unit_blocks.assigned_to` | `SET NULL` |
| `unit_events.stock_transfer_id` | `SET NULL` |
| `unit_events.from_branch_id` | `SET NULL` |
| `unit_events.to_branch_id` | `SET NULL` |
| `unit_events.recorded_by` | `SET NULL` |
| `unit_blocks.created_by` | `SET NULL` |
| `stock_transfers.approved_by` | `SET NULL` |
| `stock_transfers.shipped_by` | `SET NULL` |
| `stock_transfers.received_by` | `SET NULL` |
| `stock_transfers.ended_by` | `SET NULL` |
| `rental_policy_versions.created_by` | `SET NULL` |
| `promotions.created_by` | `SET NULL` |
| `rental_orders.pickup_processed_by` | `SET NULL` |
| `rental_orders.return_processed_by` | `SET NULL` |
| `rental_order_items.allocated_by` | `SET NULL` |
| `rental_item_accessories.model_accessory_id` | `SET NULL` |
| `crm_cases.owner_user_id` | `SET NULL` |
| `crm_cases.order_id` | `SET NULL` |
| `crm_cases.created_by` | `SET NULL` |
| `crm_case_history.from_owner_user_id` | `SET NULL` |
| `crm_case_history.to_owner_user_id` | `SET NULL` |
| `crm_case_history.actor_user_id` | `SET NULL` |
| `provider_webhook_events.payment_id` | `SET NULL` |
| `customer_interactions.branch_id` | `SET NULL` |
| `customer_interactions.order_id` | `SET NULL` |
| `customer_interactions.case_id` | `SET NULL` |
| `customer_interactions.staff_user_id` | `SET NULL` |

### 4.3. `RESTRICT`

Mặc định dùng `RESTRICT` cho mọi FK còn lại, đặc biệt:

- User/customer/employee đã xuất hiện trong đơn, payment, refund hoặc audit nghiệp vụ.
- Branch đã có unit, đơn, transfer hoặc CRM case.
- Catalog model/variant/unit đã xuất hiện trong giao dịch.
- Policy hoặc promotion đã được đơn tham chiếu.
- Order, payment, refund, stock transfer, unit event và CRM case có lịch sử.
- Actor tài chính bắt buộc như `payments.recorded_by`, `refunds.requested_by` và `refunds.approved_by` vẫn được giữ để truy vết; actor vận hành tùy chọn dùng `SET NULL`.

Các entity này dùng `status = INACTIVE`, `TERMINATED` hoặc trạng thái kết thúc thay vì hard delete.

## 5. Rule liên bảng phải thực thi bằng transaction

### 5.1. Xác nhận đơn và phân bổ unit

Trong một transaction:

1. Lock các `costume_units` được chọn bằng `SELECT ... FOR UPDATE`.
2. Kiểm tra unit `READY`, đúng variant và thuộc `pickup_branch_id`.
3. Kiểm tra không có `unit_blocks` hiệu lực chồng khoảng thuê.
4. GiST constraint kiểm tra không có allocation hiệu lực chồng lịch.
5. Nếu có promotion, lock promotion và đếm usage hợp lệ.
6. Gán unit, chuyển allocation sang `CONFIRMED`, snapshot giá/phụ kiện.
7. Cập nhật order, ghi audit và outbox trong cùng transaction.

### 5.2. Điều chuyển unit

Trong một transaction:

- Lock unit và phiếu chuyển.
- Chỉ cho ship unit đang ở chi nhánh nguồn và không có lịch thuê/block xung đột.
- Một unit không được thuộc hai transfer `REQUESTED/APPROVED/IN_TRANSIT`.
- Khi ship, `condition_out` bắt buộc và unit chuyển `IN_TRANSFER`.
- Khi nhận, `condition_in` và `received_operational_status` bắt buộc.
- Khi nhận thành công, cập nhật branch, status, transfer và `unit_events` cùng lúc.

### 5.3. Payment, webhook và refund

- Webhook được xác minh chữ ký trước khi lưu.
- Insert `provider_webhook_events` theo unique `(provider, event_id)` trước khi đổi payment.
- Update payment và tạo outbox trong cùng transaction.
- Khi refund, lock payment và các refund liên quan.
- Tổng refund đang xử lý hoặc đã hoàn tất không được vượt payment `SUCCEEDED`.

### 5.4. Các consistency rule khác

- `crm_cases.order_id`, nếu có, phải thuộc `customer_user_id` của case.
- Interaction gắn order/case phải thuộc đúng customer.
- Nhân viên chỉ được thao tác trong branch được gán role.
- Mọi state transition phải đúng state machine và dùng optimistic locking khi bảng có `version`.
- Thay đổi trạng thái quan trọng phải ghi audit/outbox trong cùng transaction.

## 6. Thứ tự đưa vào Prisma migration

1. Tạo enum, table, PK, FK, `UNIQUE` và index trong Prisma schema.
2. Chạy migration ở chế độ nháp:

   ```bash
   prisma migrate dev --create-only --name init
   ```

3. Chỉnh `migration.sql` để thêm:
   - Các `CHECK` trong tài liệu này.
   - `UNIQUE NULLS NOT DISTINCT`.
   - Extension `btree_gist`.
   - Hai exclusion constraints.
   - `ON DELETE` tương ứng.
4. Apply migration vào database test mới.
5. Chạy integration test constraint trước khi dùng database cho API.

## 7. Checklist test bắt buộc

- User không có email và phone bị từ chối.
- Media có cả model và variant, hoặc không có cả hai, bị từ chối.
- Hai global role assignment giống nhau bị từ chối.
- Hai allocation hiệu lực của cùng unit chồng lịch bị từ chối.
- Hai policy chồng thời gian bị từ chối.
- Hai khoảng thuê tiếp giáp nhau được chấp nhận.
- Transfer có cùng branch nguồn và đích bị từ chối.
- Unit `INBOUND` với condition khác `UNINSPECTED` bị từ chối.
- Unit `RETIRED` không có `retired_at` bị từ chối.
- Order có start không nhỏ hơn due bị từ chối.
- Payment thành công không có `paid_at` bị từ chối.
- Refund vượt payment bị rollback.
- Webhook trùng `(provider, event_id)` không cập nhật payment hai lần.
- Xác nhận đồng thời hai đơn cho cùng unit chỉ có một transaction thành công.
- Xóa entity lịch sử bị `RESTRICT`; xóa owner tùy chọn giữ bản ghi con và đặt FK thành `NULL`.
