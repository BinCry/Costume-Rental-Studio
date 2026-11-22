import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Button, DetailDialog, EmptyState, Feedback, StatusLabel } from '../components/ui';
import { ImageWithFallback } from '../components/ImageWithFallback';
import {
  ApiClientError,
  apiEnabled,
  getModelReviews,
  getOrderReviewEligibility,
  hasAccessToken,
  listAdminReviews,
  moderateRentalReview,
  saveRentalReview,
  type ModelReviewPage,
  type OrderReviewEligibility,
  type RentalReviewRecord,
} from '../api/client';
import type { CustomerOrder } from '../fixtures/studio';
import { formatVietnamDateTime } from '../utils/date-format';

const reviewStatus = {
  PUBLISHED: { text: 'Đang hiển thị', tone: 'success' as const },
  HIDDEN: { text: 'Đang ẩn', tone: 'neutral' as const },
};

function StarRow({ value, label }: { value: number; label?: string }) {
  return (
    <span className="review-stars" aria-label={label ?? `${value} trên 5 sao`}>
      {'★'.repeat(Math.max(0, Math.min(5, value)))}
      <span>{'☆'.repeat(Math.max(0, 5 - Math.min(5, value)))}</span>
    </span>
  );
}

function RatingPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <fieldset className="review-rating-picker">
      <legend>Chất lượng trang phục</legend>
      <div role="radiogroup" aria-label="Chọn số sao">
        {[1, 2, 3, 4, 5].map((stars) => (
          <button
            key={stars}
            type="button"
            role="radio"
            aria-checked={value === stars}
            aria-label={`${stars} sao`}
            className={stars <= value ? 'is-active' : ''}
            onClick={() => onChange(stars)}
          >
            ★
          </button>
        ))}
      </div>
      <span>{value ? `${value}/5` : 'Chọn số sao'}</span>
    </fieldset>
  );
}

