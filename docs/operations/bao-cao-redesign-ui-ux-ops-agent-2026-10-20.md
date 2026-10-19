# Báo cáo audit và redesign UI/UX Ops Agent

**Dự án:** Costume Rental Studio  
**Ngày:** 20/10/2026  
**Phạm vi:** Giao diện Ops Agent, trạng thái chat và điều hướng dùng chung. Không thay đổi API, nghiệp vụ, xác thực, database hoặc triển khai production.

## 1. Kết quả audit trước khi sửa

| Mức | Phát hiện có bằng chứng | Tác động | Hướng xử lý |
| --- | --- | --- | --- |
| P1 | API mode khởi tạo bằng một tin nhắn chào chung. Khi chưa có câu hỏi, trang vẫn mang hình thức chat đã bắt đầu; phần nội dung trống lớn, gợi ý và ô nhập chưa tạo thành một welcome state có chủ đích. | Nhân viên khó nhận ra nên hỏi gì và giao diện có cảm giác dang dở. | Bỏ tin nhắn mẫu trong API mode; thêm welcome state riêng với 4 câu hỏi theo nghiệp vụ và composer đi cùng workspace. |
| P1 | Class trạng thái rỗng từng được ghép thành `ops-chat-threadops-chat-thread-empty`. DOM tại local preview xác nhận CSS cho trạng thái rỗng không khớp, nên bố cục welcome không được áp dụng. | Thay đổi giao diện trước đó không xuất hiện đúng như thiết kế. | Tạo class từ danh sách và ghép bằng dấu cách; xác minh DOM nhận `ops-chat-thread ops-chat-thread-empty`. |
| P1 | Quy tắc điều hướng desktop được khai báo trước một nhóm CSS cũ đặt menu ở trạng thái đóng mặc định và ẩn sidebar. Theo thứ tự cascade, sidebar desktop vẫn có thể bị ẩn khi hamburger bị loại bỏ. | Có nguy cơ mất lối vào các màn vận hành trên desktop. | Đặt quy tắc rail desktop sau nhóm quy tắc drawer cũ; giữ drawer ở màn hình nhỏ. |
| P1 | Composer nằm cuối một vùng chat có chiều cao tối thiểu lớn. Với phần đầu trang, cảnh báo và viewport thấp, ô nhập có thể bị đẩy khỏi màn hình đầu tiên. | Nhân viên phải cuộn trang mới tiếp tục chat. | Dùng chiều cao workspace theo `100dvh`, hạ ngưỡng tối thiểu theo breakpoint; giữ thread cuộn riêng và composer ở chân workspace. |
| P2 | Gợi ý và header chiếm thêm diện tích trên màn nhỏ; một số chuỗi dài có nguy cơ làm bố cục dày hoặc tràn ngang. | Khó dùng trên điện thoại và tablet. | Chuyển gợi ý thành một cột dưới 760px; giới hạn chiều rộng nội dung, cho textarea tự tăng tối đa 152px và để hint tự xuống dòng. |
| P2 | Trường hợp tải lại trang khi còn mã yêu cầu nhưng không có transcript có thể tạo cảm giác hội thoại bị mất hoặc không biết cần làm gì. | Nhân viên không biết trạng thái cũ và bước tiếp theo. | Hiển thị màn tiếp tục yêu cầu, dẫn tới xem trạng thái; chỉ cung cấp thao tác yêu cầu mới khi trạng thái terminal đã được xác nhận. |

Không phát hiện yêu cầu nào cần đổi nghiệp vụ hoặc API. Lỗi gửi/API, phân quyền, xác nhận và đối soát hiện hữu được giữ nguyên; việc gửi thật cần một phiên API có chi nhánh được máy chủ xác nhận.
Không phát hiện vấn đề P0 trong phạm vi UI được kiểm tra.

### Rà soát theo khía cạnh

