export type OpsSourceStatus = 'Tài liệu mô tả' | 'Minh họa' | 'Cần xác minh';

export interface OpsKnowledgeSource {
  id: string;
  title: string;
  type: string;
  topic: string;
  status: OpsSourceStatus;
  summary: string;
  body: string;
}

export interface OpsWorkflow {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  sources: string[];
  status: OpsSourceStatus;
}

export interface OpsAgentReply {
  text: string;
  sourceIds: string[];
}

export const opsAgentSources: OpsKnowledgeSource[] = [
  {
    id: 'product-scope',
    title: 'Mô tả phạm vi Costume Rental Ops Agent',
    type: 'Tài liệu sản phẩm',
    topic: 'Phạm vi',
    status: 'Tài liệu mô tả',
    summary: 'Trợ lý cung cấp hướng dẫn tham khảo, không thay nhân viên xác nhận nghiệp vụ.',
    body: 'Bản mô tả sản phẩm định hướng giao diện dùng dữ liệu fixture, hiển thị rõ trạng thái demo và chưa có kết nối mô hình hay dịch vụ vận hành.',
  },
  {
    id: 'request-checklist',
    title: 'Checklist minh họa · Yêu cầu thuê',
    type: 'Checklist demo',
    topic: 'Đơn thuê',
    status: 'Minh họa',
    summary: 'Gợi ý đối chiếu thông tin yêu cầu và xem trạng thái trên đơn gốc.',
    body: 'Checklist này chỉ là nội dung minh họa để thiết kế UI. Nhân viên cần đối chiếu đơn và lịch trên hệ thống Studio trước khi xử lý.',
  },
  {
    id: 'handover-checklist',
    title: 'Checklist minh họa · Giao trang phục',
    type: 'Checklist demo',
    topic: 'Giao nhận',
    status: 'Minh họa',
    summary: 'Gợi ý kiểm tra đơn, mã bộ và thông tin giao nhận đã được xác nhận.',
    body: 'Checklist này không ghi nhận giao đồ hay thanh toán. Thao tác và kết quả chỉ được xác nhận trong hệ thống nghiệp vụ.',
  },
  {
    id: 'return-checklist',
    title: 'Checklist minh họa · Nhận lại trang phục',
    type: 'Checklist demo',
    topic: 'Trả đồ',
    status: 'Minh họa',
    summary: 'Gợi ý ghi nhận tình trạng thực tế và đối chiếu chính sách đã duyệt.',
    body: 'Chính sách kiểm tra, khấu trừ và hoàn cọc cần được Studio xác nhận. Trợ lý không tính hoặc xác nhận khoản hoàn.',
  },
  {
    id: 'payment-checklist',
    title: 'Checklist minh họa · Đối chiếu chuyển khoản',
    type: 'Checklist demo',
    topic: 'Thanh toán',
    status: 'Cần xác minh',
    summary: 'Cần chốt nguồn đối chiếu, người xác nhận và trạng thái giao dịch.',
    body: 'Nguồn dữ liệu ngân hàng, cách đối soát và quyền xác nhận giao dịch chưa được cấu hình trong bản demo. Không đánh dấu đã thu tiền từ nội dung hướng dẫn này.',
  },
  {
    id: 'policy-decisions',
    title: 'Các chính sách cần Studio xác nhận',
    type: 'Điểm cần chốt',
    topic: 'Chính sách',
    status: 'Cần xác minh',
    summary: 'Chu kỳ tính ngày, giữ bộ khi chờ duyệt và quyết toán cọc vẫn là quyết định nghiệp vụ.',
    body: 'Các quyết định này chưa được xem như chính sách có hiệu lực. Nhân viên cần dùng chính sách đã được Studio phê duyệt trong hệ thống hiện hành.',
  },
  {
    id: 'safety-direction',
    title: 'Nguyên tắc an toàn cho trợ lý vận hành',
    type: 'Định hướng thiết kế',
    topic: 'An toàn',
    status: 'Tài liệu mô tả',
    summary: 'Không tự thay đổi đơn, trạng thái bộ, giao dịch hoặc hồ sơ khách hàng.',
    body: 'Dữ liệu khách hàng và nội dung ghi chú cần được xem là dữ liệu không đáng tin cậy. Bản demo không có quyền ghi và không gửi dữ liệu tới dịch vụ AI.',
  },
];