export function CustomerOrderReviews({
  order,
  onSaved,
}: {
  order: CustomerOrder;
  onSaved?: () => void;
}) {
  const eligibleOrder =
    order.returnedAt && ['RETURN_INSPECTION', 'COMPLETED'].includes(order.status);
  const [data, setData] = useState<OrderReviewEligibility>();
  const [reloadKey, setReloadKey] = useState(0);
  const [loadState, setLoadState] = useState<{ requestKey: string; error: string }>({
    requestKey: '',
    error: '',
  });
  const requestKey = `${order.id}:${reloadKey}`;
  const currentData = loadState.requestKey === requestKey ? data : undefined;
  const loading = Boolean(eligibleOrder) && loadState.requestKey !== requestKey;
  const loadError = loadState.requestKey === requestKey ? loadState.error : '';
  const [activeVariantId, setActiveVariantId] = useState('');
  const [stars, setStars] = useState(0);
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [keepMediaIds, setKeepMediaIds] = useState<string[]>([]);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const photosRef = useRef(photos);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');
  const [notice, setNotice] = useState('');
  const activeItem = currentData?.items.find((item) => item.variant.id === activeVariantId);

  const replacePhotos = (files: File[]) => {
    photosRef.current.forEach(({ url }) => URL.revokeObjectURL(url));
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    photosRef.current = next;
    setPhotos(next);
  };
  const removePhoto = (index: number) => {
    const removed = photosRef.current[index];
    if (removed) URL.revokeObjectURL(removed.url);
    const next = photosRef.current.filter((_, itemIndex) => itemIndex !== index);
    photosRef.current = next;
    setPhotos(next);
  };
  useEffect(() => () => photosRef.current.forEach(({ url }) => URL.revokeObjectURL(url)), []);

  useEffect(() => {
    if (!eligibleOrder || !apiEnabled || !hasAccessToken()) return;
    let active = true;
    void getOrderReviewEligibility(order.id)
      .then((value) => {
        if (!active) return;
        setData(value);
        setLoadState({ requestKey, error: '' });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadState({
          requestKey,
          error: error instanceof Error ? error.message : 'Không tải được đánh giá của đơn.',
        });
      });
    return () => {
      active = false;
    };
  }, [eligibleOrder, order.id, requestKey]);

  const beginReview = (variantId: string) => {
    const item = currentData?.items.find((entry) => entry.variant.id === variantId);
    setActiveVariantId(variantId);
    setStars(item?.review?.stars ?? 0);
    setContent(item?.review?.content ?? '');
    setIsAnonymous(item?.review?.isAnonymous ?? true);
    setKeepMediaIds(item?.review?.media.map((media) => media.id) ?? []);
    replacePhotos([]);
    setIssue('');
    setNotice('');
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeItem || stars < 1) {
      setIssue('Chọn số sao trước khi gửi đánh giá.');
      return;
    }
    setBusy(true);
    setIssue('');
    setNotice('');
    try {
      await saveRentalReview({
        orderCode: order.id,
        variantId: activeItem.variant.id,
        reviewId: activeItem.review?.id,
        stars,
        content,
        isAnonymous,
        keepMediaIds,
        photos: photos.map(({ file }) => file),
      });
      setActiveVariantId('');
      replacePhotos([]);
      setNotice('Đánh giá đã được lưu. Cảm ơn bạn đã chia sẻ trải nghiệm.');
      setReloadKey((value) => value + 1);
      onSaved?.();
    } catch (error) {
      setIssue(
        error instanceof ApiClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Chưa gửi được đánh giá. Vui lòng thử lại.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (!eligibleOrder || !apiEnabled || !hasAccessToken()) return null;
  return (
    <section className="order-review-panel" aria-labelledby={`review-order-${order.id}`}>
      <header>
        <div>
          <p className="eyebrow">SAU KHI TRẢ ĐỒ</p>
          <h3 id={`review-order-${order.id}`}>Đánh giá trang phục</h3>
        </div>
        <p>Mỗi mẫu trong đơn có một đánh giá riêng.</p>
      </header>
      {loading ? (
        <p className="review-loading" role="status">
          Đang tải trạng thái đánh giá…
        </p>
      ) : null}
      {loadError ? (
        <Feedback
          tone="danger"
          title="Không tải được trạng thái đánh giá"
          action={
            <Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>
              Thử lại
            </Button>
          }
        >
          {loadError}
        </Feedback>
      ) : null}
      {notice ? (
        <Feedback tone="success" title="Đã lưu đánh giá">
          {notice}
        </Feedback>
      ) : null}
      {currentData?.items.map(({ variant, review }) => (
        <article className="order-review-item" key={variant.id}>
          <div className="order-review-item-copy">
            <strong>{variant.model.name}</strong>
            <span>
              {variant.sizeCode} / {variant.colorCode}
            </span>
            {review ? (
              <span className="order-review-saved">
                <StarRow value={review.stars} /> · Đã đánh giá
              </span>
            ) : (
              <span className="muted">Chưa đánh giá</span>
            )}
          </div>
          {review?.media.length ? (
            <span className="review-photo-count">{review.media.length} ảnh</span>
          ) : null}
          {review?.canEdit || !review ? (
            <Button variant="secondary" onClick={() => beginReview(variant.id)}>
              {review ? 'Sửa đánh giá' : 'Viết đánh giá'}
            </Button>
          ) : (
            <small>Đã hết hạn chỉnh sửa</small>
          )}
        </article>
      ))}
      {activeItem && (
        <DetailDialog
          title={activeItem.review ? 'Sửa đánh giá' : 'Đánh giá trang phục'}
          onClose={() => {
            setActiveVariantId('');
            replacePhotos([]);
          }}
          className="review-form-dialog"
        >
          <form className="review-form" onSubmit={(event) => void save(event)}>
            <p className="review-product-name">
              <strong>{activeItem.variant.model.name}</strong>
              <span>
                {activeItem.variant.sizeCode} / {activeItem.variant.colorCode}
              </span>
            </p>
            <RatingPicker value={stars} onChange={setStars} />
            <label className="review-field-label" htmlFor="rental-review-content">
              Chia sẻ trải nghiệm <span>(không bắt buộc)</span>
            </label>
            <textarea
              id="rental-review-content"
              value={content}
              maxLength={3000}
              rows={5}
              placeholder="Chất liệu, độ vừa vặn hoặc trải nghiệm khi sử dụng…"
              onChange={(event) => setContent(event.target.value)}
            />
            <div className="review-char-count">{content.length}/3000</div>
            <label className="review-field-label" htmlFor="rental-review-photos">
              Ảnh thực tế <span>(JPG, PNG hoặc WebP · tối đa 5 ảnh, 10 MB/ảnh)</span>
            </label>
            <input
              id="rental-review-photos"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                const limit = Math.max(0, 5 - keepMediaIds.length);
                const accepted = selected.filter(
                  (file) =>
                    ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
                    file.size > 0 &&
                    file.size <= 10 * 1024 * 1024,
                );
                replacePhotos(accepted.slice(0, limit));
                const messages = [];
                if (accepted.length < selected.length)
                  messages.push('Chỉ nhận ảnh JPG, PNG hoặc WebP tối đa 10 MB mỗi ảnh.');
                if (accepted.length > limit)
                  messages.push(`Tổng cộng tối đa 5 ảnh; đã thêm ${limit} ảnh mới.`);
                setIssue(messages.join(' '));
                event.target.value = '';
              }}
            />
            {activeItem.review?.media.filter((media) => keepMediaIds.includes(media.id)).length ? (
              <div className="review-photo-grid" aria-label="Ảnh đã đăng">
                {activeItem.review.media
                  .filter((media) => keepMediaIds.includes(media.id))
                  .map((media) => (
                    <figure key={media.id}>
                      <ImageWithFallback
                        src={media.mediaUrl ?? ''}
                        alt="Ảnh đã gửi trong đánh giá"
                      />
                      <button
                        type="button"
                        aria-label="Xóa ảnh khỏi đánh giá"
                        onClick={() =>
                          setKeepMediaIds((ids) => ids.filter((id) => id !== media.id))
                        }
                      >
                        ×
                      </button>
                    </figure>
                  ))}
              </div>
            ) : null}
            {photos.length ? (
              <div className="review-photo-grid" aria-label="Ảnh mới đã chọn">
                {photos.map(({ file, url }, index) => (
                  <figure key={`${file.name}-${file.lastModified}-${index}`}>
                    <img src={url} alt={`Ảnh mới ${index + 1}: ${file.name}`} />
                    <button
                      type="button"
                      aria-label={`Bỏ ảnh ${file.name}`}
                      onClick={() => removePhoto(index)}
                    >
                      ×
                    </button>
                  </figure>
                ))}
              </div>
            ) : null}
            {photos.length ? (
              <p className="field-hint">Đã chọn {photos.length} ảnh mới. Mỗi ảnh tối đa 10 MB.</p>
            ) : null}
            <label className="review-anonymous-control">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(event) => setIsAnonymous(event.target.checked)}
              />{' '}
              Ẩn tên của tôi
            </label>
            {issue ? (
              <Feedback tone="danger" title="Chưa lưu được đánh giá">
                {issue}
              </Feedback>
            ) : null}
            <div className="review-form-actions">
              <Button type="button" variant="secondary" onClick={() => setActiveVariantId('')}>
                Để sau
              </Button>
              <Button type="submit" loading={busy}>
                Lưu đánh giá
              </Button>
            </div>
          </form>
        </DetailDialog>
      )}
    </section>
  );
}

