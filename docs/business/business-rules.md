# Business Rules — Costume Rental Studio

**Trạng thái:** nguồn nghiệp vụ hiện hành (source of truth).

**Cập nhật:** 14/10/2026

**Phạm vi:** các quyết định nghiệp vụ đã chốt cho MVP. Prisma schema, API và giao diện phải tuân theo tài liệu này; một rule xuất hiện ở đây không đồng nghĩa tính năng tương ứng đã được triển khai xong.

**Tài liệu hỗ trợ:** [business-analysis.md](business-analysis.md) dùng để phân tích ngoại lệ và nghiệm thu. [historical-business-analysis.md](../archive/historical-business-analysis.md) là tài liệu lịch sử, không phải nguồn chuẩn khi có mâu thuẫn.

## 1. Phạm vi hệ thống

- Studio có nhiều chi nhánh nhưng dùng chung catalog, giá và chính sách.
- Khách đặt online hoặc nhân viên lập đơn tại quầy.
- Khách tự đến đúng chi nhánh để nhận và trả; không có nhân viên giao hàng.
- Một dòng đơn đại diện cho một bộ trang phục vật lý, vì vậy không có `quantity` trên `rental_order_items`.
- Giá thuê, tiền cọc và giá thay thế đặt ở `costume_variants`; đơn đã xác nhận giữ snapshot riêng.
- Tiền lưu bằng `BIGINT` theo đơn vị VND.
- Thời điểm lưu bằng `TIMESTAMPTZ`; ứng dụng hiển thị theo `branches.timezone`, mặc định `Asia/Ho_Chi_Minh`.

## 2. Tác nhân và phân quyền

### Admin

- Quản lý chi nhánh, nhân viên, catalog, giá, policy, promotion và role/permission.
- Tạo trước tài khoản nhân viên ở trạng thái `PENDING`.
- Đăng ký trước unit vật lý và chỉ định chi nhánh nhận.

### Sales Staff

- Tạo và xác nhận đơn tại chi nhánh được phân công.
- Gán unit, chuẩn bị, xử lý khách nhận/trả tại quầy.
- Ghi nhận thanh toán thủ công, thực hiện refund thủ công và xử lý CRM khi có permission tương ứng.

### Branch Manager

- Có phạm vi dữ liệu tại các chi nhánh được phân công.
- Chốt phí hư hỏng/mất đồ sau khi nhân viên ghi nhận tình trạng và bằng chứng.
- Có thể miễn/giảm công nợ theo permission; refund không bắt buộc manager phê duyệt trong MVP.

### Inventory Staff

- Nhận unit được admin chuyển tới chi nhánh.
- Kiểm tra tình trạng, đưa unit từ `INBOUND` sang `READY`, `CLEANING` hoặc `REPAIR`.
- Quản lý block vệ sinh/sửa chữa và điều chuyển kho.

### Customer

- Xem catalog, tạo và quản lý đơn thuộc chính mình.
- Khách tại quầy vẫn có `users` + `customers`; `auth_identities` có thể được liên kết sau.

Quyền được tính từ `user_role_assignments → roles → role_permissions`. Schema hiện tại không có permission override theo từng người.

- Admin xem dữ liệu toàn chuỗi.
- Nhân viên và quản lý chi nhánh chỉ thao tác dữ liệu thuộc chi nhánh được phân công, trừ permission toàn chuỗi được cấp rõ ràng.
- Customer chỉ xem và thao tác hồ sơ, đơn và giao dịch thuộc chính mình.
- Mọi write phải kiểm tra lại cả permission và branch scope ở backend; việc giao diện ẩn nút không thay thế authorization.

## 3. Tài khoản nhân viên

```text
Admin nhập email nhân viên
→ tạo users(PENDING)
→ tạo employees
→ tạo user_role_assignments theo chi nhánh
→ nhân viên đăng nhập Google bằng đúng email
→ backend xác minh email_verified và Google sub
→ tạo auth_identities
→ employees.activated_at = now()
→ users.status = ACTIVE
```

Sau lần liên kết đầu, tài khoản được nhận diện bằng `(provider, provider_subject)`, không dùng email làm khóa định danh Google.

## 4. Khách hàng và liên kết tài khoản