export const opsAgentWorkflows: OpsWorkflow[] = [
  {
    id: 'request',
    title: 'Yêu cầu thuê online',
    summary: 'Gợi ý bước đối chiếu khi nhân viên xem một yêu cầu mới.',
    steps: [
      'Mở đơn gốc để kiểm tra trạng thái và chi nhánh.',
      'Đối chiếu thời gian, mẫu, size và số lượng với thông tin trên đơn.',
      'Kiểm tra khả dụng theo dữ liệu của Studio trước khi xác nhận.',
      'Thực hiện xác nhận trong màn hình nghiệp vụ nếu đủ điều kiện.',
    ],
    sources: ['product-scope', 'request-checklist', 'policy-decisions'],
    status: 'Minh họa',
  },
  {
    id: 'payment',
    title: 'Đối chiếu chuyển khoản',
    summary: 'Checklist tham khảo; nguồn ngân hàng và quy tắc xác nhận chưa được nối.',
    steps: [
      'Mở giao dịch và đơn liên quan trong hệ thống Studio.',
      'Đối chiếu nội dung, số tiền và thời điểm với nguồn ngân hàng được Studio chỉ định.',
      'Nếu dữ liệu chưa khớp, để giao dịch ở trạng thái cần kiểm tra theo quy trình đã duyệt.',
      'Chỉ ghi nhận kết quả trong màn hình thanh toán có thẩm quyền.',
    ],
    sources: ['payment-checklist', 'safety-direction'],
    status: 'Cần xác minh',
  },
  {
    id: 'handover',
    title: 'Chuẩn bị giao trang phục',
    summary: 'Gợi ý đối chiếu đơn và bộ đã được hệ thống gán.',
    steps: [
      'Mở đơn gốc và kiểm tra trạng thái hiện tại.',
      'Đối chiếu mã bộ, biến thể và chi nhánh trên đơn.',
      'Kiểm tra trang phục và phụ kiện theo quy trình nội bộ đã được duyệt.',
      'Ghi nhận bàn giao và khoản thu trong màn hình nghiệp vụ.',
    ],
    sources: ['handover-checklist', 'product-scope'],
    status: 'Minh họa',
  },
  {
    id: 'return',
    title: 'Nhận lại và kiểm tra trang phục',
    summary: 'Không tự tính phí, kết luận hư hỏng hoặc xác nhận hoàn cọc.',
    steps: [
      'Mở đơn gốc để xem thời hạn, bộ và phụ kiện đã ghi nhận.',
      'Kiểm tra tình trạng thực tế và ghi nhận theo quy trình của Studio.',
      'Đối chiếu chính sách đã duyệt trước khi quyết toán.',
      'Chỉ xác nhận khoản thu hoặc hoàn trong hệ thống nghiệp vụ.',
    ],
    sources: ['return-checklist', 'policy-decisions'],
    status: 'Cần xác minh',
  },
];

export const opsAgentFixtureAdapter = {
  answer(question: string): OpsAgentReply {
    const normalized = question.toLocaleLowerCase('vi');
    if (/(trả|hoàn|cọc|hư hỏng|hỏng)/u.test(normalized)) {
      return {
        text: 'Checklist demo gợi ý mở đơn gốc, ghi nhận tình trạng thực tế và đối chiếu chính sách đã được Studio duyệt. Quy tắc khấu trừ và hoàn cọc chưa được chốt ở đây; trợ lý không tính tiền hoặc xác nhận hoàn.',
        sourceIds: ['return-checklist', 'policy-decisions'],
      };
    }
    if (/(chuyển khoản|thanh toán|đối soát|giao dịch)/u.test(normalized)) {
      return {
        text: 'Bản demo chỉ gợi ý đối chiếu giao dịch với đơn và nguồn ngân hàng do Studio chỉ định. Chưa có kết nối ngân hàng hay quy tắc xác nhận; hãy kiểm tra và ghi nhận kết quả trong màn hình thanh toán có thẩm quyền.',
        sourceIds: ['payment-checklist', 'safety-direction'],
      };
    }
    if (/(giao|nhận đồ|bàn giao|barcode|mã bộ)/u.test(normalized)) {
      return {
        text: 'Checklist minh họa: mở đơn gốc, đối chiếu mã bộ và chi nhánh, kiểm tra trang phục theo quy trình nội bộ, rồi ghi nhận kết quả trong màn hình nghiệp vụ. Trợ lý không xác nhận đã giao đồ hay đã thu tiền.',
        sourceIds: ['handover-checklist', 'product-scope'],
      };
    }
    if (/(đơn|duyệt|xác nhận|khả dụng|thuê)/u.test(normalized)) {
      return {
        text: 'Hãy mở đơn gốc để đối chiếu trạng thái, chi nhánh, thời gian và lựa chọn trang phục. Khả dụng và chính sách cần được kiểm tra trong hệ thống Studio; nội dung này chỉ là checklist demo, không phải xác nhận đơn.',
        sourceIds: ['request-checklist', 'policy-decisions'],
      };
    }
    return {
      text: 'Bản demo chưa kết nối mô hình hoặc nguồn dữ liệu vận hành nên mình chưa thể trả lời chắc chắn câu hỏi này. Hãy mở màn hình nghiệp vụ hoặc chọn một checklist tham khảo bên dưới.',
      sourceIds: ['product-scope', 'safety-direction'],
    };
  },
};

