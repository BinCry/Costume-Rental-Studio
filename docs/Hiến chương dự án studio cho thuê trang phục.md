# Hiến chương dự án — Hệ thống quản lý studio cho thuê trang phục

**Phiên bản:** 1.0  
**Ngày lập:** 05/10/2026  
**Thời gian kế hoạch:** 01/09/2026–31/12/2026  
**Trạng thái:** Bản cơ sở đề xuất; ngày trong tháng 9 là mốc kế hoạch ban đầu và cần cập nhật trạng thái thực tế trên Jira.

## 1. Mục đích dự án

Xây dựng một ứng dụng web dùng chung cho khách và nhân viên của chuỗi studio. Ứng dụng cho phép khách tìm trang phục theo chi nhánh và thời gian, gửi yêu cầu thuê; nhân viên xác nhận bộ cụ thể, giao đồ, ghi nhận tiền thuê và tiền cọc, nhận trả và xử lý tình trạng từng bộ. Quản trị viên quản lý danh mục, nhân sự, quyền và hoạt động giữa các chi nhánh.

Hệ thống phải theo dõi **từng bộ trang phục vật lý** bằng mã riêng. Một bộ không được xác nhận cho hai đơn có thời gian thuê chồng lấn. Tài khoản nhân viên có quyền theo vai trò và chi nhánh được phân công; khách chỉ truy cập đơn và hồ sơ của mình.

## 2. Phạm vi cấp cao

### Bao gồm

1. **Khu khách hàng:** đăng nhập Google; xem, tìm và lọc trang phục theo loại/size/màu; chọn chi nhánh và kỳ thuê; xem báo giá; gửi, theo dõi và hủy yêu cầu khi trạng thái cho phép.
2. **Đơn thuê:** tạo đơn online hoặc tại quầy; nhân viên duyệt yêu cầu online; kiểm tra khả dụng và gán barcode cụ thể; lưu snapshot giá, cọc, số ngày và chính sách tại thời điểm xác nhận.
3. **Quản lý bộ trang phục:** quản lý mẫu, biến thể, giá theo ngày, cọc, phụ kiện và mô tả; quản lý từng bộ vật lý, chi nhánh, trạng thái sẵn sàng/vệ sinh/sửa chữa; tạo block bảo trì và điều chuyển có bước xuất/nhận.
4. **Giao, trả và tiền:** checklist bộ/phụ kiện; ghi nhận tiền thuê và cọc khi giao bằng tiền mặt hoặc chuyển khoản thủ công; theo dõi bộ đang ở khách; kiểm tra trả đủ/trả một phần, ghi hư hỏng/thiếu/trễ, xem trước quyết toán và ghi nhận hoàn cọc sau khi kiểm tra.
5. **Vận hành chuỗi:** danh sách công việc theo chi nhánh; quản lý nhân viên, tài khoản, phân công; checkbox cấu hình quyền theo vai trò và gán vai trò theo chi nhánh.
6. **CRM và quản trị:** hồ sơ khách, lịch sử thuê, tương tác và case; quản lý chi nhánh, chính sách, báo cáo cơ bản; ghi dấu vết thao tác nhạy cảm.
7. **Chất lượng và bàn giao:** giao diện thích ứng điện thoại/máy tính; trạng thái tải/rỗng/lỗi/xung đột; tài liệu yêu cầu, thiết kế, hướng dẫn chạy/demo và bộ kiểm thử nghiệm thu.

### Không bao gồm trong phiên bản này

- Đặt studio chụp ảnh, thuê phòng, make-up hoặc bán trang phục.
- Giao trang phục đến nhà hoặc nhận trả khác chi nhánh.
- Thu tiền qua cổng thanh toán trực tuyến, tự động đối soát ngân hàng hoặc tự động hoàn tiền. MVP chỉ ghi nhận tiền mặt/chuyển khoản thủ công sau khi nhân viên đối chiếu.
- Chiến dịch marketing tự động, tích điểm, dự báo nhu cầu, tính lương, mua hàng/nhà cung cấp.
- Ứng dụng native cho iOS/Android.

## 3. Sản phẩm bàn giao cấp cao và công nghệ