- Khách do nhân viên tạo tại quầy vẫn dùng một `User` và một `Customer`; lúc chưa đăng nhập có thể chưa có `AuthIdentity`.
- Khi khách đăng ký/claim bằng email, hệ thống gửi OTP đến email đó. Chỉ sau khi OTP hợp lệ mới liên kết thông tin đăng nhập với `User`/`Customer` cũ.
- Khi đăng nhập Google, nếu Google trả về `email_verified = true` và email trùng một `User` hợp lệ chưa có Google identity, hệ thống gắn `AuthIdentity(provider=GOOGLE, provider_subject=sub)` vào user cũ, không tạo Customer mới.
- Sau lần liên kết đầu, các lần đăng nhập Google phải tìm bằng `(provider, provider_subject)`; email chỉ dùng cho bước liên kết ban đầu.
- Email và số điện thoại phải được chuẩn hóa trước khi kiểm tra trùng. Nhân viên phải tìm hồ sơ trước khi tạo customer mới.
- Merge hai Customer không thuộc MVP. Trường hợp nghi ngờ trùng nhưng không thể claim/link an toàn phải dừng và xử lý thủ công, không tự hợp nhất lịch sử.

## 5. Chi nhánh và lịch vận hành

- Admin cấu hình timezone, giờ mở cửa, giờ nhận/trả, ngày nghỉ và cutoff theo từng chi nhánh.
- Thời gian nhận/trả, quote expiry và no-show phải được kiểm tra theo lịch vận hành của chi nhánh.
- Không cho tạo/xác nhận lịch nhận hoặc trả ngoài giờ hoạt động, trừ khi người có permission override xác nhận rõ ràng.
- Không xóa chi nhánh đã có lịch sử. Chỉ chuyển `INACTIVE` sau khi không còn đơn hiện tại/tương lai, unit tồn, transfer dở dang hoặc nghiệp vụ chưa quyết toán.
- Chi nhánh `INACTIVE` không nhận nghiệp vụ mới nhưng vẫn xuất hiện trong đơn và báo cáo lịch sử.

## 6. Catalog và unit vật lý

```text
costume_categories
→ costume_models
→ costume_variants
→ costume_units
```

- Model mô tả mẫu trang phục chung.
- Variant là một SKU theo size, màu và edition; chứa giá thuê/ngày, cọc và giá thay thế.
- Unit là một bộ vật lý có barcode riêng và thuộc một chi nhánh tại một thời điểm.
- Ảnh lưu ở object storage; `costume_media` chỉ lưu object key và metadata.
- Phụ kiện chuẩn của model lưu trong `costume_model_accessories`.
- Phụ kiện thực tế giao/trả của dòng đơn lưu snapshot trong `rental_item_accessories`.
- Hard delete catalog không cascade: category chỉ xóa khi không có category con/model; model
  chỉ xóa khi không có variant/phụ kiện/media; variant chỉ xóa khi không có unit/dòng đơn/media;
  phụ kiện chỉ xóa khi chưa xuất hiện trong snapshot đơn thuê.
- Catalog đã được sử dụng phải trả xung đột và chuyển sang inactive để giữ lịch sử. Việc bật lại
  category cha không tự bật lại các phần tử con đã inactive.

Admin đăng ký unit mới với `INBOUND/UNINSPECTED`. Nhân viên kho chi nhánh nhận và kiểm tra; chỉ unit `READY` mới được cho thuê.

## 7. Block và điều chuyển unit

`unit_blocks` hợp nhất lịch không khả dụng và công việc vệ sinh/sửa chữa. Block `PLANNED` hoặc `IN_PROGRESS` làm unit không khả dụng.

Điều chuyển:

```text
REQUESTED → APPROVED → IN_TRANSIT → RECEIVED
          ↘ REJECTED
REQUESTED/APPROVED → CANCELLED
```

- Chi nhánh nguồn và đích phải khác nhau.
- Item không được sửa sau khi duyệt.
- Khi xuất: unit chuyển `IN_TRANSFER`, `current_branch_id` vẫn là chi nhánh nguồn.
- Khi nhận: cập nhật `current_branch_id`, tình trạng nhận và trạng thái sau kiểm tra trong cùng transaction.
- Một unit không được nằm trong hai phiếu điều chuyển đang hoạt động.

## 8. Luồng đơn thuê

```text
DRAFT
→ PENDING_CONFIRMATION
→ CONFIRMED
→ PREPARING
→ READY_FOR_PICKUP
→ ACTIVE
→ RETURN_INSPECTION
→ COMPLETED
```

Nhánh kết thúc: `REJECTED`, `CANCELLED`, `NO_SHOW`.

