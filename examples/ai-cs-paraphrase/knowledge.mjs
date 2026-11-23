/**
 * A tiny knowledge base for the "same question, different wording" case.
 * The point is not the dental content — it is that a literal keyword matcher
 * loses the document as soon as the user changes the wording.
 */
export const DOCS = [
  {
    id: 'implant-brush',
    title: '种植牙术后口腔清洁',
    keywords: ['种植牙', '种牙', '刷牙', '漱口', '清洁', '24小时', '术后'],
    answer: '术后 24 小时内不要刷手术区，也不要用力漱口；24 小时后用软毛牙刷轻轻刷，避开缝线。',
  },
  {
    id: 'implant-swelling',
    title: '种植牙术后肿胀',
    keywords: ['种植牙', '种牙', '肿胀', '脸肿', '冰敷', '术后'],
    answer: '术后 48 小时内间断冰敷，每次 15 分钟；肿胀持续加重或伴随发热要及时复诊。',
  },
  {
    id: 'implant-diet',
    title: '种植牙术后饮食',
    keywords: ['种植牙', '种牙', '吃饭', '饮食', '忌口', '术后'],
    answer: '当天吃温凉软食，避免辛辣、烫、硬的食物；一周内不要用手术侧咀嚼。',
  },
];