| Sản phẩm bàn giao | Mô tả cụ thể | Nền tảng/công nghệ |
|---|---|---|
| Ứng dụng web khách hàng và nhân viên | SPA cho catalog, yêu cầu thuê, đơn của khách, bảng việc, xử lý đơn, kho, CRM và quản trị; hỗ trợ desktop và mobile | React 19, TypeScript, Vite 8, Tailwind CSS 4 |
| API nghiệp vụ | API xác thực, danh mục/khả dụng/báo giá, đơn thuê, gán bộ, giao/trả, tiền/cọc, kho, phân quyền, CRM và báo cáo | Node.js 22+, TypeScript, Express 5 |
| Cơ sở dữ liệu | Dữ liệu người dùng/Google identity, chi nhánh, role/permission, mẫu/biến thể/bộ, đơn, giao nhận, thanh toán, CRM, audit; migration và seed | PostgreSQL 16, Prisma 7 |
| Tài liệu phân tích và thiết kế | Quy tắc nghiệp vụ, use case, yêu cầu, mô hình dữ liệu, hợp đồng API, ma trận role/quyền, kiến trúc và hướng dẫn chạy | Markdown, DBML, sơ đồ Mermaid trong kho mã |
| Bộ nghiệm thu | Kịch bản đặt thuê, duyệt/gán bộ, giao/thu, đang thuê, trả/quyết toán, kho, phân quyền và CRM; bằng chứng test và danh sách lỗi | Kiểm thử tự động và thủ công trên web app |
| Gói bàn giao chạy được | Mã nguồn, cấu hình ví dụ không chứa bí mật, hướng dẫn cài đặt/chạy, dữ liệu demo và hướng dẫn triển khai | pnpm workspace; môi trường triển khai sẽ chốt trước phát hành |

**Phân định:** React/Vite chạy phía trình duyệt; Express cung cấp API; PostgreSQL lưu dữ liệu giao dịch; Prisma quản lý mô hình và migration. Xác thực Google phải được API xác minh; frontend không tự quyết định quyền. Mọi nội dung hiện đang dùng fixture là bản trình diễn cho đến khi API được nối.

## 4. Mốc chính

Các ngày dưới đây là baseline kế hoạch theo yêu cầu thời gian tháng 9–12 năm 2026, dùng ngày bắt đầu/kết thúc cụ thể và tính theo ngày lịch.

| Mốc | Bắt đầu | Kết thúc | Tiêu chí hoàn thành |
|---|---:|---:|---|
| M1 — Duyệt hiến chương và phạm vi | 01/09/2026 | 05/09/2026 | Thống nhất mục tiêu, ngoài phạm vi, stakeholder, đầu ra và tiêu chí nghiệm thu. |
| M2 — Chốt yêu cầu nghiệp vụ và use case | 06/09/2026 | 20/09/2026 | Luồng thuê, vai trò, ngoại lệ, dữ liệu và tiêu chí nghiệm thu được rà soát. |
| M3 — Chốt kiến trúc và nền dữ liệu | 10/09/2026 | 30/09/2026 | Kiến trúc FE/BE, ERD, schema, migration/seed được kiểm tra. |
| M4 — Hoàn tất UI fixture và audit | 15/09/2026 | 05/10/2026 | Các route UI chính, trạng thái lỗi và responsive được kiểm tra; báo cáo UX được lưu. |
| M5 — API nền, đăng nhập và phân quyền | 06/10/2026 | 20/10/2026 | API contract, phiên Google, kiểm quyền và phạm vi chi nhánh có thể demo. |
| M6 — Catalog, khả dụng và báo giá | 15/10/2026 | 31/10/2026 | API catalog/availability/quote nối được hành trình khách hàng. |
| M7 — Đơn thuê, kho, giao và trả | 26/10/2026 | 23/11/2026 | Xác nhận/gán bộ, block/điều chuyển, giao, theo dõi đang thuê, trả một phần và ghi nhận tình trạng chạy qua API. |
| M8 — Thanh toán, CRM và báo cáo MVP | 03/11/2026 | 24/11/2026 | Thu tiền thủ công, trạng thái cọc, case CRM và báo cáo cơ bản được nối; chính sách hoàn được xác nhận. |
| M9 — Kiểm thử tích hợp và UAT | 21/11/2026 | 19/12/2026 | Regression, kiểm quyền/phạm vi, sửa lỗi P0/P1 và người đại diện nghiệp vụ nghiệm thu. |
| M10 — Bàn giao/demo | 20/12/2026 | 31/12/2026 | Tài liệu chạy/demo, dữ liệu demo, danh sách giới hạn và biên bản bàn giao được cập nhật. |