- `PENDING_CONFIRMATION` chưa đảm bảo giữ unit.
- Khi xác nhận, mỗi `rental_order_items` được gán một unit và khoảng chiếm dụng đến hết thời gian bảo vệ lịch.
- Khoảng bảo vệ kết thúc bằng `planned_due_at + max(policy.late_return_buffer_minutes, variant.cleaning_buffer_minutes)`; đây là thời gian nội bộ, không gia hạn kỳ thuê của khách.
- Unit có phân bổ `ACTIVE` tiếp tục không khả dụng cho đến khi nhân viên ghi nhận trả thực tế, kể cả khi `planned_due_at` và `occupied_until` đã qua.
- Database ngăn cùng unit có lịch `HELD/CONFIRMED/ACTIVE` chồng nhau; service cũng kiểm tra block vệ sinh/sửa chữa và transfer.
- Khách nhận tại quầy; `pickup_processed_by` là nhân viên quầy, không phải shipper.
- Khi trả, nhân viên ghi nhận từng unit đã thực nhận, tình trạng, thiếu/hỏng và bằng chứng. Có thể trả một phần; chỉ tính phí trễ cho các item được thực nhận ở lần đó.
- Phí trễ lấy từ policy snapshot của đơn: `ceil(max(0, returned_at - planned_due_at - late_grace_minutes) / 24 giờ)` kỳ đã bắt đầu × tỷ lệ phí × tiền thuê đã giảm giá của item; không vượt 100% tiền thuê item đó. Giảm giá đơn được phân bổ theo tỷ trọng tiền thuê từng item.
- Phí trễ là khoản `EXTRA`; không tự động trừ cọc. Cọc được quyết toán riêng sau khi kiểm tra theo quy trình hoàn/khấu trừ đã chốt.
- Sau nhận trả, unit vẫn cần sạch/kiểm tra và chuyển sang `READY`, `CLEANING`, `REPAIR` hoặc `RETIRED` theo kết quả thực tế.

Ma trận chuyển trạng thái chính:

| Trạng thái hiện tại | Thao tác | Trạng thái tiếp theo | Điều kiện chính |
| --- | --- | --- | --- |
| `DRAFT` | Gửi yêu cầu | `PENDING_CONFIRMATION` | Dữ liệu đơn hợp lệ. |
| `PENDING_CONFIRMATION` | Xác nhận | `CONFIRMED` | Staff đúng branch; kiểm tra lại unit và lịch trong transaction. |
| `PENDING_CONFIRMATION` | Từ chối | `REJECTED` | Có lý do từ chối. |
| `DRAFT`/`PENDING_CONFIRMATION`/`CONFIRMED` | Hủy | `CANCELLED` | Theo quyền và policy; refund xử lý riêng. |
| `CONFIRMED` | Chuẩn bị | `PREPARING` | Unit đã được gán hợp lệ. |
| `PREPARING` | Sẵn sàng giao | `READY_FOR_PICKUP` | Đã kiểm đủ unit/phụ kiện. |
| `READY_FOR_PICKUP` | Giao cho khách | `ACTIVE` | Đủ payment/deposit theo policy. |
| `READY_FOR_PICKUP` | Đánh dấu không đến | `NO_SHOW` | Quá grace period theo lịch branch. |
| `ACTIVE` | Nhận trả | `RETURN_INSPECTION` | Ghi nhận item được trả và tình trạng. |
| `RETURN_INSPECTION` | Quyết toán | `COMPLETED` | Không còn item ở khách; phí, cọc, refund/công nợ có kết quả rõ ràng. |

Không cho `ACTIVE → CANCELLED`, `COMPLETED → ACTIVE` hoặc `REJECTED → CONFIRMED`. Với partial return, order có thể vẫn `ACTIVE` khi một số item đã được nhận trả.

## 9. Gia hạn và sửa đơn

- Gia hạn áp dụng cho toàn bộ đơn đang `ACTIVE`, không gia hạn riêng một item trong MVP.
- Trước khi gia hạn phải kiểm tra lại availability của tất cả unit, lịch branch, policy và khoản phụ thu; chỉ cập nhật khi toàn bộ điều kiện đều hợp lệ.
- Đổi ngày, variant/size hoặc unit sau khi xác nhận chỉ được thực hiện trước khi giao (`ACTIVE`) và phải release/re-allocate atomically.
- Mọi amendment phải tính lại tiền thuê, cọc, promotion và snapshot liên quan; người dùng phải thấy chênh lệch trước khi xác nhận.
- Không đổi trực tiếp unit/size sau khi đơn đã `ACTIVE`; nếu cần, xử lý bằng flow trả và tạo đơn mới. Exchange sau khi giao để phase sau.