| Khía cạnh | Quan sát trước khi sửa | Kết quả |
| --- | --- | --- |
| Thứ bậc và bố cục | Lời chào chung và gợi ý nằm trong luồng chat nhưng không có trạng thái mở đầu riêng; vùng đọc rộng, composer khó thấy khi viewport thấp. | Welcome có headline, mô tả, prompt và composer trong một workspace; vùng chat có cuộn riêng. |
| Chữ, khoảng cách, màu | Brand berry/pink đã có trong token; một số trạng thái và gợi ý chưa phân cấp đủ, khoảng trống do thread rỗng không có mục đích. | Giữ token hiện có, dùng berry cho điểm nhấn và active/focus; dùng lại hierarchy, spacing hiện hữu và giới hạn độ rộng nội dung. |
| Điều hướng | Quy tắc desktop và drawer mobile bị chồng thứ tự CSS; sidebar có thể bị ẩn ở desktop. | Rail desktop cố định; drawer chỉ dùng dưới 1200px và đã thử mở/đóng trên trình duyệt local. |
| Trò chuyện và khả năng tìm thấy thao tác | API mode không có empty state riêng; gợi ý chỉ là một hàng phụ. | Bốn prompt dùng được để điền nội dung, không gửi hộ người dùng. Tin nhắn, nguồn và trạng thái nghiệp vụ vẫn đi qua component hiện có. |
| Phản hồi, lỗi và quy trình | Cảnh báo thiếu chi nhánh đã có; trạng thái yêu cầu sau tải lại chưa có nội dung transcript. | Giữ cảnh báo và disable gửi khi thiếu branch; thêm resume state trung thực khi không có transcript, không giả kết quả thành công. |
| Responsive và accessibility | Giao diện cần kiểm tra dải hẹp, focus, nhãn và thao tác bàn phím. | Đo viewport 320–1920px, không tràn ngang; dùng heading/label/log semantic, giữ focus sau prompt và tôn trọng reduced motion. Chưa chạy đánh giá screen reader/WCAG chuyên dụng. |

## 2. Quyết định thiết kế

- **Bố cục:** tiêu đề Ops Agent và ngữ cảnh chi nhánh ở đầu trang; một workspace hội thoại liền mạch; thread cuộn độc lập; composer gắn ở cuối workspace.
- **Welcome:** câu dẫn “Hôm nay bạn cần hỗ trợ gì?”, mô tả ngắn và bốn prompt vận hành. Prompt điền vào composer và đưa focus tới đó, không gửi thay người dùng.
- **Hội thoại đang hoạt động:** giữ thứ tự tin nhắn, phân biệt nhân viên/trợ lý, hỗ trợ Markdown và bảng có vùng cuộn; nguồn, trạng thái yêu cầu và cảnh báo tiếp tục theo dữ liệu API.
- **Đang tiếp tục yêu cầu:** nếu backend trả mã yêu cầu nhưng không có lịch sử tin nhắn, hiển thị trạng thái tiếp tục và nút kiểm tra yêu cầu. Không tự dựng transcript.
- **Composer:** Enter gửi, Shift+Enter xuống dòng; không gửi khi IME đang nhập; chống gửi lặp theo trạng thái hiện có; tự tăng chiều cao; giữ nhãn truy cập và thông báo dữ liệu an toàn.
- **Điều hướng:** sidebar cố định, không cuộn theo nội dung ở desktop từ 1200px; dưới ngưỡng đó dùng drawer hiện có. Không đổi cấu trúc route hay quyền truy cập.
- **Màu và chuyển động:** dùng token màu berry/pink và bề mặt hiện có; hover/focus tiết chế; tắt chuyển động mới khi người dùng bật reduced motion.

## 3. Phần đã triển khai

- API mode bắt đầu ở trạng thái rỗng thực sự, thay vì một câu trả lời mẫu.
- Thêm welcome state và bốn prompt theo nghiệp vụ.
- Bổ sung giao diện tiếp tục yêu cầu khi transcript không được tải lại; tránh lặp CTA tạo yêu cầu mới.
- Tự co giãn textarea, xử lý composition trước khi gửi, và giữ composer ở cuối vùng chat.
- Điều chỉnh chiều cao workspace theo viewport; gợi ý chuyển sang một cột ở màn nhỏ.
- Sửa ghép class trạng thái rỗng để CSS áp dụng thật.
- Đưa quy tắc sidebar desktop về cuối stylesheet để thắng các quy tắc drawer cũ; giữ nút hamburger và drawer dưới 1200px.
- Không sửa service Agent, API contract, quyền, fixture adapter hoặc quy tắc nghiệp vụ.