## 5. Chỉ số nghiệm thu cấp dự án

- Không thể xác nhận hai đơn cho cùng một bộ vật lý trong các kỳ thuê chồng lấn.
- Nhân viên chỉ xem/thao tác ở chi nhánh được cấp quyền; khách chỉ xem dữ liệu của mình.
- Mỗi khoản tiền thuê, cọc, phí, cấn trừ và hoàn được thể hiện riêng; cọc đang giữ không tính vào doanh thu.
- Một lượt trả một phần giữ rõ bộ còn ở khách và chưa quyết toán cọc sớm.
- Các luồng P0 hoàn thành trên Chrome desktop và màn hình mobile phổ biến; có phản hồi rõ cho tải, rỗng, lỗi và xung đột.
- Không có lỗi P0/P1 còn mở tại nghiệm thu; lỗi thấp hơn được ghi vào danh sách sau phát hành.

## 6. Giả định, ràng buộc và điểm cần quyết định

| Mục | Cơ sở/giả định | Ảnh hưởng |
|---|---|---|
| Ngày thuê | Giá tính theo ngày; chính sách ngày lịch/24 giờ phải cấu hình theo nghiệp vụ đã duyệt. | API là nguồn tính số ngày và báo giá; UI không tự tính lệch. |
| Đơn online chờ duyệt | Theo đề xuất BA, chưa giữ bộ; chỉ gán bộ lúc nhân viên xác nhận. | Tránh giữ tồn vô hạn; cần hiển thị rõ cho khách. |
| Chi nhánh | Nhận và trả cùng một chi nhánh. | Không đưa vận chuyển/đổi chi nhánh vào phạm vi MVP. |
| Chuyển khoản | Nhân viên đối chiếu và ghi nhận thủ công. | Không hiển thị đã thu chỉ dựa vào ảnh/chuyển khoản do khách cung cấp. |
| Hoàn cọc | Chỉ sau kiểm tra và quyết toán; phương thức hoàn chưa chốt. | Cần quyết định trước khi hoàn tất M8; có thể ảnh hưởng UAT và phát hành. |
| Lịch thực hiện | Ngày tháng 9 là baseline được yêu cầu, đã qua tại ngày lập 05/10/2026. | PM cập nhật trạng thái/actual dates trên Jira để phân biệt kế hoạch và tiến độ thật. |
| Nhân sự/chi phí | Chưa có phân công người, effort hoặc ngân sách được xác nhận. | WBS Jira cần điền owner/capacity sau khi nhóm thống nhất; lịch chỉ là lịch mục tiêu. |

## 7. Quản trị thay đổi và rủi ro

- Thay đổi phạm vi sau M2 cần ghi lý do, ảnh hưởng thời gian và phụ thuộc trên Jira trước khi đưa vào sprint.
- Rủi ro lớn: chưa chốt chính sách thuê/ngày, hoàn cọc; API và Google OAuth chưa hoàn thành; tranh chấp trạng thái bộ giữa nhiều nhân viên; thiếu dữ liệu/ảnh trang phục thật.
- Mỗi ticket Jira cần có người phụ trách, ngày bắt đầu, ngày kết thúc, tiêu chí nghiệm thu, Epic cha và liên kết phụ thuộc khi có.
- Người quản lý dự án theo dõi mốc tuần; mốc trượt trên 3 ngày lịch cần cập nhật lại chuỗi phụ thuộc và thông báo stakeholder.

## 8. Phê duyệt

| Vai trò | Người duyệt | Trạng thái/ngày |
|---|---|---|
| Đại diện chủ studio/nghiệp vụ | Chưa chỉ định | Chờ duyệt |
| Quản lý dự án | Chưa chỉ định | Chờ duyệt |
| Đại diện kỹ thuật | Chưa chỉ định | Chờ duyệt |