export function ProductReviews({ modelId, enabled }: { modelId: string; enabled: boolean }) {
  const [page, setPage] = useState(1);
  const [rating, setRating] = useState(0);
  const [hasPhotos, setHasPhotos] = useState(false);
  const [data, setData] = useState<ModelReviewPage>();
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedQueryKey, setLoadedQueryKey] = useState('');
  const [errorState, setErrorState] = useState<{ queryKey: string; message: string }>();
  const queryKey = `${modelId}:${page}:${rating}:${Number(hasPhotos)}:${reloadKey}`;
  const loading = enabled && loadedQueryKey !== queryKey;
  const error = errorState?.queryKey === queryKey ? errorState.message : '';
  const [gallery, setGallery] = useState<{
    images: { url: string; alt: string }[];
    index: number;
  }>();

  useEffect(() => {
    if (!enabled || !modelId) return;
    let active = true;
    void getModelReviews(modelId, {
      page,
      pageSize: 8,
      rating: rating > 0 ? rating : undefined,
      hasPhotos: hasPhotos || undefined,
    })
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoadedQueryKey(queryKey);
        setErrorState(undefined);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setLoadedQueryKey(queryKey);
        setErrorState({
          queryKey,
          message: cause instanceof Error ? cause.message : 'Không tải được đánh giá.',
        });
      });
    return () => {
      active = false;
    };
  }, [enabled, hasPhotos, modelId, page, queryKey, rating]);

  const galleryImages = useMemo(() => gallery?.images ?? [], [gallery]);
  const currentData = loadedQueryKey === queryKey ? data : undefined;
  if (!enabled) return null;
  return (
    <section className="product-reviews" aria-labelledby="product-reviews-title">
      <header className="product-reviews-header">
        <div>
          <p className="eyebrow">TRẢI NGHIỆM THỰC TẾ</p>
          <h2 id="product-reviews-title">Đánh giá từ khách thuê</h2>
        </div>
        {currentData && currentData.summary.count > 0 ? (
          <div className="review-summary">
            <StarRow
              value={Math.round(currentData.summary.average)}
              label={`${currentData.summary.average.toFixed(1)} trên 5 sao`}
            />
            <strong>{currentData.summary.average.toFixed(1)}</strong>
            <span>{currentData.summary.count} đánh giá</span>
          </div>
        ) : null}
      </header>
      {currentData?.summary.count ? (
        <div className="review-distribution" aria-label="Phân bố đánh giá">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count =
              currentData.summary.distribution.find((entry) => entry.stars === stars)?.count ?? 0;
            return (
              <button
                type="button"
                key={stars}
                onClick={() => {
                  setRating(rating === stars ? 0 : stars);
                  setPage(1);
                }}
                aria-pressed={rating === stars}
              >
                <span>{stars} ★</span>
                <span className="review-meter">
                  <i
                    style={{
                      width: `${currentData.summary.count ? (count / currentData.summary.count) * 100 : 0}%`,
                    }}
                  />
                </span>
                <small>{count}</small>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="review-filters">
        <label>
          Đánh giá
          <select
            value={rating || ''}
            onChange={(event) => {
              setRating(Number(event.target.value));
              setPage(1);
            }}
          >
            <option value="">Tất cả</option>
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {value} sao
              </option>
            ))}
          </select>
        </label>
        <label className="review-photo-filter">
          <input
            type="checkbox"
            checked={hasPhotos}
            onChange={(event) => {
              setHasPhotos(event.target.checked);
              setPage(1);
            }}
          />{' '}
          Có ảnh
        </label>
      </div>
      {loading ? <p role="status">Đang tải đánh giá…</p> : null}
      {error ? (
        <Feedback
          tone="warning"
          title="Chưa tải được đánh giá"
          action={
            <Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>
              Thử lại
            </Button>
          }
        >
          {error}
        </Feedback>
      ) : null}
      {!loading && !error && currentData?.items.length ? (
        <div className="product-review-list">
          {currentData.items.map((review) => (
            <article key={review.id} className="product-review-item">
              <div className="product-review-item-head">
                <StarRow value={review.stars} />
                <time dateTime={review.createdAt}>{formatVietnamDateTime(review.createdAt)}</time>
              </div>
              <p className="product-review-author">
                {review.authorName}
                <span className="review-verified-badge">Đã thuê</span>
              </p>
              {review.content ? (
                <p className="product-review-content">{review.content}</p>
              ) : (
                <p className="muted">Khách chỉ chấm sao, không để lại nội dung.</p>
              )}
              <p className="product-review-variant">
                Đã thuê {review.variant.sizeCode} / {review.variant.colorCode}
              </p>
              {review.media.length ? (
                <div className="review-photo-grid">
                  {review.media.map((photo, index) => (
                    <button
                      type="button"
                      key={photo.id}
                      aria-label={`Xem ảnh ${index + 1} trong đánh giá`}
                      onClick={() => {
                        const images = review.media.flatMap((item, mediaIndex) =>
                          item.mediaUrl
                            ? [{ url: item.mediaUrl, alt: `Ảnh đánh giá ${mediaIndex + 1}` }]
                            : [],
                        );
                        const imageIndex = images.findIndex(
                          (image) => image.url === photo.mediaUrl,
                        );
                        if (imageIndex >= 0) setGallery({ images, index: imageIndex });
                      }}
                    >
                      <ImageWithFallback src={photo.mediaUrl ?? ''} alt="Ảnh khách thuê gửi" />
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {currentData.pagination.totalPages > 1 ? (
            <nav className="review-pagination" aria-label="Trang đánh giá">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Trước
              </Button>
              <span>
                Trang {page}/{currentData.pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= currentData.pagination.totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Tiếp
              </Button>
            </nav>
          ) : null}
        </div>
      ) : !loading && !error ? (
        <EmptyState
          title={currentData?.summary.count ? 'Không có đánh giá phù hợp' : 'Chưa có đánh giá'}
        >
          {currentData?.summary.count
            ? 'Hãy thử đổi bộ lọc.'
            : 'Bạn có thể là người đầu tiên đánh giá mẫu này sau khi thuê.'}
        </EmptyState>
      ) : null}
      {gallery && galleryImages.length ? (
        <DetailDialog
          title="Ảnh đánh giá"
          onClose={() => setGallery(undefined)}
          className="review-gallery-dialog"
        >
          <div className="review-gallery-view">
            <div className="review-gallery-image">
              <ImageWithFallback
                src={galleryImages[gallery.index]?.url ?? ''}
                alt={galleryImages[gallery.index]?.alt ?? 'Ảnh đánh giá'}
              />
            </div>
            <div>
              <Button
                variant="secondary"
                disabled={gallery.index <= 0}
                onClick={() => setGallery({ ...gallery, index: gallery.index - 1 })}
              >
                Ảnh trước
              </Button>
              <span>
                {gallery.index + 1} / {galleryImages.length}
              </span>
              <Button
                variant="secondary"
                disabled={gallery.index >= galleryImages.length - 1}
                onClick={() => setGallery({ ...gallery, index: gallery.index + 1 })}
              >
                Ảnh sau
              </Button>
            </div>
          </div>
        </DetailDialog>
      ) : null}
    </section>
  );
}

export function AdminReviewsPage({ canManage }: { canManage: boolean }) {
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState<{
    items: RentalReviewRecord[];
    pagination?: { page: number; totalPages: number; totalItems: number };
  }>();
  const [selected, setSelected] = useState<RentalReviewRecord>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorState, setErrorState] = useState<{ queryKey: string; message: string }>();
  const [revision, setRevision] = useState(0);
  const queryKey = `${page}:${search}:${status}:${revision}`;
  const error = errorState?.queryKey === queryKey ? errorState.message : '';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchDraft.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => {
    if (!apiEnabled || !hasAccessToken()) return;
    let active = true;
    void listAdminReviews({
      page,
      pageSize: 20,
      search,
      status: status ? (status as 'PUBLISHED' | 'HIDDEN') : undefined,
    })
      .then((result) => {
        if (!active) return;
        setData(result);
        setErrorState(undefined);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setErrorState({
          queryKey,
          message: cause instanceof Error ? cause.message : 'Không tải được danh sách đánh giá.',
        });
      });
    return () => {
      active = false;
    };
  }, [page, queryKey, revision, search, status]);

  const moderate = async (nextStatus: 'PUBLISHED' | 'HIDDEN') => {
    if (!selected || !canManage) return;
    setBusy(true);
    setErrorState(undefined);
    try {
      await moderateRentalReview(selected.id, nextStatus, note);
      setSelected(undefined);
      setNote('');
      setRevision((value) => value + 1);
    } catch (cause) {
      setErrorState({
        queryKey,
        message:
          cause instanceof Error ? cause.message : 'Không cập nhật được trạng thái đánh giá.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page admin-reviews-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PHẢN HỒI KHÁCH THUÊ</p>
          <h1>Đánh giá trang phục</h1>
        </div>
      </div>
      <section className="panel admin-reviews-panel">
        <div className="review-admin-filters">
          <label>
            Tìm khách, mẫu hoặc nội dung
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Nhập từ khóa"
            />
          </label>
          <label>
            Trạng thái
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả</option>
              <option value="PUBLISHED">Đang hiển thị</option>
              <option value="HIDDEN">Đang ẩn</option>
            </select>
          </label>
          <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
            Tải lại
          </Button>
        </div>
        {error ? (
          <Feedback
            tone="danger"
            title="Không hoàn thành được yêu cầu"
            action={
              <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
                Thử lại
              </Button>
            }
          >
            {error}
          </Feedback>
        ) : null}
        {data?.items.length ? (
          <>
            <div className="order-table-scroll">
              <table className="order-table admin-reviews-table">
                <thead>
                  <tr>
                    <th>Mẫu</th>
                    <th>Đánh giá</th>
                    <th>Khách</th>
                    <th>Ngày</th>
                    <th>Ảnh</th>
                    <th>Trạng thái</th>
                    <th>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((review) => (
                    <tr key={review.id}>
                      <td>
                        <strong>{review.variant.model.name}</strong>
                        <small>
                          {review.variant.sizeCode} / {review.variant.colorCode}
                        </small>
                      </td>
                      <td>
                        <StarRow value={review.stars} />
                      </td>
                      <td>{review.authorName}</td>
                      <td>{formatVietnamDateTime(review.createdAt)}</td>
                      <td>{review.media.length || '—'}</td>
                      <td>
                        <StatusLabel {...reviewStatus[review.status]} />
                      </td>
                      <td>
                        <Button
                          variant="quiet"
                          onClick={() => {
                            setSelected(review);
                            setNote(review.moderationNote ?? '');
                          }}
                        >
                          Chi tiết
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="review-pagination" aria-label="Trang đánh giá quản trị">
              <span>
                {data.pagination?.totalItems ?? data.items.length} đánh giá · trang {page}/
                {data.pagination?.totalPages ?? 1}
              </span>
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Trước
              </Button>
              <Button
                variant="secondary"
                disabled={page >= (data.pagination?.totalPages ?? 1)}
                onClick={() => setPage((value) => value + 1)}
              >
                Tiếp
              </Button>
            </nav>
          </>
        ) : !error ? (
          <EmptyState
            title={search || status ? 'Không tìm thấy đánh giá phù hợp' : 'Chưa có đánh giá'}
            action={
              search || status ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearchDraft('');
                    setSearch('');
                    setStatus('');
                    setPage(1);
                  }}
                >
                  Xóa bộ lọc
                </Button>
              ) : undefined
            }
          >
            {search || status
              ? 'Thử từ khóa khác hoặc xóa bộ lọc để xem toàn bộ đánh giá.'
              : undefined}
          </EmptyState>
        ) : null}
      </section>
      {selected ? (
        <DetailDialog
          title="Chi tiết đánh giá"
          onClose={() => setSelected(undefined)}
          className="admin-review-dialog"
        >
          <div className="admin-review-detail">
            <div className="admin-review-detail-title">
              <div>
                <StarRow value={selected.stars} />
                <h3>{selected.variant.model.name}</h3>
                <p>
                  {selected.variant.sizeCode} / {selected.variant.colorCode} · Đơn{' '}
                  {selected.order.orderCode}
                </p>
              </div>
              <StatusLabel {...reviewStatus[selected.status]} />
            </div>
            <dl>
              <div>
                <dt>Người đăng</dt>
                <dd>{selected.authorName}</dd>
              </div>
              <div>
                <dt>Ngày gửi</dt>
                <dd>{formatVietnamDateTime(selected.createdAt)}</dd>
              </div>
              <div>
                <dt>Hiển thị</dt>
                <dd>{selected.isAnonymous ? 'Ẩn danh' : 'Hiện tên khách'}</dd>
              </div>
            </dl>
            <p className="admin-review-content">
              {selected.content?.trim()
                ? selected.content
                : 'Khách chỉ chấm sao, không để lại nội dung.'}
            </p>
            {selected.media.length ? (
              <div className="review-photo-grid">
                {selected.media.map((photo) => (
                  <a key={photo.id} href={photo.mediaUrl} target="_blank" rel="noreferrer">
                    <ImageWithFallback
                      src={photo.mediaUrl ?? ''}
                      alt="Ảnh khách gửi trong đánh giá"
                    />
                  </a>
                ))}
              </div>
            ) : (
              <p className="muted">Không có ảnh đính kèm.</p>
            )}
            <label className="review-field-label" htmlFor="review-moderation-note">
              Ghi chú quản trị <span>(không bắt buộc)</span>
            </label>
            <textarea
              id="review-moderation-note"
              value={note}
              maxLength={1000}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
            />
            {error ? (
              <Feedback tone="danger" title="Chưa cập nhật được">
                {error}
              </Feedback>
            ) : null}
            <div className="review-form-actions">
              {selected.status === 'PUBLISHED' ? (
                <Button
                  variant="danger"
                  loading={busy}
                  disabled={!canManage}
                  onClick={() => void moderate('HIDDEN')}
                >
                  Ẩn đánh giá
                </Button>
              ) : (
                <Button
                  loading={busy}
                  disabled={!canManage}
                  onClick={() => void moderate('PUBLISHED')}
                >
                  Khôi phục đánh giá
                </Button>
              )}
              <Button variant="secondary" onClick={() => setSelected(undefined)}>
                Đóng
              </Button>
            </div>
          </div>
        </DetailDialog>
      ) : null}
    </div>
  );
}
