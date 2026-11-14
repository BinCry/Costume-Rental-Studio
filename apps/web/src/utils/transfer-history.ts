import { crmDayStamp } from './crm-labels';

/** First history line of a stock transfer created on this screen (sample-data mode). */
export function newTransferHistory(now = new Date()) {
  return [`${crmDayStamp(now)} · Tạo yêu cầu`];
}