## 4. QA và bằng chứng

### Kiểm tra tự động

| Kiểm tra | Kết quả |
| --- | --- |
| Prettier cho TSX và CSS đã sửa | PASS |
| ESLint toàn bộ `apps/web` | PASS |
| TypeScript project references | PASS |
| Vite production build | PASS — 300 module được đóng gói |
| Web tests | PASS — 6 file, 52 test |
| `git diff --check` | PASS |

### Kiểm tra trên trình duyệt local

- API mode hiển thị welcome state, tiêu đề truy cập được và đủ bốn prompt.
- Bấm prompt điền đúng nội dung vào composer và chuyển focus tới ô nhập.
- Shift+Enter thêm dòng; textarea tăng chiều cao trong giới hạn CSS.
- Class trạng thái rỗng được xác nhận trực tiếp trong DOM: `ops-chat-thread ops-chat-thread-empty`.
- Ở desktop 1440px, sidebar rộng 256px hiển thị và hamburger được ẩn. Ở 375px, menu mở thành drawer; bấm vùng ngoài và Escape đều đóng được.
- Đã mở màn Bảng việc bằng cùng shell nhân viên ở 1440px; sidebar vẫn hiển thị, nội dung chính không đè lên menu và `scrollWidth` không vượt viewport.
- Đã giả lập chiều rộng 320, 375, 768, 1024, 1440 và 1920px. Không có tràn ngang; prompt chuyển một cột ở 320/375px và hai cột từ 768px.
- Trong fixture mode, các khu vực Ops Agent vẫn có đủ: Tổng quan, Hàng đợi, Quy trình, Tra cứu tri thức, Nhật ký, Hỏi Agent và Hồ sơ Agent.
- Vite build vẫn cảnh báo bundle JavaScript khoảng 813 kB vượt ngưỡng gợi ý 500 kB; build thành công. Tách bundle là việc tối ưu toàn ứng dụng, nằm ngoài phạm vi redesign màn này.
- Vite dev server có cảnh báo Fast Refresh phải tải lại module do `canContinueOpsAgentCase` được export cùng component; tải lại trang khôi phục bình thường, không ảnh hưởng production build.

### Giới hạn cần biết

- Không gửi câu hỏi đến backend trong lần QA này: local API mode chưa có phiên đăng nhập/chi nhánh được máy chủ xác nhận. Composer được giữ lại và nút gửi vẫn disabled như yêu cầu của giao diện khi thiếu ngữ cảnh.
- Vì vậy, trạng thái phản hồi thật, timeout, retry và quyền từ chối API chưa được kiểm thử đầu-cuối trên production. Không dùng fixture để giả làm kết quả API.
- Kích thước mobile được giả lập theo viewport; chưa kiểm tra bàn phím ảo trên thiết bị thật hoặc trình đọc màn hình chuyên dụng.
- Sidebar đã kiểm tra hành vi drawer trên local và bố cục desktop trong cùng ứng dụng; chưa xác minh tài khoản production.

## 5. File thay đổi

- `apps/web/src/pages/OpsAgentPage.tsx`
- `apps/web/src/index.css`
- `docs/operations/bao-cao-redesign-ui-ux-ops-agent-2026-10-20.md`

## 6. Trạng thái bàn giao

Thay đổi đang ở working tree của checkout hiện tại, chưa commit, chưa push và chưa deploy. Không cần migration hay thay đổi cấu hình production. Trước khi phát hành, cần đăng nhập bằng tài khoản nhân viên có chi nhánh hợp lệ để kiểm thử gửi câu hỏi, phản hồi thật, lỗi API, retry và quyền truy cập.
