import { useState } from 'react';
import type { Navigate } from '../App';
import { Button } from '../components/ui';
import { PageHeading } from '../components/studio';

export function VirtualTryOnPage({
  contextId,
  productId,
  productName,
  go,
}: {
  contextId?: string;
  productId?: string;
  productName?: string;
  go: Navigate;
}) {
  const [started, setStarted] = useState(false);
  const safeContextId = contextId && /^[0-9a-f-]{36}$/i.test(contextId) ? contextId : undefined;
  const frameSource = safeContextId
    ? `/try-on/?embed=studio&studioContext=${encodeURIComponent(safeContextId)}`
    : '/try-on/?embed=studio';

  return (
    <div className="page virtual-try-on-page">
      <PageHeading
        eyebrow="PHÒNG THỬ ĐỒ ẢO"
        title="Thử trang phục với camera"
        description={
          productName
            ? `Đang chuẩn bị mẫu ${productName} để bạn xem thử trên camera.`
            : 'Chọn một mẫu trong bộ sưu tập để thử, hoặc tải ảnh trang phục của bạn.'
        }
        action={
          <Button
            variant="secondary"
            onClick={() =>
              go(productId ? 'detail' : 'catalog', productId ? { id: productId } : undefined)
            }
          >
            ← {productId ? 'Quay lại sản phẩm' : 'Về bộ sưu tập'}
          </Button>
        }
      />

      {!started ? (
        <section className="virtual-try-on-intro" aria-labelledby="virtual-try-on-intro-title">
          <div className="virtual-try-on-intro-mark" aria-hidden="true">
            <span>✦</span>
          </div>
          <div>
            <p className="eyebrow">TRẢI NGHIỆM RIÊNG TƯ</p>
            <h2 id="virtual-try-on-intro-title">Ảnh và video được xử lý ngay trên thiết bị</h2>
            <p>
              Camera chỉ bật khi bạn cho phép. Ảnh mẫu được tách và căn chỉnh trong trình duyệt;
              Studio không nhận video camera hay ảnh bạn chụp.
            </p>
            <ul>
              <li>Đứng trước camera đủ sáng để xem lớp phủ trang phục.</li>
              <li>Kết quả chỉ để tham khảo phom dáng, không thay thế việc thử trực tiếp.</li>
            </ul>
            <Button onClick={() => setStarted(true)}>Mở phòng thử đồ</Button>
          </div>
        </section>
      ) : (
        <section className="virtual-try-on-frame-panel" aria-label="Phòng thử đồ ảo">
          <iframe
            key={frameSource}
            src={frameSource}
            title="Phòng thử đồ ảo của Studio Trang Phục"
            allow="camera; fullscreen"
            allowFullScreen
            referrerPolicy="no-referrer"
          />
        </section>
      )}
    </div>
  );
}