## 10. No-show, trả trễ và hủy

- Đơn `READY_FOR_PICKUP` quá `planned_start_at + no_show_grace_minutes` có thể chuyển `NO_SHOW` và giải phóng unit.
- Trả sau `planned_due_at + late_grace_minutes` phát sinh phí theo công thức ở mục 8, dựa trên policy snapshot. Ân hạn tính phí và đệm lịch nội bộ là hai cấu hình độc lập.
- Đơn chưa xác nhận được hủy miễn phí.
- Đơn đã xác nhận áp dụng `free_cancel_before_hours` và `late_cancel_fee_percent`.
- Đơn đã `ACTIVE` không còn hủy; phải xử lý theo flow trả đồ.
- Hủy đơn không đồng nghĩa hoàn tiền; refund là giao dịch riêng.

## 11. Policy và promotion

- `rental_policy_versions` là policy toàn chuỗi, bất biến sau khi có đơn tham chiếu.
- Các khoảng hiệu lực policy không được chồng nhau.
- Thay policy bằng cách đóng phiên bản hiện tại và thêm phiên bản mới.
- Order lưu `policy_version_id`, nên thay đổi sau này không làm đổi đơn cũ.
- `late_grace_minutes` dùng để tính phí với khách. `late_return_buffer_minutes` dùng để bảo vệ lịch cho lần thuê sau; kết hợp với thời gian vệ sinh theo variant bằng giá trị lớn hơn, không cộng chồng.
- Mỗi đơn có tối đa một promotion; mã và số tiền giảm được snapshot khi xác nhận.

## 12. Thanh toán và refund

- `payments` là tiền thực nhận hoặc đang xử lý, tách theo `RENTAL`, `DEPOSIT`, `EXTRA`.
- `SUCCEEDED` yêu cầu `paid_at`.
- Tiền mặt/chuyển khoản ghi thủ công yêu cầu `recorded_by`.
- Gateway yêu cầu `provider_payment_id`; webhook phải xác minh chữ ký và xử lý idempotent.
- `refunds` luôn tham chiếu payment nguồn đã thành công.
- Tổng refund `COMPLETED` không được vượt số tiền payment nguồn.
- Refund trong MVP là thủ công: staff có permission `payments.refund` chuyển tiền ngoài hệ thống rồi mới ghi nhận refund `COMPLETED`.
- Không có bước manager duyệt và không gọi API refund tự động của SePay trong MVP.
- Backend tự tính mức hoàn tối đa từ các payment `SUCCEEDED`, ưu tiên phần cọc/chuyển dư, sau khi trừ phí phải thu và refund `COMPLETED` trước đó. Staff không được ghi vượt mức này.
- Refund phải lưu payment nguồn, số tiền, lý do, người thực hiện, thời điểm và mã tham chiếu chuyển tiền. Nếu cần lưu lần chuyển thất bại thì dùng trạng thái `FAILED`, không ghi `COMPLETED`.
- Giao dịch tiền đã thành công không được sửa số tiền trực tiếp; sai sót được xử lý bằng bản ghi điều chỉnh/reversal có tham chiếu.
- Payment/refund và quan hệ giao dịch cốt lõi dùng `ON DELETE RESTRICT`.

## 13. Hư hỏng, cọc và công nợ

- Nhân viên nhận trả ghi tình trạng, đồ thiếu/hỏng, ảnh/bằng chứng và ghi chú; không tự đoán phí nếu chưa đủ căn cứ.
- Trường hợp chưa định giá chuyển sang `PENDING_ASSESSMENT`; khoản cọc liên quan tiếp tục được giữ, chưa hoàn tất quyết toán.
- Branch Manager chốt phí trong thời hạn vận hành đã cấu hình; phí không được vượt giá thay thế snapshot nếu policy không cho phép.
- Số tiền phải thu thêm bằng tổng tiền thuê/phụ thu/phí sau điều chỉnh trừ số tiền đã thanh toán hợp lệ và phần cọc được dùng để bù trừ.
- Nếu phí vượt phần cọc/tiền đã thanh toán, phần còn lại trở thành outstanding balance của Customer.
- Customer còn outstanding balance không được xác nhận đơn mới cho đến khi thanh toán hoặc được người có permission miễn/giảm; vẫn có thể xem hồ sơ và giải quyết công nợ.
- Khi có tranh chấp, giữ assessment và bằng chứng, có thể mở CRM case; không xóa hay sửa mất kết quả cũ.

## 14. CRM ban đầu

CRM MVP gồm:

- `customers`: mã khách, chi nhánh ưu tiên, ngày sinh, số đo và ghi chú nội bộ.
- `customer_interactions`: timeline tương tác append-only.
- `crm_cases`: phiếu hỗ trợ/khiếu nại.
- `crm_case_history`: lịch sử trạng thái và người phụ trách.

Campaign, consent, tag và loyalty chưa nằm trong schema hiện tại; chỉ bổ sung khi có yêu cầu nghiệp vụ rõ ràng.

## 15. Báo cáo và truy vết nghiệp vụ

- MVP không triển khai audit module/audit log riêng.
- Các bảng nghiệp vụ phải giữ những field cần thiết để vận hành và đối soát: actor (`recordedBy`, `processedBy`, `requestedBy`...), thời gian, trạng thái, lý do và mã tham chiếu.
- Doanh thu dựa trên payment `SUCCEEDED`, không bao gồm deposit đang giữ; chỉ refund `COMPLETED` mới làm giảm số tiền thực thu trong báo cáo.
- Báo cáo lịch sử vẫn phải hiển thị branch, user, catalog/unit đã inactive hoặc retired bằng snapshot/tham chiếu còn hiệu lực.

## 16. Chính sách xóa

- Actor vận hành và ngữ cảnh tùy chọn: `SET NULL` để giữ lịch sử.
- Bảng con hoàn toàn phụ thuộc cha: `CASCADE`.
- Order, payment, refund và liên kết nghiệp vụ cốt lõi: `RESTRICT`.
- Trong vận hành bình thường, ưu tiên đổi trạng thái `INACTIVE`, `TERMINATED` hoặc `RETIRED` thay vì xóa vật lý.

## 17. Ngoài phạm vi MVP

- Tự động refund qua SePay hoặc ngân hàng.
- Customer merge tự động/thủ công trong sản phẩm.
- Audit log tổng quát.
- Giao tận nơi, nhận/trả khác chi nhánh và partial handover.
- Exchange unit/size sau khi đơn đã `ACTIVE`.
- Campaign marketing, loyalty và CRM nâng cao.


## 16. Trả trễ giữa hai đơn và khuyến nghị pilot

Trong lần bàn giao, backend phải khóa và kiểm tra lại unit được phân công: đúng variant/chi nhánh, đang `READY`, không có phân bổ đang thuê khác, block hiện hành hoặc điều chuyển. Nếu khách A chưa trả mà khách B đến nhận cùng barcode, trả conflict `UNIT_STILL_WITH_CUSTOMER`; B vẫn `READY_FOR_PICKUP`, không tạo phân bổ `ACTIVE` thứ hai. Nhân viên có thể phân công lại cho barcode `READY` khác cùng variant/chi nhánh. Nếu không có, không giao sai bộ; liên hệ khách và xử lý theo phương án lịch/đơn đã được studio duyệt.

Trước khi thu tiền tại bước bàn giao, giao diện gọi kiểm tra sẵn sàng. API bàn giao vẫn tự kiểm tra lại trong transaction. Nếu một lỗi phát sinh sau lần kiểm tra trước và payment đã được ghi nhận, giữ payment cùng đơn để đối soát; không tự xóa giao dịch hoặc tự hoàn tiền.

**Mức pilot chưa được chủ studio duyệt, không phải giá trị tự bật:** đề xuất ân hạn 60 phút; 30% tiền thuê đã giảm giá của từng bộ cho mỗi kỳ 24 giờ trễ đã bắt đầu; giới hạn tối đa bằng 100% tiền thuê bộ; đệm lịch toàn chuỗi tối thiểu 24 giờ, lấy mức lớn hơn với thời gian vệ sinh của variant. Migration thêm field đệm lịch mặc định 0 nên không thay đổi policy đang hiệu lực. Chỉ tạo policy version mới sau khi studio duyệt và chọn ngày hiệu lực.

Chi tiết cách tính, các ví dụ đối chiếu và cách đo pilot nằm trong [Chính sách đệm lịch và xử lý đơn kế tiếp](chinh-sach-tra-tre-va-don-thue-ke-tiep.md).